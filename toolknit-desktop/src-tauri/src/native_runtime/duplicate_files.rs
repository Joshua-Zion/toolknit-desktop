use super::*;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{atomic::Ordering, Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

const FILE_LIMIT: usize = 100_000;
const RESULT_LIMIT: usize = FILE_LIMIT;
const TTL: Duration = Duration::from_secs(1800);
#[path = "duplicate_files/protection.rs"]
mod protection;
const COMMON_EXTENSIONS: &[&str] = &[
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv", "rtf", "odt", "jpg",
    "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "svg", "heic", "mp3", "wav", "flac", "aac",
    "m4a", "ogg", "wma", "mp4", "mkv", "mov", "avi", "webm", "m4v", "wmv", "zip", "7z", "rar",
    "tar", "gz", "bz2",
];

fn extension_filter(values: Option<Vec<String>>) -> Result<HashSet<String>, String> {
    let values = values.unwrap_or_else(|| COMMON_EXTENSIONS.iter().map(|v| (*v).into()).collect());
    if values.is_empty() || values.len() > COMMON_EXTENSIONS.len() {
        return Err("Choose at least one supported file type".into());
    }
    values
        .into_iter()
        .map(|value| {
            let value = value.to_ascii_lowercase();
            if COMMON_EXTENSIONS.contains(&value.as_str()) {
                Ok(value)
            } else {
                Err("Unsupported file type".into())
            }
        })
        .collect()
}

#[derive(Clone, Default, serde::Serialize)]
pub(crate) struct DuplicateProgress {
    stage: String,
    scanned_files: usize,
    skipped: usize,
    checked_files: usize,
    candidate_files: usize,
    read_bytes: u64,
    truncated: bool,
    limit_reason: String,
    filtered_files: usize,
    visited_entries: usize,
    elapsed_ms: u64,
    stage_ms: BTreeMap<String, u64>,
    cleanup_stage: String,
    cleanup_total: usize,
    cleanup_verified: usize,
    cleanup_completed: usize,
    cleanup_succeeded: usize,
    cleanup_failed: usize,
    cleanup_bytes: u64,
    cleanup_current: String,
    cleanup_elapsed_ms: u64,
}

#[derive(Clone, serde::Serialize)]
pub(crate) struct DuplicateFile {
    path: String,
    name: String,
    size_bytes: u64,
    modified_at: Option<u64>,
}

#[derive(Clone, serde::Serialize)]
pub(crate) struct DuplicateGroup {
    id: String,
    files: Vec<DuplicateFile>,
}

#[derive(serde::Serialize)]
pub(crate) struct DuplicateScanResult {
    scan_id: String,
    root_path: String,
    groups: Vec<DuplicateGroup>,
    progress: DuplicateProgress,
}

#[derive(serde::Deserialize)]
pub(crate) struct DuplicateRemoval {
    group_id: String,
    keep_path: String,
    paths: Vec<String>,
}

#[derive(serde::Serialize)]
pub(crate) struct DuplicateRemovalResult {
    moved_bytes: u64,
    items: Vec<RecycleBinMoveItem>,
    cancelled: bool,
    unprocessed: usize,
    elapsed_ms: u64,
}

struct Session {
    created: Instant,
    guard: Arc<cleanup_guard::ScanSession>,
    progress: Mutex<DuplicateProgress>,
    groups: Mutex<Vec<DuplicateGroup>>,
    operation: Mutex<()>,
    cleanup_started: Mutex<Option<Instant>>,
}

// Separate registry prevents the generic cleanup command bypassing keeper validation.
static SESSIONS: OnceLock<Mutex<HashMap<String, Arc<Session>>>> = OnceLock::new();
fn sessions() -> &'static Mutex<HashMap<String, Arc<Session>>> {
    SESSIONS.get_or_init(Default::default)
}
fn valid_id(id: &str) -> bool {
    (16..=80).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}
fn fresh() -> Arc<Session> {
    Arc::new(Session {
        created: Instant::now(),
        guard: cleanup_guard::fresh_session(),
        progress: Mutex::new(DuplicateProgress::default()),
        groups: Mutex::new(Vec::new()),
        operation: Mutex::new(()),
        cleanup_started: Mutex::new(None),
    })
}
fn begin(id: &str) -> Result<Arc<Session>, String> {
    if !valid_id(id) {
        return Err("Invalid scan session".into());
    }
    let mut registry = sessions().lock().map_err(|_| "Scan state unavailable")?;
    registry.retain(|_, s| s.created.elapsed() < TTL);
    if registry.contains_key(id) {
        return Err("Scan session already used or cancelled".into());
    }
    if registry.len() >= 4096
        || registry
            .values()
            .filter(|s| !s.guard.cancelled.load(Ordering::SeqCst))
            .count()
            >= 32
    {
        return Err("Too many scan sessions; close older tools and retry".into());
    }
    let session = fresh();
    registry.insert(id.into(), session.clone());
    Ok(session)
}
fn get(id: &str) -> Result<Arc<Session>, String> {
    let registry = sessions().lock().map_err(|_| "Scan state unavailable")?;
    let session = registry
        .get(id)
        .cloned()
        .ok_or("Scan session expired; scan again")?;
    session.guard.check()?;
    Ok(session)
}
fn cancel(id: &str) {
    if !valid_id(id) {
        return;
    }
    if let Ok(mut registry) = sessions().lock() {
        registry.retain(|_, s| s.created.elapsed() < TTL);
        if !registry.contains_key(id) && registry.len() < 4096 {
            registry.insert(id.into(), fresh());
        }
        if let Some(s) = registry.get(id) {
            s.guard.cancel();
            if let Ok(mut groups) = s.groups.lock() {
                groups.clear();
            }
        }
    }
}
fn read_file(path: &Path) -> Result<File, String> {
    cleanup_guard::reject_links(path)?;
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Deny concurrent writes/deletes while comparing, especially on the keeper.
        options.share_mode(1);
    }
    let file = options
        .open(path)
        .map_err(|_| "Cannot read file; it may be in use")?;
    let metadata = file.metadata().map_err(|_| "Cannot inspect file")?;
    if !metadata.is_file()
        || cleanup_guard::protected_attributes(&metadata, false)
        || cleanup_guard::protected_path(path)
    {
        return Err("Protected file".into());
    }
    cleanup_guard::file_identity(path)?;
    Ok(file)
}
fn digest(path: &Path, partial: bool, s: &Session) -> Result<[u8; 32], String> {
    let mut file = read_file(path)?;
    let length = file.metadata().map_err(|_| "Cannot inspect file")?.len();
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    if partial && length > 8192 {
        for offset in [0, length - 4096] {
            s.guard.check()?;
            file.seek(SeekFrom::Start(offset))
                .map_err(|_| "Cannot seek file")?;
            file.read_exact(&mut buffer[..4096])
                .map_err(|_| "Cannot read file")?;
            hash.update(&buffer[..4096]);
            s.progress.lock().unwrap().read_bytes += 4096;
        }
    } else {
        loop {
            s.guard.check()?;
            let count = file.read(&mut buffer).map_err(|_| "Cannot read file")?;
            if count == 0 {
                break;
            }
            hash.update(&buffer[..count]);
            s.progress.lock().unwrap().read_bytes += count as u64;
        }
    }
    Ok(hash.finalize().into())
}
fn equal_files(a: &mut File, b: &mut File, s: &Session) -> Result<bool, String> {
    if a.metadata().map_err(|_| "Cannot inspect file")?.len()
        != b.metadata().map_err(|_| "Cannot inspect file")?.len()
    {
        return Ok(false);
    }
    a.seek(SeekFrom::Start(0)).map_err(|_| "Cannot seek file")?;
    b.seek(SeekFrom::Start(0)).map_err(|_| "Cannot seek file")?;
    let mut left = [0u8; 65536];
    let mut right = [0u8; 65536];
    loop {
        s.guard.check()?;
        let count = a.read(&mut left).map_err(|_| "Cannot read keeper")?;
        if count == 0 {
            return Ok(true);
        }
        b.read_exact(&mut right[..count])
            .map_err(|_| "Cannot read duplicate")?;
        s.progress.lock().unwrap().read_bytes += (count as u64) * 2;
        if left[..count] != right[..count] {
            return Ok(false);
        }
    }
}
fn bucket_hash(
    files: Vec<PathBuf>,
    partial: bool,
    s: &Session,
    cache: &Mutex<HashMap<PathBuf, [u8; 32]>>,
) -> Result<Vec<Vec<PathBuf>>, String> {
    let buckets = Mutex::new(BTreeMap::<[u8; 32], Vec<PathBuf>>::new());
    let next = std::sync::atomic::AtomicUsize::new(0);
    // Two readers bound disk pressure; small buckets stay on the caller thread.
    let workers = if files.len() >= 16 { 2 } else { 1 };
    let work = || -> Result<(), String> {
        loop {
            s.guard.check()?;
            let index = next.fetch_add(1, Ordering::Relaxed);
            let Some(path) = files.get(index) else {
                break;
            };
            let cached = if partial {
                None
            } else {
                cache.lock().unwrap().get(path).copied()
            };
            let outcome = cached.map(Ok).unwrap_or_else(|| digest(path, partial, s));
            match outcome {
                Ok(hash) => {
                    if partial
                        && std::fs::metadata(path)
                            .map(|m| m.len() <= 8192)
                            .unwrap_or(false)
                    {
                        cache.lock().unwrap().insert(path.clone(), hash);
                    }
                    buckets
                        .lock()
                        .unwrap()
                        .entry(hash)
                        .or_default()
                        .push(path.clone());
                }
                Err(error) => {
                    s.guard.check()?;
                    let _ = error;
                    s.progress.lock().unwrap().skipped += 1;
                }
            }
            s.progress.lock().unwrap().checked_files += 1;
        }
        Ok(())
    };
    if workers == 1 {
        work()?;
    } else {
        std::thread::scope(|scope| {
            let handles: Vec<_> = (0..workers).map(|_| scope.spawn(&work)).collect();
            for handle in handles {
                handle.join().map_err(|_| "Hash worker failed")??;
            }
            Ok::<_, String>(())
        })?;
    }
    Ok(buckets
        .into_inner()
        .unwrap()
        .into_values()
        .filter(|v| v.len() > 1)
        .collect())
}
#[cfg(test)]
fn scan(roots: &[PathBuf], recursive: bool, s: &Session) -> Result<Vec<DuplicateGroup>, String> {
    scan_filtered(roots, recursive, s, None, &[])
}
fn scan_filtered(
    roots: &[PathBuf],
    recursive: bool,
    s: &Session,
    extensions: Option<&HashSet<String>>,
    installed: &[PathBuf],
) -> Result<Vec<DuplicateGroup>, String> {
    scan_with_limits(
        roots,
        recursive,
        s,
        extensions,
        installed,
        FILE_LIMIT,
        RESULT_LIMIT,
    )
}
fn scan_with_limits(
    roots: &[PathBuf],
    recursive: bool,
    s: &Session,
    extensions: Option<&HashSet<String>>,
    installed: &[PathBuf],
    file_limit: usize,
    result_limit: usize,
) -> Result<Vec<DuplicateGroup>, String> {
    let started = Instant::now();
    let mut stage_started = started;
    s.progress.lock().unwrap().stage = "walking".into();
    let mut sizes: BTreeMap<u64, Vec<(PathBuf, std::fs::Metadata)>> = BTreeMap::new();
    let mut stack = Vec::with_capacity(roots.len());
    for root in roots {
        s.guard.set_root(root);
        stack.push(root.clone());
    }
    let mut visited = 0;
    let mut protected_dirs = 0;
    'walk: while let Some(directory) = stack.pop() {
        s.guard.check()?;
        if cleanup_guard::reject_links(&directory).is_err()
            || installed
                .iter()
                .any(|root| protection::contains(root, &directory))
        {
            s.progress.lock().unwrap().skipped += 1;
            continue;
        }
        let entries = match std::fs::read_dir(&directory) {
            Ok(v) => v,
            Err(_) => {
                s.progress.lock().unwrap().skipped += 1;
                continue;
            }
        };
        for entry in entries {
            s.guard.check()?;
            visited += 1;
            s.progress.lock().unwrap().visited_entries = visited;
            let Ok(entry) = entry else {
                s.progress.lock().unwrap().skipped += 1;
                continue;
            };
            let path = entry.path();
            let metadata = std::fs::symlink_metadata(&path);
            let Ok(metadata) = metadata else {
                s.progress.lock().unwrap().skipped += 1;
                continue;
            };
            if metadata.is_file() {
                let allowed = extensions
                    .map(|list| {
                        path.extension()
                            .and_then(|v| v.to_str())
                            .is_some_and(|v| list.contains(&v.to_ascii_lowercase()))
                    })
                    .unwrap_or(true);
                if metadata.len() == 0 || !allowed {
                    s.progress.lock().unwrap().filtered_files += 1;
                    continue;
                }
            }
            if cleanup_guard::protected_path(&path)
                || cleanup_guard::protected_attributes(&metadata, metadata.is_dir())
            {
                s.progress.lock().unwrap().skipped += 1;
                continue;
            }
            if metadata.is_dir() {
                if should_skip_cleanup_dir(&path, &directory, &mut protected_dirs)
                    || installed
                        .iter()
                        .any(|root| protection::contains(root, &path))
                {
                    s.progress.lock().unwrap().skipped += 1;
                } else if recursive {
                    stack.push(path);
                }
                continue;
            }
            if !metadata.is_file() {
                continue;
            }
            if s.progress.lock().unwrap().scanned_files >= file_limit {
                s.progress.lock().unwrap().truncated = true;
                s.progress.lock().unwrap().limit_reason = "files".into();
                break 'walk;
            }
            sizes
                .entry(metadata.len())
                .or_default()
                .push((path, metadata));
            s.progress.lock().unwrap().scanned_files += 1;
        }
    }
    s.progress.lock().unwrap().visited_entries = visited;
    let mut candidates = Vec::new();
    for files in sizes.into_values().filter(|v| v.len() > 1) {
        let mut recorded = Vec::with_capacity(files.len());
        for (path, metadata) in files {
            s.guard.check()?;
            if let Ok(identity) = cleanup_guard::file_identity(&path) {
                s.guard.record(&path, &metadata, identity);
                recorded.push(path);
            } else {
                s.progress.lock().unwrap().skipped += 1;
            }
        }
        if recorded.len() > 1 {
            candidates.push(recorded);
        }
    }
    let cache = Mutex::new(HashMap::new());
    s.progress
        .lock()
        .unwrap()
        .stage_ms
        .insert("walking".into(), stage_started.elapsed().as_millis() as u64);
    stage_started = Instant::now();
    s.progress.lock().unwrap().candidate_files = candidates.iter().map(Vec::len).sum();
    s.progress.lock().unwrap().stage = "sampling".into();
    let mut sampled = Vec::new();
    for files in candidates {
        sampled.extend(bucket_hash(files, true, s, &cache)?);
    }
    s.progress.lock().unwrap().stage_ms.insert(
        "sampling".into(),
        stage_started.elapsed().as_millis() as u64,
    );
    stage_started = Instant::now();
    s.progress.lock().unwrap().stage = "hashing".into();
    s.progress.lock().unwrap().checked_files = 0;
    s.progress.lock().unwrap().candidate_files = sampled.iter().map(Vec::len).sum();
    let mut hashed = Vec::new();
    for files in sampled {
        hashed.extend(bucket_hash(files, false, s, &cache)?);
    }
    s.progress
        .lock()
        .unwrap()
        .stage_ms
        .insert("hashing".into(), stage_started.elapsed().as_millis() as u64);
    stage_started = Instant::now();
    s.guard.finish();
    s.progress.lock().unwrap().stage = "comparing".into();
    s.progress.lock().unwrap().checked_files = 0;
    s.progress.lock().unwrap().candidate_files = hashed.iter().map(Vec::len).sum();
    let mut groups = Vec::new();
    let mut result_count = 0;
    for mut files in hashed {
        files.sort();
        let (verified, limited) =
            verify_duplicates(files, s, result_limit.saturating_sub(result_count))?;
        for bucket in verified {
            let mut members = Vec::new();
            for path in bucket {
                let Ok(metadata) = std::fs::metadata(&path) else {
                    continue;
                };
                members.push(DuplicateFile {
                    name: path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into(),
                    path: cleanup_display_path(&path),
                    size_bytes: metadata.len(),
                    modified_at: metadata
                        .modified()
                        .ok()
                        .and_then(|v| v.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|v| v.as_secs()),
                });
            }
            if members.len() > 1 {
                result_count += members.len();
                groups.push(DuplicateGroup {
                    id: format!("group-{}", groups.len()),
                    files: members,
                });
            }
        }
        if limited {
            let mut p = s.progress.lock().unwrap();
            p.truncated = true;
            p.limit_reason = "results".into();
            break;
        }
    }
    s.guard.check()?;
    *s.groups.lock().unwrap() = groups.clone();
    s.progress.lock().unwrap().stage = "done".into();
    s.progress.lock().unwrap().stage_ms.insert(
        "comparing".into(),
        stage_started.elapsed().as_millis() as u64,
    );
    s.progress.lock().unwrap().elapsed_ms = started.elapsed().as_millis() as u64;
    Ok(groups)
}

fn verify_duplicates(
    files: Vec<PathBuf>,
    s: &Session,
    remaining: usize,
) -> Result<(Vec<Vec<PathBuf>>, bool), String> {
    let mut verified: Vec<(File, Vec<PathBuf>)> = Vec::new();
    let mut confirmed = 0;
    let mut limited = false;
    for path in files {
        s.guard.check()?;
        s.progress.lock().unwrap().checked_files += 1;
        if s.guard.validate(&cleanup_display_path(&path)).is_err() {
            s.progress.lock().unwrap().skipped += 1;
            continue;
        }
        let Ok(mut file) = read_file(&path) else {
            s.progress.lock().unwrap().skipped += 1;
            continue;
        };
        let mut matched = false;
        for (reference, bucket) in &mut verified {
            if equal_files(reference, &mut file, s)? {
                // A singleton is not a duplicate result until its second match.
                let added = if bucket.len() == 1 { 2 } else { 1 };
                if confirmed + added > remaining {
                    limited = true;
                } else {
                    confirmed += added;
                    bucket.push(path.clone());
                }
                matched = true;
                break;
            }
        }
        if limited {
            break;
        }
        if !matched {
            verified.push((file, vec![path]));
        }
    }
    Ok((
        verified
            .into_iter()
            .filter(|(_, paths)| paths.len() > 1)
            .map(|(_, paths)| paths)
            .collect(),
        limited,
    ))
}

fn validate_plan(s: &Session, plans: &[DuplicateRemoval]) -> Result<(), String> {
    s.guard.check()?;
    let groups = s.groups.lock().map_err(|_| "Scan state unavailable")?;
    let group_index: HashMap<_, _> = groups
        .iter()
        .map(|group| (group.id.as_str(), group))
        .collect();
    let mut selected = HashSet::new();
    let mut used_groups = HashSet::new();
    for plan in plans {
        if !used_groups.insert(&plan.group_id) {
            return Err("Repeated duplicate group".into());
        }
        let group = group_index
            .get(plan.group_id.as_str())
            .ok_or("Unknown duplicate group")?;
        let members: HashSet<_> = group.files.iter().map(|file| file.path.as_str()).collect();
        if !members.contains(plan.keep_path.as_str()) || plan.paths.is_empty() {
            return Err("A keeper is required".into());
        }
        for path in &plan.paths {
            if path == &plan.keep_path || !members.contains(path.as_str()) || !selected.insert(path)
            {
                return Err("Each duplicate group must preserve a file".into());
            }
        }
    }
    if selected.is_empty() || selected.len() > RESULT_LIMIT {
        return Err("Invalid cleanup selection".into());
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn fixed_drive_roots() -> Result<Vec<PathBuf>, String> {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{GetDriveTypeW, GetLogicalDrives};

    let mask = unsafe { GetLogicalDrives() };
    if mask == 0 {
        return Err("Cannot enumerate fixed drives".into());
    }
    let mut roots = Vec::new();
    for index in 0..26 {
        if mask & (1 << index) == 0 {
            continue;
        }
        let letter = (b'A' + index as u8) as char;
        let display = format!("{}:\\", letter);
        let wide: Vec<u16> = display.encode_utf16().chain([0]).collect();
        if unsafe { GetDriveTypeW(PCWSTR(wide.as_ptr())) } != 3 {
            continue;
        }
        if let Ok(root) = canonical_fixed_drive_root(&display) {
            roots.push(root);
        }
    }
    if roots.is_empty() {
        return Err("No accessible fixed drives were found".into());
    }
    Ok(roots)
}

#[cfg(not(target_os = "windows"))]
fn fixed_drive_roots() -> Result<Vec<PathBuf>, String> {
    Err("Scanning all computer files is available in the Windows desktop app".into())
}
#[cfg(test)]
fn recycle_with(
    s: &Session,
    plans: Vec<DuplicateRemoval>,
    recycle: impl Fn(&Path) -> Result<(), String>,
) -> Result<DuplicateRemovalResult, String> {
    recycle_batches_with(s, plans, 1, |paths, validate| {
        paths
            .iter()
            .map(|path| validate(path).and_then(|_| recycle(path)))
            .collect()
    })
}

fn recycle_batches_with(
    s: &Session,
    plans: Vec<DuplicateRemoval>,
    batch_size: usize,
    mut recycle: impl FnMut(&[PathBuf], &dyn Fn(&Path) -> Result<(), String>) -> Vec<Result<(), String>>,
) -> Result<DuplicateRemovalResult, String> {
    let _lock = s
        .operation
        .try_lock()
        .map_err(|_| "Cleanup already running")?;
    validate_plan(s, &plans)?;
    let started = Instant::now();
    let total: usize = plans.iter().map(|plan| plan.paths.len()).sum();
    *s.cleanup_started
        .lock()
        .map_err(|_| "Scan state unavailable")? = Some(started);
    {
        let mut progress = s.progress.lock().map_err(|_| "Scan state unavailable")?;
        progress.cleanup_stage = "validating".into();
        progress.cleanup_total = total;
        progress.cleanup_verified = 0;
        progress.cleanup_completed = 0;
        progress.cleanup_succeeded = 0;
        progress.cleanup_failed = 0;
        progress.cleanup_bytes = 0;
        progress.cleanup_elapsed_ms = 0;
        progress.cleanup_current.clear();
    }
    let mut result = DuplicateRemovalResult {
        moved_bytes: 0,
        items: Vec::new(),
        cancelled: false,
        unprocessed: 0,
        elapsed_ms: 0,
    };
    let record = |result: &mut DuplicateRemovalResult,
                  path: String,
                  size: u64,
                  outcome: Result<(), String>| {
        let mut progress = s.progress.lock().unwrap();
        progress.cleanup_completed += 1;
        if outcome.is_ok() {
            result.moved_bytes += size;
            progress.cleanup_succeeded += 1;
            progress.cleanup_bytes += size;
        } else {
            progress.cleanup_failed += 1;
        }
        result.items.push(RecycleBinMoveItem {
            path,
            ok: outcome.is_ok(),
            error: outcome.err(),
        });
    };
    // Keep retained handles alive across groups until their bounded Shell batch finishes.
    let mut pending: Vec<(String, PathBuf, u64, String, File)> = Vec::new();
    let mut flush = |pending: &mut Vec<(String, PathBuf, u64, String, File)>,
                     result: &mut DuplicateRemovalResult| {
        if pending.is_empty() {
            return;
        }
        s.progress.lock().unwrap().cleanup_stage = "recycling".into();
        let paths: Vec<_> = pending
            .iter()
            .map(|(_, path, _, _, _)| path.clone())
            .collect();
        let validate = |path: &Path| {
            let entry = pending
                .iter()
                .find(|(_, candidate, _, _, _)| candidate == path)
                .ok_or("File is outside this cleanup batch")?;
            s.guard.validate(&entry.3)?;
            s.guard.validate(&cleanup_display_path(path)).map(|_| ())
        };
        let mut outcomes = recycle(&paths, &validate).into_iter();
        for (path, _, size, _, _keeper) in pending.drain(..) {
            record(
                result,
                path,
                size,
                outcomes
                    .next()
                    .unwrap_or_else(|| Err("Missing recycle result".into())),
            );
        }
    };
    'plans: for plan in plans {
        if s.guard.check().is_err() {
            result.cancelled = true;
            break;
        }
        let keeper = s
            .guard
            .validate(&plan.keep_path)
            .and_then(|(p, _)| read_file(&p));
        match keeper {
            Err(error) => {
                for path in plan.paths {
                    record(&mut result, path, 0, Err(error.clone()));
                }
            }
            Ok(mut keeper) => {
                for path in &plan.paths {
                    if s.guard.check().is_err() {
                        result.cancelled = true;
                        break 'plans;
                    }
                    {
                        let mut progress = s.progress.lock().unwrap();
                        progress.cleanup_stage = "validating".into();
                        progress.cleanup_current = Path::new(path)
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .into();
                    }
                    let outcome = (|| {
                        let (canonical, size) = s.guard.validate(path)?;
                        let mut candidate = read_file(&canonical)?;
                        if !equal_files(&mut keeper, &mut candidate, s)? {
                            return Err("Content changed; scan again".into());
                        }
                        let retained = keeper
                            .try_clone()
                            .map_err(|_| "Cannot lock retained file")?;
                        Ok((canonical, size, retained))
                    })();
                    if s.guard.check().is_err() {
                        result.cancelled = true;
                        break 'plans;
                    }
                    s.progress.lock().unwrap().cleanup_verified += 1;
                    match outcome {
                        Ok((canonical, size, retained)) => pending.push((
                            path.clone(),
                            canonical,
                            size,
                            plan.keep_path.clone(),
                            retained,
                        )),
                        Err(error) => record(&mut result, path.clone(), 0, Err(error)),
                    }
                    if pending.len() >= batch_size.clamp(1, 32) {
                        flush(&mut pending, &mut result);
                    }
                }
            }
        }
    }
    if !result.cancelled {
        flush(&mut pending, &mut result);
    }
    let moved: HashSet<_> = result
        .items
        .iter()
        .filter(|i| i.ok)
        .map(|i| i.path.as_str())
        .collect();
    let mut groups = s.groups.lock().map_err(|_| "Scan state unavailable")?;
    for group in groups.iter_mut() {
        group.files.retain(|f| !moved.contains(f.path.as_str()));
    }
    groups.retain(|g| g.files.len() > 1);
    result.cancelled |= s.guard.cancelled.load(Ordering::SeqCst);
    result.unprocessed = total.saturating_sub(result.items.len());
    result.elapsed_ms = started.elapsed().as_millis() as u64;
    let mut progress = s.progress.lock().map_err(|_| "Scan state unavailable")?;
    progress.cleanup_stage = if result.cancelled { "stopped" } else { "done" }.into();
    progress.cleanup_current.clear();
    progress.cleanup_elapsed_ms = result.elapsed_ms;
    Ok(result)
}

#[tauri::command]
pub(crate) async fn scan_duplicate_files(
    scan_id: String,
    root_path: String,
    recursive: bool,
    all_drives: bool,
    extensions: Option<Vec<String>>,
) -> Result<DuplicateScanResult, String> {
    let session = begin(&scan_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let outcome = (|| {
            if all_drives && !root_path.is_empty() {
                return Err("All-drive scanning does not accept a folder path".into());
            }
            if !all_drives && root_path.is_empty() {
                return Err("Choose a scan folder first".into());
            }
            let roots = if all_drives {
                fixed_drive_roots()?
            } else {
                vec![canonical_scan_root(&root_path, false)?]
            };
            let extensions = extension_filter(extensions)?;
            let installed = protection::installed_directories();
            let groups = scan_filtered(&roots, recursive, &session, Some(&extensions), &installed)?;
            let progress = session
                .progress
                .lock()
                .map_err(|_| "Scan state unavailable")?
                .clone();
            Ok(DuplicateScanResult {
                scan_id,
                root_path: roots
                    .iter()
                    .map(|root| cleanup_display_path(root))
                    .collect::<Vec<_>>()
                    .join(", "),
                groups,
                progress,
            })
        })();
        if outcome.is_err() {
            session.guard.cancel();
        }
        outcome
    })
    .await
    .map_err(|_| "Duplicate scan worker failed")?
}
#[tauri::command]
pub(crate) fn cancel_duplicate_file_scan(scan_id: String) {
    cancel(&scan_id);
}
#[tauri::command]
pub(crate) fn get_duplicate_file_progress(scan_id: String) -> Result<DuplicateProgress, String> {
    // Read-only progress remains available after stopping; it grants no cleanup authority.
    let session = sessions()
        .lock()
        .map_err(|_| "Scan state unavailable")?
        .get(&scan_id)
        .cloned()
        .ok_or("Scan session expired; scan again")?;
    if session.created.elapsed() >= TTL {
        return Err("Scan session expired; scan again".into());
    }
    let result = session
        .progress
        .lock()
        .map_err(|_| "Scan state unavailable")?
        .clone();
    let mut result = result;
    if result.stage != "done" {
        result.elapsed_ms = session.created.elapsed().as_millis() as u64;
    }
    if !result.cleanup_stage.is_empty()
        && !matches!(result.cleanup_stage.as_str(), "done" | "stopped")
    {
        if let Some(started) = *session
            .cleanup_started
            .lock()
            .map_err(|_| "Scan state unavailable")?
        {
            result.cleanup_elapsed_ms = started.elapsed().as_millis() as u64;
        }
    }
    Ok(result)
}
#[tauri::command]
pub(crate) async fn recycle_duplicate_files(
    scan_id: String,
    selections: Vec<DuplicateRemoval>,
) -> Result<DuplicateRemovalResult, String> {
    let session = get(&scan_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        {
            let recycler = RecycleBinBatch::new()?;
            recycle_batches_with(&session, selections, 32, |paths, validate| {
                recycler.move_batch(paths, validate)
            })
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = (session, selections);
            Err("Recycle bin cleanup is available on Windows only".into())
        }
    })
    .await
    .map_err(|_| "Cleanup worker failed")?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn id() -> String {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        format!(
            "duplicate-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        )
    }
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = std::env::current_dir().unwrap().join("target").join(id());
            std::fs::create_dir_all(&root).unwrap();
            Self(root.canonicalize().unwrap())
        }
        fn write(&self, name: &str, data: &[u8]) -> PathBuf {
            let p = self.0.join(name);
            std::fs::write(&p, data).unwrap();
            p
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn duplicate_files_exact_content_and_empty_files() {
        let fixture = Fixture::new();
        fixture.write("a.txt", b"identical");
        fixture.write("renamed.bin", b"identical");
        fixture.write("other.txt", b"different");
        fixture.write("empty-a", b"");
        fixture.write("empty-b", b"");
        let s = fresh();
        let groups = scan(std::slice::from_ref(&fixture.0), true, &s).unwrap();
        assert_eq!(groups.len(), 1);
        assert!(groups.iter().all(|g| g.files.len() == 2));
        assert_eq!(s.progress.lock().unwrap().filtered_files, 2);
    }
    #[test]
    fn duplicate_files_capacity_counts_only_eligible_files() {
        let fixture = Fixture::new();
        fixture.write("a.pdf", b"same");
        fixture.write("b.pdf", b"same");
        for n in 0..20 {
            fixture.write(&format!("skip-{n}.exe"), b"same");
        }
        let types = extension_filter(Some(vec!["pdf".into()])).unwrap();
        let s = fresh();
        let groups = scan_with_limits(
            std::slice::from_ref(&fixture.0),
            true,
            &s,
            Some(&types),
            &[],
            2,
            2,
        )
        .unwrap();
        assert_eq!(groups[0].files.len(), 2);
        let p = s.progress.lock().unwrap();
        assert_eq!(p.visited_entries, 22);
        assert_eq!(p.filtered_files, 20);
        assert!(
            !p.truncated,
            "Exact capacity is not overflow; filtered entries cannot end walking"
        );
        drop(p);
        fixture.write("c.pdf", b"same");
        let s = fresh();
        let groups = scan_with_limits(
            std::slice::from_ref(&fixture.0),
            true,
            &s,
            Some(&types),
            &[],
            2,
            2,
        )
        .unwrap();
        assert_eq!(groups[0].files.len(), 2);
        let p = s.progress.lock().unwrap();
        assert_eq!(p.scanned_files, 2);
        assert_eq!(p.limit_reason, "files");
        assert_eq!(p.stage, "done");
        assert!(p.truncated);
    }
    #[test]
    fn duplicate_files_oversized_group_returns_confirmed_members() {
        let fixture = Fixture::new();
        for n in 0..5 {
            fixture.write(&format!("{n}.pdf"), b"same");
        }
        let s = fresh();
        let groups =
            scan_with_limits(std::slice::from_ref(&fixture.0), true, &s, None, &[], 5, 3).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].files.len(), 3);
        let p = s.progress.lock().unwrap();
        assert!(p.truncated);
        assert_eq!(p.limit_reason, "results");
        assert_eq!(p.stage, "done");
    }
    #[test]
    fn duplicate_files_unique_candidates_do_not_consume_result_capacity() {
        let fixture = Fixture::new();
        let paths = vec![
            fixture.write("a", b"1111"),
            fixture.write("b", b"2222"),
            fixture.write("c", b"3333"),
            fixture.write("d", b"3333"),
        ];
        let s = fresh();
        scan(std::slice::from_ref(&fixture.0), true, &s).unwrap();
        let (groups, limited) = verify_duplicates(paths, &s, 2).unwrap();
        assert!(!limited);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].len(), 2);
    }
    #[test]
    fn duplicate_files_filters_before_reading_and_reuses_small_hashes() {
        let fixture = Fixture::new();
        fixture.write("a.PDF", b"same");
        fixture.write("b.pdf", b"same");
        fixture.write("unique.pdf", b"a longer unique file");
        fixture.write("skip.exe", b"same");
        fixture.write("skip.dll", b"same");
        fixture.write("empty.pdf", b"");
        let s = fresh();
        let types = extension_filter(Some(vec!["PDF".into()])).unwrap();
        let groups = scan_filtered(
            std::slice::from_ref(&fixture.0),
            true,
            &s,
            Some(&types),
            &[],
        )
        .unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].files.len(), 2);
        let p = s.progress.lock().unwrap();
        assert_eq!(p.scanned_files, 3);
        assert_eq!(p.filtered_files, 3);
        // Two full small-file samples + one byte comparison; no second digest or unique-file read.
        assert_eq!(p.read_bytes, 16);
        assert_eq!(p.stage_ms.len(), 4);
        assert_eq!(p.visited_entries, 6);
        assert!(extension_filter(Some(vec![])).is_err());
        assert!(extension_filter(Some(vec!["exe".into()])).is_err());
    }
    #[test]
    fn duplicate_files_skips_cache_and_explicit_install_locations() {
        let fixture = Fixture::new();
        fixture.write("a.pdf", b"same");
        fixture.write("b.pdf", b"same");
        for directory in ["cache", "node_modules", "InstalledApp"] {
            std::fs::create_dir(fixture.0.join(directory)).unwrap();
            fixture.write(&format!("{directory}/copy.pdf"), b"same");
        }
        let s = fresh();
        let types = extension_filter(None).unwrap();
        let groups = scan_filtered(
            std::slice::from_ref(&fixture.0),
            true,
            &s,
            Some(&types),
            &[fixture.0.join("InstalledApp")],
        )
        .unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].files.len(), 2);
        assert_eq!(s.progress.lock().unwrap().skipped, 3);
    }
    #[test]
    fn duplicate_files_bounded_workers_preserve_all_matches_and_cancellation() {
        let fixture = Fixture::new();
        for n in 0..32 {
            fixture.write(&format!("{n:02}.txt"), b"identical");
        }
        let s = fresh();
        let groups = scan(std::slice::from_ref(&fixture.0), true, &s).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].files.len(), 32);
        assert_eq!(s.progress.lock().unwrap().read_bytes, (32 + 31 * 2) * 9);
        s.guard.cancel();
        assert!(bucket_hash(
            vec![fixture.0.join("00.txt"); 32],
            true,
            &s,
            &Mutex::new(HashMap::new())
        )
        .is_err());
    }
    #[test]
    fn duplicate_files_sample_collision_is_not_duplicate() {
        let fixture = Fixture::new();
        let mut data = vec![5u8; 20000];
        fixture.write("a", &data);
        data[10000] = 6;
        fixture.write("b", &data);
        assert!(scan(std::slice::from_ref(&fixture.0), true, &fresh())
            .unwrap()
            .is_empty());
    }
    #[test]
    fn duplicate_files_recursive_and_cancelled() {
        let fixture = Fixture::new();
        fixture.write("a", b"same");
        std::fs::create_dir(fixture.0.join("nested")).unwrap();
        fixture.write("nested/b", b"same");
        assert!(scan(std::slice::from_ref(&fixture.0), false, &fresh())
            .unwrap()
            .is_empty());
        assert_eq!(
            scan(std::slice::from_ref(&fixture.0), true, &fresh())
                .unwrap()
                .len(),
            1
        );
        let id = id();
        cancel(&id);
        assert!(begin(&id).is_err());
        let s = fresh();
        s.guard.cancelled.store(true, Ordering::SeqCst);
        assert!(scan(std::slice::from_ref(&fixture.0), true, &s).is_err());
    }
    #[test]
    fn duplicate_files_recycle_requires_unchanged_keeper_and_members() {
        let fixture = Fixture::new();
        fixture.write("a", b"same");
        fixture.write("b", b"same");
        let s = fresh();
        let group = scan(std::slice::from_ref(&fixture.0), true, &s)
            .unwrap()
            .remove(0);
        let plan = || DuplicateRemoval {
            group_id: group.id.clone(),
            keep_path: group.files[0].path.clone(),
            paths: vec![group.files[1].path.clone()],
        };
        let invalid = DuplicateRemoval {
            paths: vec![group.files[0].path.clone()],
            ..plan()
        };
        assert!(recycle_with(&s, vec![invalid], |_| panic!("must not delete")).is_err());
        fixture.write("a", b"changed");
        let result = recycle_with(&s, vec![plan()], |_| panic!("must not delete")).unwrap();
        assert!(!result.items[0].ok);
        assert!(fixture.0.join("b").exists());
    }
    #[test]
    fn duplicate_files_removal_preserves_keeper_and_rejects_generic_session() {
        let fixture = Fixture::new();
        fixture.write("a", b"same");
        fixture.write("b", b"same");
        let id = id();
        let s = begin(&id).unwrap();
        let group = scan(std::slice::from_ref(&fixture.0), true, &s)
            .unwrap()
            .remove(0);
        assert!(cleanup_guard::get(&id).is_err());
        let plan = DuplicateRemoval {
            group_id: group.id,
            keep_path: group.files[0].path.clone(),
            paths: vec![group.files[1].path.clone()],
        };
        let result = recycle_with(&s, vec![plan], |p| {
            std::fs::remove_file(p).map_err(|e| e.to_string())
        })
        .unwrap();
        assert!(result.items[0].ok);
        assert_eq!(result.moved_bytes, 4);
        assert!(fixture.0.join("a").exists());
        cancel(&id);
    }
    #[test]
    fn duplicate_files_changed_candidate_and_forged_plan_rejected() {
        let fixture = Fixture::new();
        fixture.write("a", b"same");
        fixture.write("b", b"same");
        let s = fresh();
        let group = scan(std::slice::from_ref(&fixture.0), true, &s)
            .unwrap()
            .remove(0);
        let plan = || DuplicateRemoval {
            group_id: group.id.clone(),
            keep_path: group.files[0].path.clone(),
            paths: vec![group.files[1].path.clone()],
        };
        let forged = DuplicateRemoval {
            paths: vec![cleanup_display_path(&fixture.0.join("unscanned"))],
            ..plan()
        };
        assert!(recycle_with(&s, vec![forged], |_| panic!("must not delete")).is_err());
        assert!(recycle_with(&s, vec![plan(), plan()], |_| panic!("must not delete")).is_err());
        fixture.write("b", b"else");
        let result = recycle_with(&s, vec![plan()], |_| panic!("must not delete")).unwrap();
        assert!(!result.items[0].ok);
    }
    #[test]
    fn duplicate_files_partial_recycle_failure_is_reported() {
        let fixture = Fixture::new();
        fixture.write("a", b"same");
        fixture.write("b", b"same");
        fixture.write("c", b"same");
        let s = fresh();
        let group = scan(std::slice::from_ref(&fixture.0), true, &s)
            .unwrap()
            .remove(0);
        let plan = DuplicateRemoval {
            group_id: group.id,
            keep_path: group.files[0].path.clone(),
            paths: group.files[1..].iter().map(|f| f.path.clone()).collect(),
        };
        let result = recycle_with(&s, vec![plan], |path| {
            if path.file_name().unwrap() == "c" {
                Err("fixture failure".into())
            } else {
                std::fs::remove_file(path).map_err(|e| e.to_string())
            }
        })
        .unwrap();
        assert_eq!(result.items.iter().filter(|i| i.ok).count(), 1);
        assert_eq!(result.items.iter().filter(|i| !i.ok).count(), 1);
        assert!(fixture.0.join("a").exists());
        assert!(fixture.0.join("c").exists());
    }
    #[test]
    fn duplicate_files_missing_keeper_and_cancelled_cleanup_are_rejected() {
        let fixture = Fixture::new();
        fixture.write("a", b"same");
        fixture.write("b", b"same");
        let s = fresh();
        let group = scan(std::slice::from_ref(&fixture.0), true, &s)
            .unwrap()
            .remove(0);
        let plan = || DuplicateRemoval {
            group_id: group.id.clone(),
            keep_path: group.files[0].path.clone(),
            paths: vec![group.files[1].path.clone()],
        };
        std::fs::remove_file(fixture.0.join("a")).unwrap();
        let result = recycle_with(&s, vec![plan()], |_| panic!("must not delete")).unwrap();
        assert!(!result.items[0].ok);
        assert!(fixture.0.join("b").exists());
        s.guard.cancel();
        assert!(recycle_with(&s, vec![plan()], |_| panic!("must not delete")).is_err());
    }
    #[test]
    fn duplicate_files_concurrent_cleanup_and_cancel_mid_batch() {
        let fixture = Fixture::new();
        fixture.write("a", b"same");
        fixture.write("b", b"same");
        fixture.write("c", b"same");
        let s = fresh();
        let group = scan(std::slice::from_ref(&fixture.0), true, &s)
            .unwrap()
            .remove(0);
        let plan = || DuplicateRemoval {
            group_id: group.id.clone(),
            keep_path: group.files[0].path.clone(),
            paths: group.files[1..].iter().map(|f| f.path.clone()).collect(),
        };
        let lock = s.operation.lock().unwrap();
        assert!(recycle_with(&s, vec![plan()], |_| panic!("must not delete")).is_err());
        drop(lock);
        let result = recycle_with(&s, vec![plan()], |p| {
            std::fs::remove_file(p).map_err(|e| e.to_string())?;
            s.guard.cancel();
            Ok(())
        })
        .unwrap();
        assert_eq!(result.items.iter().filter(|i| i.ok).count(), 1);
        assert_eq!(result.items.len(), 1);
        assert!(result.cancelled);
        assert_eq!(result.unprocessed, 1);
        assert!(fixture.0.join("a").exists());
        assert!(fixture.0.join("c").exists());
    }
    #[test]
    fn duplicate_files_batches_across_groups_report_live_progress() {
        let fixture = Fixture::new();
        for index in 0..35u8 {
            fixture.write(&format!("{}-a", index), &[index; 4]);
            fixture.write(&format!("{}-b", index), &[index; 4]);
        }
        let id = id();
        let s = begin(&id).unwrap();
        let groups = scan(std::slice::from_ref(&fixture.0), true, &s).unwrap();
        let retained: Vec<_> = groups
            .iter()
            .map(|group| group.files[0].path.clone())
            .collect();
        let plans = groups
            .into_iter()
            .map(|group| DuplicateRemoval {
                group_id: group.id,
                keep_path: group.files[0].path.clone(),
                paths: vec![group.files[1].path.clone()],
            })
            .collect();
        let mut batches = Vec::new();
        let result = recycle_batches_with(&s, plans, 32, |paths, validate| {
            batches.push(paths.len());
            let progress = get_duplicate_file_progress(id.clone()).unwrap();
            assert_eq!(progress.cleanup_stage, "recycling");
            assert_eq!(progress.cleanup_total, 35);
            assert!(progress.cleanup_completed < progress.cleanup_verified);
            paths
                .iter()
                .map(|path| {
                    validate(path)
                        .and_then(|_| std::fs::remove_file(path).map_err(|error| error.to_string()))
                })
                .collect()
        })
        .unwrap();
        assert_eq!(batches, vec![32, 3]);
        assert_eq!(result.items.len(), 35);
        assert!(result.items.iter().all(|item| item.ok));
        assert_eq!(result.moved_bytes, 140);
        assert_eq!(result.unprocessed, 0);
        assert!(retained.iter().all(|path| Path::new(path).exists()));
        let progress = get_duplicate_file_progress(id.clone()).unwrap();
        assert_eq!(progress.cleanup_completed, 35);
        assert_eq!(progress.cleanup_succeeded, 35);
        assert_eq!(progress.cleanup_failed, 0);
        cancel(&id);
        assert!(
            get_duplicate_file_progress(id).is_ok(),
            "stop preserves read-only progress"
        );
    }
    #[test]
    fn duplicate_files_batch_rechecks_guard_before_queueing() {
        let fixture = Fixture::new();
        fixture.write("a", b"same");
        fixture.write("b", b"same");
        let s = fresh();
        let group = scan(std::slice::from_ref(&fixture.0), true, &s)
            .unwrap()
            .remove(0);
        let plan = DuplicateRemoval {
            group_id: group.id,
            keep_path: group.files[0].path.clone(),
            paths: vec![group.files[1].path.clone()],
        };
        let result = recycle_batches_with(&s, vec![plan], 32, |paths, validate| {
            s.guard.cancel();
            paths.iter().map(|path| validate(path)).collect()
        })
        .unwrap();
        assert!(result.cancelled);
        assert!(!result.items[0].ok);
        assert_eq!(result.moved_bytes, 0);
        assert!(fixture.0.join("a").exists() && fixture.0.join("b").exists());
    }
    #[cfg(target_os = "windows")]
    #[test]
    fn duplicate_files_skip_hardlinks_and_readonly() {
        let fixture = Fixture::new();
        let path = fixture.write("a", b"same");
        fixture.write("b", b"same");
        std::fs::hard_link(&path, fixture.0.join("link")).unwrap();
        let readonly = fixture.write("readonly", b"same");
        let mut permissions = std::fs::metadata(&readonly).unwrap().permissions();
        permissions.set_readonly(true);
        std::fs::set_permissions(&readonly, permissions).unwrap();
        let s = fresh();
        let result = scan(std::slice::from_ref(&fixture.0), true, &s);
        let mut permissions = std::fs::metadata(&readonly).unwrap().permissions();
        permissions.set_readonly(false);
        std::fs::set_permissions(&readonly, permissions).unwrap();
        assert!(result.unwrap().is_empty());
        assert_eq!(s.progress.lock().unwrap().skipped, 3);
    }
    #[cfg(target_os = "windows")]
    #[test]
    fn duplicate_files_real_windows_recycle_keeps_original() {
        let fixture = Fixture::new();
        fixture.write("a", b"ToolKnit disposable test");
        fixture.write("b", b"ToolKnit disposable test");
        fixture.write("c", b"ToolKnit disposable test");
        let s = fresh();
        let group = scan(std::slice::from_ref(&fixture.0), true, &s)
            .unwrap()
            .remove(0);
        let plan = DuplicateRemoval {
            group_id: group.id,
            keep_path: group.files[0].path.clone(),
            paths: group.files[1..]
                .iter()
                .map(|file| file.path.clone())
                .collect(),
        };
        let recycler = RecycleBinBatch::new().unwrap();
        let result = recycle_batches_with(&s, vec![plan], 32, |paths, validate| {
            recycler.move_batch(paths, validate)
        })
        .unwrap();
        assert_eq!(result.items.len(), 2);
        assert!(
            result.items.iter().all(|item| item.ok),
            "{:?}",
            result
                .items
                .iter()
                .filter_map(|item| item.error.as_ref())
                .collect::<Vec<_>>()
        );
        assert!(fixture.0.join("a").exists());
        assert!(!fixture.0.join("b").exists());
        assert!(!fixture.0.join("c").exists());
        if std::env::var_os("TOOLKNIT_DUPLICATE_RECYCLE_BENCHMARK").is_some() {
            for batch in [false, true] {
                let fixture = Fixture::new();
                for index in 0..64u8 {
                    fixture.write(&format!("{}-a", index), &[index; 8192]);
                    fixture.write(&format!("{}-b", index), &[index; 8192]);
                }
                let s = fresh();
                let groups = scan(std::slice::from_ref(&fixture.0), true, &s).unwrap();
                let retained: Vec<_> = groups
                    .iter()
                    .map(|group| group.files[0].path.clone())
                    .collect();
                let plans = groups
                    .into_iter()
                    .map(|group| DuplicateRemoval {
                        group_id: group.id,
                        keep_path: group.files[0].path.clone(),
                        paths: vec![group.files[1].path.clone()],
                    })
                    .collect();
                let started = Instant::now();
                let result = if batch {
                    let recycler = RecycleBinBatch::new().unwrap();
                    recycle_batches_with(&s, plans, 32, |paths, validate| {
                        recycler.move_batch(paths, validate)
                    })
                } else {
                    recycle_with(&s, plans, move_single_file_to_recycle_bin)
                }
                .unwrap();
                println!(
                    "Disposable Windows recycle benchmark: {} files=64 elapsed_ms={}",
                    if batch { "batch32" } else { "single" },
                    started.elapsed().as_millis()
                );
                assert_eq!(result.items.len(), 64);
                assert!(result.items.iter().all(|item| item.ok));
                assert_eq!(result.moved_bytes, 64 * 8192);
                assert!(retained.iter().all(|path| Path::new(path).exists()));
            }
        }
    }
}
