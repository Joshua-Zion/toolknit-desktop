use std::sync::OnceLock;
use tauri::{Emitter, Manager};

static CUSTOM_BACKGROUND_SERVER_PORT: OnceLock<u16> = OnceLock::new();

#[cfg(test)]
static TEST_CONVERSION_LOCK: OnceLock<std::sync::Mutex<()>> = OnceLock::new();

#[cfg(test)]
fn test_conversion_lock() -> std::sync::MutexGuard<'static, ()> {
    TEST_CONVERSION_LOCK
        .get_or_init(|| std::sync::Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

// Tauri's build script embeds this compatibility manifest into application
// binaries. Cargo's lib unit-test harness needs to link it independently.
#[cfg(all(test, windows))]
#[link(name = "resource", kind = "static")]
extern "C" {}

/// Read the installer language at startup (from install_lang.txt).
/// Returns "zh" or "en", defaulting to "zh" on any error.
fn read_initial_lang() -> String {
    let exe = match std::env::current_exe() {
        Ok(e) => e,
        Err(_) => return "zh".to_string(),
    };
    let dir = match exe.parent() {
        Some(d) => d,
        None => return "zh".to_string(),
    };
    let lang_file = dir.join("install_lang.txt");
    match std::fs::read_to_string(&lang_file) {
        Ok(content) => match content.trim().parse::<u32>() {
            Ok(2052) => "zh".to_string(),
            _ => "en".to_string(),
        },
        Err(_) => "zh".to_string(),
    }
}

/// Build the tray menu with labels in the given language.
fn build_tray_menu(
    app: &tauri::AppHandle,
    lang: &str,
) -> Result<tauri::menu::Menu<tauri::Wry>, tauri::Error> {
    let (show_text, quit_text) = if lang == "zh" {
        (
            "\u{663e}\u{793a}\u{4e3b}\u{7a0b}\u{5e8f}",
            "\u{9000}\u{51fa} ToolKnit",
        )
    } else {
        ("Show ToolKnit", "Quit ToolKnit")
    };
    let show_i = tauri::menu::MenuItem::with_id(app, "show", show_text, true, None::<&str>)?;
    let quit_i = tauri::menu::MenuItem::with_id(app, "quit", quit_text, true, None::<&str>)?;
    tauri::menu::Menu::with_items(app, &[&show_i, &quit_i])
}

#[tauri::command]
fn set_tray_lang(app: tauri::AppHandle, lang: String) -> Result<(), String> {
    let menu = build_tray_menu(&app, &lang).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
    match parsed.scheme() {
        "http" | "https" => {
            let _ = opener::open(&url);
            Ok(())
        }
        _ => Err(format!("Unsupported URL scheme: {}", parsed.scheme())),
    }
}

#[tauri::command]
fn get_documents_dir() -> Result<String, String> {
    let dir = dirs::document_dir().ok_or("Cannot find Documents folder")?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn get_download_dir() -> Result<String, String> {
    let dir = dirs::download_dir().ok_or("Cannot find Downloads folder")?;
    Ok(dir.to_string_lossy().to_string())
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct OutputRootConfig {
    output_root: Option<String>,
}

fn toolknit_app_data_dir() -> Result<std::path::PathBuf, String> {
    Ok(dirs::data_dir()
        .ok_or("Cannot find AppData folder")?
        .join("ToolKnit"))
}

fn output_root_config_path() -> Result<std::path::PathBuf, String> {
    Ok(toolknit_app_data_dir()?.join("output-location.json"))
}

fn configured_output_root() -> Option<std::path::PathBuf> {
    let config_path = output_root_config_path().ok()?;
    let config = std::fs::read_to_string(config_path)
        .ok()
        .and_then(|content| serde_json::from_str::<OutputRootConfig>(&content).ok())?;
    config
        .output_root
        .and_then(|path| std::path::PathBuf::from(path).canonicalize().ok())
}

#[tauri::command]
fn get_output_root() -> Result<Option<String>, String> {
    Ok(configured_output_root().map(|path| cleanup_display_path(&path)))
}

#[tauri::command]
fn get_default_output_root() -> Result<String, String> {
    let downloads = dirs::download_dir()
        .or_else(dirs::document_dir)
        .ok_or("Cannot find a default output folder")?;
    let root = downloads.join("ToolKnit");
    std::fs::create_dir_all(&root)
        .map_err(|error| format!("Cannot create default output folder: {}", error))?;
    root.canonicalize()
        .map(|path| cleanup_display_path(&path))
        .map_err(|error| format!("Cannot access default output folder: {}", error))
}

#[tauri::command]
fn set_output_root(output_dir: Option<String>) -> Result<(), String> {
    let output_root = match output_dir {
        Some(path) if !path.trim().is_empty() => {
            if path.contains('\0') {
                return Err("Invalid output folder".to_string());
            }
            let canonical = std::path::PathBuf::from(path)
                .canonicalize()
                .map_err(|error| format!("Cannot access output folder: {}", error))?;
            if !canonical.is_dir() {
                return Err("Output location must be a folder".to_string());
            }
            Some(cleanup_display_path(&canonical))
        }
        _ => None,
    };

    let config_path = output_root_config_path()?;
    let parent = config_path.parent().ok_or("Invalid AppData folder")?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("Cannot create settings folder: {}", error))?;
    let content = serde_json::to_vec(&OutputRootConfig { output_root })
        .map_err(|error| format!("Cannot save output location: {}", error))?;
    std::fs::write(config_path, content)
        .map_err(|error| format!("Cannot save output location: {}", error))
}

#[derive(serde::Serialize)]
struct CustomBackgroundAsset {
    path: String,
    media_type: String,
}

#[derive(Clone, serde::Serialize)]
struct LargeFileCandidate {
    id: String,
    path: String,
    name: String,
    extension: String,
    category: String,
    size_bytes: u64,
    modified_at: Option<i64>,
    folder_hint: String,
    risk: String,
    local_reason: String,
}

#[derive(serde::Serialize)]
struct LargeFileScanResult {
    root_path: String,
    min_size_bytes: u64,
    mode: String,
    scanned_files: u64,
    skipped_dirs: u64,
    drive_space: Option<CleanupDriveSpace>,
    candidates: Vec<LargeFileCandidate>,
}

#[derive(Clone, serde::Deserialize, serde::Serialize)]
struct CleanupDriveSpace {
    drive: String,
    free_bytes: u64,
    total_bytes: u64,
}

#[derive(serde::Serialize)]
struct RecycleBinMoveItem {
    path: String,
    ok: bool,
    error: Option<String>,
}

#[derive(serde::Serialize)]
struct RecycleBinMoveResult {
    requested: usize,
    moved: usize,
    failed: usize,
    freed_bytes: u64,
    items: Vec<RecycleBinMoveItem>,
}

fn custom_background_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("custom-background"))
        .map_err(|error| format!("Cannot find application data folder: {}", error))
}

fn custom_background_media_type(extension: &str) -> Option<&'static str> {
    match extension.to_ascii_lowercase().as_str() {
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" => Some("image"),
        "mp4" | "webm" | "ogv" | "ogg" | "mov" => Some("video"),
        _ => None,
    }
}

#[tauri::command]
async fn import_custom_background(
    app: tauri::AppHandle,
    source_path: String,
) -> Result<CustomBackgroundAsset, String> {
    tokio::task::spawn_blocking(move || import_custom_background_blocking(&app, source_path))
        .await
        .map_err(|error| format!("Background import worker failed: {}", error))?
}

fn import_custom_background_blocking(
    app: &tauri::AppHandle,
    source_path: String,
) -> Result<CustomBackgroundAsset, String> {
    const MAX_BACKGROUND_BYTES: u64 = 250 * 1024 * 1024;
    if source_path.contains('\0') {
        return Err("Invalid background file".to_string());
    }
    let source = std::path::PathBuf::from(source_path)
        .canonicalize()
        .map_err(|error| format!("Cannot access background file: {}", error))?;
    let metadata = std::fs::metadata(&source)
        .map_err(|error| format!("Cannot read background file: {}", error))?;
    if !metadata.is_file() || metadata.len() > MAX_BACKGROUND_BYTES {
        return Err("Background must be a file no larger than 250MB".to_string());
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .ok_or("Unsupported background file")?
        .to_ascii_lowercase();
    let media_type =
        custom_background_media_type(&extension).ok_or("Unsupported background format")?;

    let target_dir = custom_background_dir(app)?;
    std::fs::create_dir_all(&target_dir)
        .map_err(|error| format!("Cannot prepare background folder: {}", error))?;
    let unique_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let target = target_dir.join(format!(
        "background-{}.{}",
        unique_id,
        if media_type == "video" {
            "mp4"
        } else {
            extension.as_str()
        }
    ));

    if media_type == "video" {
        let ffmpeg = get_ffmpeg_path()?;
        if !ffmpeg.is_file() {
            return Err(
                "Background video conversion requires the bundled FFmpeg engine".to_string(),
            );
        }
        let output = std::process::Command::new(&ffmpeg)
            .args(["-hide_banner", "-loglevel", "error", "-y", "-i"])
            .arg(&source)
            .args([
                "-map",
                "0:v:0",
                "-an",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "22",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
            ])
            .arg(&target)
            .output()
            .map_err(|error| format!("Cannot start background video conversion: {}", error))?;
        if !output.status.success() {
            let _ = std::fs::remove_file(&target);
            let details = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if details.is_empty() {
                "Cannot convert background video to H.264".to_string()
            } else {
                format!("Cannot convert background video to H.264: {}", details)
            });
        }
        log::info!(
            "Custom background video converted: source={}, target={}",
            source.display(),
            target.display()
        );
    } else {
        std::fs::copy(&source, &target)
            .map_err(|error| format!("Cannot import background file: {}", error))?;
    }

    let target_metadata = std::fs::metadata(&target)
        .map_err(|error| format!("Cannot read imported background: {}", error))?;
    if !target_metadata.is_file()
        || target_metadata.len() == 0
        || target_metadata.len() > MAX_BACKGROUND_BYTES
    {
        let _ = std::fs::remove_file(&target);
        return Err(
            "Converted background must be a non-empty file no larger than 250MB".to_string(),
        );
    }

    if let Ok(entries) = std::fs::read_dir(&target_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path != target && path.is_file() {
                let _ = std::fs::remove_file(path);
            }
        }
    }

    Ok(CustomBackgroundAsset {
        path: target.to_string_lossy().into_owned(),
        media_type: media_type.to_string(),
    })
}

#[tauri::command]
fn log_custom_background_event(event: String) {
    // Browser media errors are only observable in the webview, so retain a bounded trace in the app log.
    let safe_event = event.replace(['\r', '\n'], " ");
    log::info!(
        "Custom background: {}",
        safe_event.chars().take(1_500).collect::<String>()
    );
}

fn custom_background_content_type(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some(extension) if extension.eq_ignore_ascii_case("mp4") => "video/mp4",
        Some(extension) if extension.eq_ignore_ascii_case("webm") => "video/webm",
        Some(extension) if extension.eq_ignore_ascii_case("png") => "image/png",
        Some(extension) if extension.eq_ignore_ascii_case("webp") => "image/webp",
        Some(extension) if extension.eq_ignore_ascii_case("gif") => "image/gif",
        Some(extension) if extension.eq_ignore_ascii_case("bmp") => "image/bmp",
        _ => "image/jpeg",
    }
}

fn write_background_http_error(
    stream: &mut std::net::TcpStream,
    status: &str,
) -> std::io::Result<()> {
    use std::io::Write;
    stream.write_all(
        format!("HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").as_bytes(),
    )
}

fn parse_background_range(request: &str, file_len: u64) -> Option<(u64, u64)> {
    let range = request
        .lines()
        .find_map(|line| {
            line.strip_prefix("Range:")
                .or_else(|| line.strip_prefix("range:"))
        })?
        .trim()
        .strip_prefix("bytes=")?;
    let (start, end) = range.split_once('-')?;
    let start = if start.is_empty() {
        let suffix = end.parse::<u64>().ok()?;
        file_len.saturating_sub(suffix)
    } else {
        start.parse::<u64>().ok()?
    };
    if start >= file_len {
        return None;
    }
    let end = if end.is_empty() {
        file_len - 1
    } else {
        end.parse::<u64>().ok()?.min(file_len - 1)
    };
    (start <= end).then_some((start, end))
}

fn serve_custom_background_connection(
    mut stream: std::net::TcpStream,
    root: &std::path::Path,
) -> std::io::Result<()> {
    use std::io::{Read, Seek, Write};

    stream.set_read_timeout(Some(std::time::Duration::from_secs(5)))?;
    let mut request_bytes = Vec::with_capacity(2048);
    let mut chunk = [0u8; 1024];
    while request_bytes.len() < 16 * 1024 {
        let count = stream.read(&mut chunk)?;
        if count == 0 {
            return Ok(());
        }
        request_bytes.extend_from_slice(&chunk[..count]);
        if request_bytes.windows(4).any(|window| window == b"\r\n\r\n") {
            break;
        }
    }
    let request = String::from_utf8_lossy(&request_bytes);
    let mut request_parts = request
        .lines()
        .next()
        .unwrap_or_default()
        .split_whitespace();
    let method = request_parts.next().unwrap_or_default();
    let url_path = request_parts
        .next()
        .unwrap_or_default()
        .split('?')
        .next()
        .unwrap_or_default();
    if !matches!(method, "GET" | "HEAD") {
        return write_background_http_error(&mut stream, "405 Method Not Allowed");
    }
    let filename = url_path
        .strip_prefix("/custom-background/")
        .unwrap_or_default();
    if filename.is_empty()
        || filename.contains(['/', '\\'])
        || filename.contains("..")
        || !filename.starts_with("background-")
    {
        return write_background_http_error(&mut stream, "404 Not Found");
    }
    let path = root.join(filename);
    let file = match std::fs::File::open(&path) {
        Ok(file) => file,
        Err(_) => return write_background_http_error(&mut stream, "404 Not Found"),
    };
    let file_len = file.metadata()?.len();
    if file_len == 0 {
        return write_background_http_error(&mut stream, "404 Not Found");
    }
    let range_header_present = request
        .lines()
        .any(|line| line.to_ascii_lowercase().starts_with("range:"));
    let range = parse_background_range(&request, file_len);
    if range_header_present && range.is_none() {
        return write_background_http_error(&mut stream, "416 Range Not Satisfiable");
    }
    let (start, end, status) = range
        .map(|(start, end)| (start, end, "206 Partial Content"))
        .unwrap_or((0, file_len - 1, "200 OK"));
    let content_len = end - start + 1;
    let mut response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {}\r\nContent-Length: {content_len}\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\nConnection: close\r\n",
        custom_background_content_type(&path)
    );
    if status.starts_with("206") {
        response.push_str(&format!(
            "Content-Range: bytes {start}-{end}/{file_len}\r\n"
        ));
    }
    response.push_str("\r\n");
    stream.write_all(response.as_bytes())?;
    if method == "HEAD" {
        return Ok(());
    }
    let mut file = file;
    file.seek(std::io::SeekFrom::Start(start))?;
    let mut body = file.take(content_len);
    std::io::copy(&mut body, &mut stream)?;
    Ok(())
}

fn custom_background_server_port(root: std::path::PathBuf) -> Result<u16, String> {
    if let Some(port) = CUSTOM_BACKGROUND_SERVER_PORT.get() {
        return Ok(*port);
    }
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Cannot start local background media service: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Cannot read local background media port: {error}"))?
        .port();
    std::thread::Builder::new()
        .name("toolknit-background-media".to_string())
        .spawn(move || {
            for stream in listener.incoming().flatten() {
                if let Err(error) = serve_custom_background_connection(stream, &root) {
                    log::debug!("Custom background media request failed: {error}");
                }
            }
        })
        .map_err(|error| format!("Cannot run local background media service: {error}"))?;
    let _ = CUSTOM_BACKGROUND_SERVER_PORT.set(port);
    Ok(*CUSTOM_BACKGROUND_SERVER_PORT.get().unwrap_or(&port))
}

#[tauri::command]
fn get_custom_background_media_url(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let root = custom_background_dir(&app)?;
    let root = root
        .canonicalize()
        .map_err(|error| format!("Cannot access background folder: {error}"))?;
    let file = std::path::PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("Cannot access imported background: {error}"))?;
    if !file.starts_with(&root) || !file.is_file() {
        return Err("Custom background path is not permitted".to_string());
    }
    let filename = file
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| name.starts_with("background-"))
        .ok_or("Invalid imported background file")?;
    let port = custom_background_server_port(root)?;
    Ok(format!(
        "http://127.0.0.1:{port}/custom-background/{filename}"
    ))
}

#[cfg(test)]
mod custom_background_media_tests {
    use super::*;
    use std::io::{Read, Write};

    #[test]
    fn serves_custom_background_with_http_range_support() {
        let root =
            std::env::temp_dir().join(format!("toolknit-background-test-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let background = root.join("background-test.mp4");
        std::fs::write(&background, b"0123456789").unwrap();
        let port = custom_background_server_port(root.clone()).unwrap();
        let mut client = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        client
            .write_all(
                b"GET /custom-background/background-test.mp4 HTTP/1.1\r\nHost: 127.0.0.1\r\nRange: bytes=2-5\r\n\r\n",
            )
            .unwrap();
        let mut response = Vec::new();
        client.read_to_end(&mut response).unwrap();
        let response = String::from_utf8(response).unwrap();
        assert!(response.starts_with("HTTP/1.1 206 Partial Content"));
        assert!(response.contains("Content-Type: video/mp4"));
        assert!(response.contains("Content-Range: bytes 2-5/10"));
        assert!(response.ends_with("2345"));
        let _ = std::fs::remove_dir_all(root);
    }
}

#[tauri::command]
fn clear_custom_background(app: tauri::AppHandle) -> Result<(), String> {
    let target_dir = custom_background_dir(&app)?;
    if target_dir.exists() {
        std::fs::remove_dir_all(target_dir)
            .map_err(|error| format!("Cannot clear custom background: {}", error))?;
    }
    Ok(())
}

#[tauri::command]
fn get_install_lang() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("Cannot find exe directory")?;
    let lang_file = dir.join("install_lang.txt");
    let content = std::fs::read_to_string(&lang_file).map_err(|e| e.to_string())?;
    let lang_id: u32 = content.trim().parse::<u32>().map_err(|e| e.to_string())?;
    // NSIS language IDs: 1033 = English, 2052 = Simplified Chinese
    match lang_id {
        2052 => Ok("zh".to_string()),
        _ => Ok("en".to_string()),
    }
}

#[derive(serde::Serialize)]
struct InstallConfig {
    language: String,
    install_path: String,
}

#[tauri::command]
fn get_install_config() -> Result<InstallConfig, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("Cannot find exe directory")?;

    // Search for install_config.json in exe dir, then parent dirs (up to 3 levels)
    let mut config_file = None;
    let mut search_dir = dir;
    for _ in 0..4 {
        let candidate = search_dir.join("install_config.json");
        if candidate.exists() {
            config_file = Some(candidate);
            break;
        }
        match search_dir.parent() {
            Some(p) => search_dir = p,
            None => break,
        }
    }

    // Fallback: return defaults if install_config.json not found (e.g. running without installer)
    if config_file.is_none() {
        let default_path = dirs::document_dir()
            .map(|d| d.join("ToolKnit").to_string_lossy().to_string())
            .unwrap_or_default();
        return Ok(InstallConfig {
            language: "zh".to_string(),
            install_path: default_path,
        });
    }

    let config_file = config_file.unwrap();
    let content = std::fs::read_to_string(&config_file)
        .map_err(|e| format!("Cannot read install_config.json: {}", e))?;
    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Cannot parse install_config.json: {}", e))?;
    let language = config
        .get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("zh")
        .to_string();
    let install_path = config
        .get("installPath")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(InstallConfig {
        language,
        install_path,
    })
}

// ===== Audio Conversion =====

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};

static IS_CONVERTING: AtomicBool = AtomicBool::new(false);
static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);
static CURRENT_CHILD_ID: AtomicU32 = AtomicU32::new(0);
static PDF_DECRYPT_TEMP_ID: AtomicU64 = AtomicU64::new(0);
static VIDEO_CONVERT_TEMP_ID: AtomicU64 = AtomicU64::new(0);
static AUDIO_CONVERT_TEMP_ID: AtomicU64 = AtomicU64::new(0);
static IS_MODEL_DOWNLOADING: AtomicBool = AtomicBool::new(false);
static IS_FFMPEG_DOWNLOADING: AtomicBool = AtomicBool::new(false);
static CANCEL_MODEL_DOWNLOAD: AtomicBool = AtomicBool::new(false);
static CANCEL_FFMPEG_DOWNLOAD: AtomicBool = AtomicBool::new(false);
static TRANSCRIPTION_TEMP_ID: AtomicU64 = AtomicU64::new(0);
static ACTIVE_VIDEO_CHILDREN: std::sync::OnceLock<
    std::sync::Mutex<std::collections::BTreeSet<u32>>,
> = std::sync::OnceLock::new();
static ICON_ARCHIVE_WRITE_ID: AtomicU64 = AtomicU64::new(0);
static ICON_ARCHIVE_WRITES: std::sync::OnceLock<
    std::sync::Mutex<std::collections::BTreeMap<u64, IconArchiveWrite>>,
> = std::sync::OnceLock::new();

const MAX_ICON_ARCHIVE_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Clone)]
struct IconArchiveWrite {
    temporary_path: std::path::PathBuf,
    output_directory: std::path::PathBuf,
    file_name: String,
}

fn icon_archive_writes(
) -> &'static std::sync::Mutex<std::collections::BTreeMap<u64, IconArchiveWrite>> {
    ICON_ARCHIVE_WRITES.get_or_init(|| std::sync::Mutex::new(std::collections::BTreeMap::new()))
}

fn active_video_children() -> &'static std::sync::Mutex<std::collections::BTreeSet<u32>> {
    ACTIVE_VIDEO_CHILDREN.get_or_init(|| std::sync::Mutex::new(std::collections::BTreeSet::new()))
}

fn terminate_conversion_process(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(0x08000000)
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("kill")
            .arg("-9")
            .arg(pid.to_string())
            .spawn();
    }
}

const MAX_IMAGE_BATCH_FILES: usize = 100;
const MAX_IMAGE_FILE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS: u64 = 40_000_000;

struct ConversionGuard;

impl Drop for ConversionGuard {
    fn drop(&mut self) {
        CURRENT_CHILD_ID.store(0, Ordering::SeqCst);
        IS_CONVERTING.store(false, Ordering::SeqCst);
        CANCEL_FLAG.store(false, Ordering::SeqCst);
    }
}

fn begin_conversion() -> Result<ConversionGuard, String> {
    IS_CONVERTING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .map_err(|_| "Another file conversion is already in progress".to_string())?;
    CANCEL_FLAG.store(false, Ordering::SeqCst);
    Ok(ConversionGuard)
}

const FFMPEG_RUNTIME_DIRECTORY: &str = "ffmpeg";
const FFMPEG_ARCHIVE_BYTES: u64 = 29_581_307;
const FFMPEG_ARCHIVE_SHA256: &str =
    "8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77";
const FFMPEG_OFFICIAL_URL: &str =
    "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz";
const FFMPEG_CHINA_URL: &str =
    "https://cdn.npmmirror.com/binaries/ffmpeg-static/b6.1.1/ffmpeg-win32-x64.gz";
const FFMPEG_CHINA_FALLBACK_URL: &str = "https://gh-proxy.com/https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz";

fn ffmpeg_runtime_dir() -> Result<std::path::PathBuf, String> {
    Ok(toolknit_app_data_dir()?.join(FFMPEG_RUNTIME_DIRECTORY))
}
fn ffmpeg_runtime_path() -> Result<std::path::PathBuf, String> {
    Ok(ffmpeg_runtime_dir()?.join(if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    }))
}
fn path_ffmpeg() -> Option<std::path::PathBuf> {
    let name = if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join(name))
            .find(|candidate| candidate.is_file())
    })
}

fn get_ffmpeg_path() -> Result<std::path::PathBuf, String> {
    let runtime = ffmpeg_runtime_path()?;
    if runtime.is_file() {
        return Ok(runtime);
    }

    // Keep the checked-in fixture available for local debug builds and Rust tests,
    // but never let a release build silently use it after the managed runtime is removed.
    #[cfg(debug_assertions)]
    {
        let exe_name = if cfg!(target_os = "windows") {
            "ffmpeg.exe"
        } else {
            "ffmpeg"
        };
        let source_resource = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("ffmpeg")
            .join(exe_name);
        if source_resource.is_file() {
            return Ok(source_resource);
        }
    }

    if let Some(system) = path_ffmpeg() {
        return Ok(system);
    }
    Err("ffmpeg not installed. Open Settings > FFmpeg Runtime to download it.".to_string())
}

#[tauri::command]
fn check_ffmpeg() -> bool {
    get_ffmpeg_path()
        .map(|path| path.is_file())
        .unwrap_or(false)
}

#[derive(Clone, serde::Serialize)]
struct FfmpegRuntimeStatus {
    installed: bool,
    path: Option<String>,
    bytes: u64,
    source: Option<String>,
}
#[derive(Clone, serde::Serialize)]
struct FfmpegDownloadProgress {
    downloaded_bytes: u64,
    total_bytes: u64,
    phase: String,
}
struct FfmpegDownloadGuard;
impl Drop for FfmpegDownloadGuard {
    fn drop(&mut self) {
        IS_FFMPEG_DOWNLOADING.store(false, Ordering::SeqCst);
    }
}
fn begin_ffmpeg_download() -> Result<FfmpegDownloadGuard, String> {
    IS_FFMPEG_DOWNLOADING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .map_err(|_| "An FFmpeg download is already in progress".to_string())?;
    CANCEL_FFMPEG_DOWNLOAD.store(false, Ordering::SeqCst);
    Ok(FfmpegDownloadGuard)
}

#[tauri::command]
fn get_ffmpeg_runtime_status() -> Result<FfmpegRuntimeStatus, String> {
    let path = ffmpeg_runtime_path()?;
    let installed = path.is_file();
    Ok(FfmpegRuntimeStatus {
        installed,
        path: installed.then(|| cleanup_display_path(&path)),
        bytes: if installed {
            std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0)
        } else {
            0
        },
        source: installed.then(|| "managed".to_string()),
    })
}

fn ffmpeg_download_candidates(source: &str) -> Result<Vec<(&'static str, &'static str)>, String> {
    let china = [
        ("china", FFMPEG_CHINA_URL),
        ("china-fallback", FFMPEG_CHINA_FALLBACK_URL),
    ];
    let official = [("official", FFMPEG_OFFICIAL_URL)];
    Ok(match source {
        "auto" | "auto-china" => china.into_iter().chain(official).collect(),
        "auto-official" => official.into_iter().chain(china).collect(),
        "china" => china.into_iter().collect(),
        "official" => official.into_iter().collect(),
        _ => return Err("Unknown FFmpeg download source".to_string()),
    })
}

fn extract_ffmpeg_executable(
    archive: &std::path::Path,
    destination: &std::path::Path,
) -> Result<(), String> {
    use flate2::read::GzDecoder;
    use std::io::{Read, Write};
    let file = std::fs::File::open(archive)
        .map_err(|error| format!("Cannot open FFmpeg archive: {}", error))?;
    let mut entry = GzDecoder::new(file);
    let temporary = destination.with_extension("exe.part");
    let mut output = std::fs::File::create(&temporary)
        .map_err(|error| format!("Cannot create FFmpeg runtime: {}", error))?;
    let mut buffer = [0_u8; 64 * 1024];
    let mut extracted = 0_u64;
    loop {
        let count = entry
            .read(&mut buffer)
            .map_err(|error| format!("Cannot extract FFmpeg: {}", error))?;
        if count == 0 {
            break;
        }
        extracted = extracted.saturating_add(count as u64);
        if extracted > 250 * 1024 * 1024 {
            drop(output);
            let _ = std::fs::remove_file(&temporary);
            return Err("FFmpeg executable in archive is invalid".to_string());
        }
        output
            .write_all(&buffer[..count])
            .map_err(|error| format!("Cannot write FFmpeg runtime: {}", error))?;
    }
    if extracted < 1024 * 1024 {
        drop(output);
        let _ = std::fs::remove_file(&temporary);
        return Err("FFmpeg executable in archive is invalid".to_string());
    }
    output
        .sync_all()
        .map_err(|error| format!("Cannot finalize FFmpeg runtime: {}", error))?;
    drop(output);
    if destination.exists() {
        let _ = std::fs::remove_file(destination);
    }
    std::fs::rename(&temporary, destination)
        .map_err(|error| format!("Cannot install FFmpeg runtime: {}", error))
}

#[tauri::command]
async fn download_ffmpeg_runtime(
    app_handle: tauri::AppHandle,
    source: Option<String>,
) -> Result<FfmpegRuntimeStatus, String> {
    use std::io::Write;
    let _guard = begin_ffmpeg_download()?;
    let directory = ffmpeg_runtime_dir()?;
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("Cannot create FFmpeg runtime directory: {}", error))?;
    let archive = directory.join("ffmpeg-download.gz.part");
    let _ = std::fs::remove_file(directory.join("ffmpeg-download.zip.part"));
    let requested = source
        .as_deref()
        .unwrap_or("auto")
        .trim()
        .to_ascii_lowercase();
    let candidates = ffmpeg_download_candidates(&requested)?;
    let client = reqwest::Client::builder()
        .user_agent("ToolKnit/1.3 ffmpeg-runtime-manager")
        .connect_timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|error| format!("Cannot initialize FFmpeg download: {}", error))?;
    let mut last_error = None;
    for (candidate, url) in candidates {
        if CANCEL_FFMPEG_DOWNLOAD.load(Ordering::SeqCst) {
            return Err("dependency-download:cancelled".to_string());
        }
        let mut resume_from = std::fs::metadata(&archive)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        if resume_from > FFMPEG_ARCHIVE_BYTES {
            let _ = std::fs::remove_file(&archive);
            resume_from = 0;
        }
        let mut request = client.get(url);
        if resume_from > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={}-", resume_from));
        }
        let mut response = match request.send().await {
            Ok(response) if response.status().is_success() => response,
            Ok(response) => {
                last_error = Some(format!("{}: HTTP {}", candidate, response.status()));
                continue;
            }
            Err(error) => {
                last_error = Some(format!("{}: {}", candidate, error));
                continue;
            }
        };
        let append = resume_from > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
        if !append && resume_from > 0 {
            resume_from = 0;
        }
        let mut downloaded = if append { resume_from } else { 0 };
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(append)
            .truncate(!append)
            .open(&archive)
            .map_err(|error| format!("Cannot create FFmpeg download: {}", error))?;
        let _ = app_handle.emit(
            "ffmpeg-runtime-download-progress",
            FfmpegDownloadProgress {
                downloaded_bytes: downloaded,
                total_bytes: FFMPEG_ARCHIVE_BYTES,
                phase: "downloading".to_string(),
            },
        );
        let mut failed = None;
        loop {
            if CANCEL_FFMPEG_DOWNLOAD.load(Ordering::SeqCst) {
                let _ = file.sync_all();
                return Err("dependency-download:cancelled".to_string());
            }
            match response.chunk().await {
                Ok(Some(chunk)) => {
                    downloaded = downloaded.saturating_add(chunk.len() as u64);
                    if downloaded > FFMPEG_ARCHIVE_BYTES {
                        failed =
                            Some("FFmpeg package is larger than the expected size".to_string());
                        break;
                    }
                    if let Err(error) = file.write_all(&chunk) {
                        failed = Some(format!("Cannot write FFmpeg download: {}", error));
                        break;
                    }
                    let _ = app_handle.emit(
                        "ffmpeg-runtime-download-progress",
                        FfmpegDownloadProgress {
                            downloaded_bytes: downloaded,
                            total_bytes: FFMPEG_ARCHIVE_BYTES,
                            phase: "downloading".to_string(),
                        },
                    );
                }
                Ok(None) => break,
                Err(error) => {
                    failed = Some(format!("FFmpeg download interrupted: {}", error));
                    break;
                }
            }
        }
        let _ = file.sync_all();
        drop(file);
        if let Some(error) = failed {
            last_error = Some(error);
            continue;
        }
        if downloaded != FFMPEG_ARCHIVE_BYTES {
            last_error = Some(format!(
                "Downloaded FFmpeg package is incomplete ({}/{})",
                downloaded, FFMPEG_ARCHIVE_BYTES
            ));
            continue;
        }
        let archive_for_hash = archive.clone();
        let actual_hash = tokio::task::spawn_blocking(move || sha256_file(&archive_for_hash))
            .await
            .map_err(|error| format!("Cannot verify FFmpeg package: {}", error))??;
        if actual_hash != FFMPEG_ARCHIVE_SHA256 {
            let _ = std::fs::remove_file(&archive);
            last_error = Some("FFmpeg package integrity check failed".to_string());
            continue;
        }
        let _ = app_handle.emit(
            "ffmpeg-runtime-download-progress",
            FfmpegDownloadProgress {
                downloaded_bytes: downloaded,
                total_bytes: FFMPEG_ARCHIVE_BYTES,
                phase: "installing".to_string(),
            },
        );
        let archive_for_extract = archive.clone();
        let executable = ffmpeg_runtime_path()?;
        let extraction = tokio::task::spawn_blocking(move || {
            extract_ffmpeg_executable(&archive_for_extract, &executable)
        })
        .await
        .map_err(|error| format!("Cannot install FFmpeg runtime: {}", error))?;
        if let Err(error) = extraction {
            last_error = Some(error);
            let _ = std::fs::remove_file(&archive);
            continue;
        }
        let _ = std::fs::remove_file(&archive);
        let executable = ffmpeg_runtime_path()?;
        let valid = tokio::task::spawn_blocking(move || {
            std::process::Command::new(&executable)
                .arg("-version")
                .output()
                .map(|result| result.status.success())
                .unwrap_or(false)
        })
        .await
        .map_err(|error| format!("Cannot validate FFmpeg runtime: {}", error))?;
        if !valid {
            let _ = std::fs::remove_file(ffmpeg_runtime_path()?);
            return Err(
                "FFmpeg executable validation failed; the downloaded runtime was removed"
                    .to_string(),
            );
        }
        let _ = app_handle.emit(
            "ffmpeg-runtime-download-progress",
            FfmpegDownloadProgress {
                downloaded_bytes: downloaded,
                total_bytes: FFMPEG_ARCHIVE_BYTES,
                phase: "complete".to_string(),
            },
        );
        return get_ffmpeg_runtime_status();
    }
    Err(format!(
        "Cannot download FFmpeg: {}",
        last_error.unwrap_or_else(|| "unknown error".to_string())
    ))
}

#[tauri::command]
fn delete_ffmpeg_runtime() -> Result<(), String> {
    let directory = ffmpeg_runtime_dir()?;
    if directory.exists() {
        std::fs::remove_dir_all(directory)
            .map_err(|error| format!("Cannot delete FFmpeg runtime: {}", error))?;
    }
    Ok(())
}

#[tauri::command]
fn cancel_dependency_downloads() {
    CANCEL_FFMPEG_DOWNLOAD.store(true, Ordering::SeqCst);
    CANCEL_MODEL_DOWNLOAD.store(true, Ordering::SeqCst);
}

// ===== Offline transcription model management =====

const TRANSCRIPTION_MODEL_DIRECTORY: &str = "models";
const TRANSCRIPTION_MODEL_CONFIG: &str = "transcription-model.json";

struct TranscriptionModelSpec {
    id: &'static str,
    file_name: &'static str,
    display_name: &'static str,
    bytes: u64,
    sha256: &'static str,
}

const TRANSCRIPTION_MODELS: [TranscriptionModelSpec; 3] = [
    TranscriptionModelSpec {
        id: "base",
        file_name: "ggml-base.bin",
        display_name: "Whisper Base",
        bytes: 147_951_465,
        sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
    },
    TranscriptionModelSpec {
        id: "small",
        file_name: "ggml-small.bin",
        display_name: "Whisper Small",
        bytes: 487_601_967,
        sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
    },
    TranscriptionModelSpec {
        id: "medium",
        file_name: "ggml-medium.bin",
        display_name: "Whisper Medium",
        bytes: 1_533_763_059,
        sha256: "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208",
    },
];

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct TranscriptionModelConfig {
    current_model: Option<String>,
}

#[derive(serde::Serialize)]
struct TranscriptionModelStatus {
    id: String,
    display_name: String,
    bytes: u64,
    installed: bool,
    current: bool,
}

#[derive(Clone, serde::Serialize)]
struct ModelDownloadProgress {
    model_id: String,
    downloaded_bytes: u64,
    total_bytes: u64,
    phase: String,
}

#[derive(serde::Serialize)]
struct ModelDownloadResult {
    model_id: String,
    path: String,
    current: bool,
}

struct ModelDownloadGuard;

impl Drop for ModelDownloadGuard {
    fn drop(&mut self) {
        IS_MODEL_DOWNLOADING.store(false, Ordering::SeqCst);
    }
}

fn begin_model_download() -> Result<ModelDownloadGuard, String> {
    IS_MODEL_DOWNLOADING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .map_err(|_| "A model download is already in progress".to_string())?;
    CANCEL_MODEL_DOWNLOAD.store(false, Ordering::SeqCst);
    Ok(ModelDownloadGuard)
}

fn transcription_model_spec(model_id: &str) -> Result<&'static TranscriptionModelSpec, String> {
    TRANSCRIPTION_MODELS
        .iter()
        .find(|model| model.id == model_id.trim().to_ascii_lowercase())
        .ok_or("Unknown transcription model".to_string())
}

fn transcription_models_dir() -> Result<std::path::PathBuf, String> {
    Ok(toolknit_app_data_dir()?.join(TRANSCRIPTION_MODEL_DIRECTORY))
}

fn transcription_model_path(model: &TranscriptionModelSpec) -> Result<std::path::PathBuf, String> {
    Ok(transcription_models_dir()?.join(model.file_name))
}

fn transcription_model_config_path() -> Result<std::path::PathBuf, String> {
    Ok(toolknit_app_data_dir()?.join(TRANSCRIPTION_MODEL_CONFIG))
}

fn read_transcription_model_config() -> TranscriptionModelConfig {
    transcription_model_config_path()
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_transcription_model_config(config: &TranscriptionModelConfig) -> Result<(), String> {
    let path = transcription_model_config_path()?;
    let parent = path
        .parent()
        .ok_or("Invalid model configuration directory")?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("Cannot create model configuration directory: {}", error))?;
    let encoded = serde_json::to_vec(config)
        .map_err(|error| format!("Cannot save model configuration: {}", error))?;
    std::fs::write(path, encoded)
        .map_err(|error| format!("Cannot save model configuration: {}", error))
}

fn installed_model_file(
    model: &TranscriptionModelSpec,
) -> Result<Option<std::path::PathBuf>, String> {
    let path = transcription_model_path(model)?;
    let metadata = match std::fs::metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Cannot inspect model file: {}", error)),
    };
    if metadata.is_file() && metadata.len() == model.bytes {
        Ok(Some(path))
    } else {
        Ok(None)
    }
}

fn transcription_model_source(
    model: &TranscriptionModelSpec,
    source: Option<&str>,
) -> Result<String, String> {
    let source = source.unwrap_or("auto").trim().to_ascii_lowercase();
    let root = match source.as_str() {
        "official" => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main",
        "china" => "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main",
        // The desktop can retry with `china` after an official failure. `auto` begins with the upstream source.
        "auto" => "https://huggingface.co/ggerganov/whisper.cpp/resolve/main",
        _ => return Err("Unknown model download source".to_string()),
    };
    Ok(format!("{}/{}", root, model.file_name))
}

fn sha256_file(path: &std::path::Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;

    let mut file =
        std::fs::File::open(path).map_err(|error| format!("Cannot open model file: {}", error))?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Cannot read model file: {}", error))?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn get_whisper_cli_path() -> Result<std::path::PathBuf, String> {
    let executable = if cfg!(target_os = "windows") {
        "whisper-cli.exe"
    } else {
        "whisper-cli"
    };
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let exe_dir = exe.parent().ok_or("Cannot find executable directory")?;
    let bundled = exe_dir
        .join("resources")
        .join("whisper")
        .join("Release")
        .join(executable);
    if bundled.is_file() {
        return Ok(bundled);
    }

    let source_resource = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("whisper")
        .join("Release")
        .join(executable);
    if source_resource.is_file() {
        return Ok(source_resource);
    }
    Err("Offline transcription engine is unavailable. Please reinstall ToolKnit.".to_string())
}

#[tauri::command]
fn check_transcription_engine() -> bool {
    get_whisper_cli_path()
        .map(|path| path.is_file())
        .unwrap_or(false)
}

#[tauri::command]
fn list_transcription_models() -> Result<Vec<TranscriptionModelStatus>, String> {
    let config = read_transcription_model_config();
    TRANSCRIPTION_MODELS
        .iter()
        .map(|model| {
            let installed = installed_model_file(model)?.is_some();
            Ok(TranscriptionModelStatus {
                id: model.id.to_string(),
                display_name: model.display_name.to_string(),
                bytes: model.bytes,
                installed,
                current: installed && config.current_model.as_deref() == Some(model.id),
            })
        })
        .collect()
}

#[tauri::command]
fn set_current_transcription_model(model_id: String) -> Result<(), String> {
    let model = transcription_model_spec(&model_id)?;
    if installed_model_file(model)?.is_none() {
        return Err("Install this offline model before selecting it".to_string());
    }
    write_transcription_model_config(&TranscriptionModelConfig {
        current_model: Some(model.id.to_string()),
    })
}

#[tauri::command]
fn delete_transcription_model(model_id: String) -> Result<(), String> {
    let model = transcription_model_spec(&model_id)?;
    let path = transcription_model_path(model)?;
    let partial = path.with_extension("bin.part");
    if path.exists() {
        std::fs::remove_file(&path).map_err(|error| format!("Cannot delete model: {}", error))?;
    }
    if partial.exists() {
        let _ = std::fs::remove_file(partial);
    }
    let mut config = read_transcription_model_config();
    if config.current_model.as_deref() == Some(model.id) {
        config.current_model = None;
        write_transcription_model_config(&config)?;
    }
    Ok(())
}

#[tauri::command]
async fn download_transcription_model(
    app_handle: tauri::AppHandle,
    model_id: String,
    source: Option<String>,
) -> Result<ModelDownloadResult, String> {
    use std::io::Write;

    let _download_guard = begin_model_download()?;
    let model = transcription_model_spec(&model_id)?;
    let target = transcription_model_path(model)?;
    let parent = target.parent().ok_or("Invalid model directory")?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("Cannot create model directory: {}", error))?;

    if let Some(existing) = installed_model_file(model)? {
        let expected = model.sha256.to_string();
        let verified = tokio::task::spawn_blocking(move || sha256_file(&existing))
            .await
            .map_err(|error| format!("Cannot verify model: {}", error))??;
        if verified == expected {
            let config = read_transcription_model_config();
            return Ok(ModelDownloadResult {
                model_id: model.id.to_string(),
                path: target.to_string_lossy().into_owned(),
                current: config.current_model.as_deref() == Some(model.id),
            });
        }
        let _ = std::fs::remove_file(&target);
    }

    let partial = target.with_extension("bin.part");
    let client = reqwest::Client::builder()
        .user_agent("ToolKnit/1.3 offline-model-manager")
        .build()
        .map_err(|error| format!("Cannot initialize model download: {}", error))?;
    let requested_source = source
        .as_deref()
        .unwrap_or("auto")
        .trim()
        .to_ascii_lowercase();
    let candidates: Vec<&str> = match requested_source.as_str() {
        "auto" => vec!["official", "china"],
        "official" | "china" => vec![requested_source.as_str()],
        _ => return Err("Unknown model download source".to_string()),
    };
    let mut last_error = None;
    for candidate in candidates {
        if CANCEL_MODEL_DOWNLOAD.load(Ordering::SeqCst) {
            return Err("dependency-download:cancelled".to_string());
        }
        // A failed stream may have extended the partial file. Read its size
        // again for every mirror attempt so the Range header stays correct.
        let mut resume_from = std::fs::metadata(&partial)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        if resume_from > model.bytes {
            let _ = std::fs::remove_file(&partial);
            resume_from = 0;
        }
        let url = transcription_model_source(model, Some(candidate))?;
        let mut request = client.get(url);
        if resume_from > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={}-", resume_from));
        }
        let mut response = match request.send().await {
            Ok(candidate_response) if candidate_response.status().is_success() => {
                candidate_response
            }
            Ok(candidate_response) => {
                last_error = Some(format!("HTTP {}", candidate_response.status()));
                continue;
            }
            Err(error) => {
                last_error = Some(error.to_string());
                continue;
            }
        };
        let append = resume_from > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
        if !append && resume_from > 0 {
            resume_from = 0;
        }
        let mut downloaded = if append { resume_from } else { 0 };
        let mut output = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(append)
            .truncate(!append)
            .open(&partial)
            .map_err(|error| format!("Cannot create model download: {}", error))?;
        let _ = app_handle.emit(
            "transcription-model-download-progress",
            ModelDownloadProgress {
                model_id: model.id.to_string(),
                downloaded_bytes: downloaded,
                total_bytes: model.bytes,
                phase: "downloading".to_string(),
            },
        );
        let stream_error = loop {
            if CANCEL_MODEL_DOWNLOAD.load(Ordering::SeqCst) {
                output
                    .sync_all()
                    .map_err(|error| format!("Cannot preserve model download: {}", error))?;
                return Err("dependency-download:cancelled".to_string());
            }
            match response.chunk().await {
                Ok(Some(chunk)) => {
                    output
                        .write_all(&chunk)
                        .map_err(|error| format!("Cannot write model download: {}", error))?;
                    downloaded = downloaded.saturating_add(chunk.len() as u64);
                    let _ = app_handle.emit(
                        "transcription-model-download-progress",
                        ModelDownloadProgress {
                            model_id: model.id.to_string(),
                            downloaded_bytes: downloaded,
                            total_bytes: model.bytes,
                            phase: "downloading".to_string(),
                        },
                    );
                }
                Ok(None) => break None,
                Err(error) => break Some(error.to_string()),
            }
        };
        output
            .sync_all()
            .map_err(|error| format!("Cannot finalize model download: {}", error))?;
        drop(output);
        if let Some(error) = stream_error {
            last_error = Some(format!("Model download interrupted: {}", error));
            continue;
        }
        if downloaded != model.bytes {
            if downloaded >= model.bytes {
                let _ = std::fs::remove_file(&partial);
            }
            last_error =
                Some("Downloaded model size does not match the expected package".to_string());
            continue;
        }
        let _ = app_handle.emit(
            "transcription-model-download-progress",
            ModelDownloadProgress {
                model_id: model.id.to_string(),
                downloaded_bytes: downloaded,
                total_bytes: model.bytes,
                phase: "verifying".to_string(),
            },
        );
        let path_for_hash = partial.clone();
        let actual_hash = tokio::task::spawn_blocking(move || sha256_file(&path_for_hash))
            .await
            .map_err(|error| format!("Cannot verify model: {}", error))??;
        if actual_hash != model.sha256 {
            let _ = std::fs::remove_file(&partial);
            last_error =
                Some("Model integrity check failed. The incomplete file was removed.".to_string());
            continue;
        }
        if target.exists() {
            let _ = std::fs::remove_file(&target);
        }
        std::fs::rename(&partial, &target)
            .map_err(|error| format!("Cannot install model: {}", error))?;

        let mut config = read_transcription_model_config();
        if config.current_model.is_none() || model.id == "small" {
            config.current_model = Some(model.id.to_string());
            write_transcription_model_config(&config)?;
        }
        let current = config.current_model.as_deref() == Some(model.id);
        let _ = app_handle.emit(
            "transcription-model-download-progress",
            ModelDownloadProgress {
                model_id: model.id.to_string(),
                downloaded_bytes: model.bytes,
                total_bytes: model.bytes,
                phase: "complete".to_string(),
            },
        );
        return Ok(ModelDownloadResult {
            model_id: model.id.to_string(),
            path: target.to_string_lossy().into_owned(),
            current,
        });
    }
    Err(format!(
        "Cannot download model: {}",
        last_error.unwrap_or_else(|| "unknown error".to_string())
    ))
}

#[derive(serde::Serialize)]
struct TranscriptionResult {
    model_id: String,
    raw_json_path: String,
    raw_srt_path: String,
    raw_txt_path: String,
}

#[derive(Clone, serde::Serialize)]
struct TranscriptionProgress {
    phase: String,
    progress: u8,
}

fn transcription_input_path(input_path: &str) -> Result<std::path::PathBuf, String> {
    const SUPPORTED_EXTENSIONS: &[&str] = &[
        "mp3", "aac", "m4a", "wav", "flac", "alac", "ogg", "wma", "mp4", "mkv", "avi", "mov",
        "webm", "flv", "wmv", "ts",
    ];
    if input_path.trim().is_empty() || input_path.contains('\0') {
        return Err("transcription:invalid-input".to_string());
    }
    let path = std::path::PathBuf::from(input_path)
        .canonicalize()
        .map_err(|_| "transcription:input-not-found".to_string())?;
    let metadata =
        std::fs::metadata(&path).map_err(|_| "transcription:input-not-found".to_string())?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > 10 * 1024 * 1024 * 1024
        || !SUPPORTED_EXTENSIONS.contains(&extension.as_str())
    {
        return Err("transcription:invalid-input".to_string());
    }
    Ok(path)
}

fn transcription_output_dir(output_dir: &str) -> Result<std::path::PathBuf, String> {
    if output_dir.trim().is_empty() || output_dir.contains('\0') {
        return Err("transcription:invalid-output".to_string());
    }
    let path = std::path::PathBuf::from(output_dir);
    is_path_safe(&path).map_err(|_| "transcription:invalid-output".to_string())?;
    std::fs::create_dir_all(&path).map_err(|_| "transcription:invalid-output".to_string())?;
    let path = path
        .canonicalize()
        .map_err(|_| "transcription:invalid-output".to_string())?;
    is_path_safe(&path).map_err(|_| "transcription:invalid-output".to_string())?;
    Ok(path)
}

fn transcription_language(language: &str) -> Result<&str, String> {
    match language.trim().to_ascii_lowercase().as_str() {
        "auto" => Ok("auto"),
        "zh" | "zh-cn" | "chinese" => Ok("zh"),
        "en" | "en-us" | "english" => Ok("en"),
        _ => Err("transcription:invalid-language".to_string()),
    }
}

fn transcription_output_stem(input: &std::path::Path) -> String {
    let stem = input
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("transcript");
    let normalized: String = stem
        .chars()
        .map(|character| {
            if matches!(
                character,
                '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0'
            ) || character.is_control()
            {
                '_'
            } else {
                character
            }
        })
        .collect();
    let normalized = normalized.trim().trim_end_matches('.').trim_end();
    if normalized.is_empty() {
        "transcript".to_string()
    } else {
        normalized.chars().take(96).collect()
    }
}

fn create_transcription_temp_dir(
    output_dir: &std::path::Path,
) -> Result<std::path::PathBuf, String> {
    for _ in 0..10_000 {
        let id = TRANSCRIPTION_TEMP_ID.fetch_add(1, Ordering::SeqCst);
        let candidate = output_dir.join(format!(
            ".toolknit-transcription-{}-{}",
            std::process::id(),
            id
        ));
        match std::fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("transcription:invalid-output".to_string()),
        }
    }
    Err("transcription:invalid-output".to_string())
}

async fn run_transcription_command(
    command: &std::path::Path,
    arguments: &[std::ffi::OsString],
) -> Result<std::process::Output, String> {
    let mut process = tokio::process::Command::new(command);
    process
        .args(arguments)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        process.creation_flags(0x08000000);
    }
    let child = process
        .spawn()
        .map_err(|_| "transcription:engine-failed".to_string())?;
    CURRENT_CHILD_ID.store(child.id().unwrap_or(0), Ordering::SeqCst);
    let output = child
        .wait_with_output()
        .await
        .map_err(|_| "transcription:engine-failed".to_string())?;
    CURRENT_CHILD_ID.store(0, Ordering::SeqCst);
    if CANCEL_FLAG.load(Ordering::SeqCst) {
        return Err("transcription:cancelled".to_string());
    }
    Ok(output)
}

fn publish_transcription_outputs(
    temp_dir: &std::path::Path,
    output_dir: &std::path::Path,
    stem: &str,
) -> Result<(std::path::PathBuf, std::path::PathBuf, std::path::PathBuf), String> {
    let source_json = temp_dir.join("transcript.json");
    let source_srt = temp_dir.join("transcript.srt");
    let source_txt = temp_dir.join("transcript.txt");
    if !source_json.is_file() || !source_srt.is_file() || !source_txt.is_file() {
        return Err("transcription:engine-failed".to_string());
    }
    for index in 0..10_000_u32 {
        let suffix = if index == 0 {
            String::new()
        } else {
            format!("_{}", index)
        };
        let json = output_dir.join(format!("{}_transcript{}.json", stem, suffix));
        let srt = output_dir.join(format!("{}_transcript{}.srt", stem, suffix));
        let txt = output_dir.join(format!("{}_transcript{}.txt", stem, suffix));
        if json.exists() || srt.exists() || txt.exists() {
            continue;
        }
        if std::fs::hard_link(&source_json, &json).is_err() {
            continue;
        }
        if std::fs::hard_link(&source_srt, &srt).is_err() {
            let _ = std::fs::remove_file(&json);
            continue;
        }
        if std::fs::hard_link(&source_txt, &txt).is_err() {
            let _ = std::fs::remove_file(&json);
            let _ = std::fs::remove_file(&srt);
            continue;
        }
        return Ok((json, srt, txt));
    }
    Err("transcription:invalid-output".to_string())
}

#[tauri::command]
async fn transcribe_media(
    app_handle: tauri::AppHandle,
    input_path: String,
    output_dir: String,
    language: String,
) -> Result<TranscriptionResult, String> {
    let _conversion_guard = begin_conversion()?;
    let input = transcription_input_path(&input_path)?;
    let output_dir = transcription_output_dir(&output_dir)?;
    let language = transcription_language(&language)?;
    let config = read_transcription_model_config();
    let model_id = config
        .current_model
        .ok_or("transcription:model-not-installed".to_string())?;
    let model = transcription_model_spec(&model_id)?;
    let model_path =
        installed_model_file(model)?.ok_or("transcription:model-not-installed".to_string())?;
    let ffmpeg = get_ffmpeg_path().map_err(|_| "transcription:ffmpeg-unavailable".to_string())?;
    let whisper =
        get_whisper_cli_path().map_err(|_| "transcription:engine-unavailable".to_string())?;
    let temp_dir = create_transcription_temp_dir(&output_dir)?;
    let wav = temp_dir.join("input.wav");
    let _ = app_handle.emit(
        "transcription-progress",
        TranscriptionProgress {
            phase: "preparing".to_string(),
            progress: 5,
        },
    );

    let ffmpeg_args = vec![
        std::ffi::OsString::from("-hide_banner"),
        std::ffi::OsString::from("-nostdin"),
        std::ffi::OsString::from("-y"),
        std::ffi::OsString::from("-i"),
        input.as_os_str().to_os_string(),
        std::ffi::OsString::from("-vn"),
        std::ffi::OsString::from("-ac"),
        std::ffi::OsString::from("1"),
        std::ffi::OsString::from("-ar"),
        std::ffi::OsString::from("16000"),
        std::ffi::OsString::from("-c:a"),
        std::ffi::OsString::from("pcm_s16le"),
        wav.as_os_str().to_os_string(),
    ];
    let prepared = run_transcription_command(&ffmpeg, &ffmpeg_args).await?;
    if !prepared.status.success() || !wav.is_file() {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err("transcription:prepare-failed".to_string());
    }
    let _ = app_handle.emit(
        "transcription-progress",
        TranscriptionProgress {
            phase: "transcribing".to_string(),
            progress: 15,
        },
    );
    let whisper_args = vec![
        std::ffi::OsString::from("-m"),
        model_path.as_os_str().to_os_string(),
        std::ffi::OsString::from("-f"),
        wav.as_os_str().to_os_string(),
        std::ffi::OsString::from("-l"),
        std::ffi::OsString::from(language),
        std::ffi::OsString::from("-otxt"),
        std::ffi::OsString::from("-osrt"),
        std::ffi::OsString::from("-oj"),
        std::ffi::OsString::from("-ojf"),
        std::ffi::OsString::from("-np"),
        std::ffi::OsString::from("-of"),
        temp_dir.join("transcript").as_os_str().to_os_string(),
    ];
    let transcribed = run_transcription_command(&whisper, &whisper_args).await?;
    if !transcribed.status.success() {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err("transcription:engine-failed".to_string());
    }
    let _ = app_handle.emit(
        "transcription-progress",
        TranscriptionProgress {
            phase: "publishing".to_string(),
            progress: 95,
        },
    );
    let stem = transcription_output_stem(&input);
    let published = publish_transcription_outputs(&temp_dir, &output_dir, &stem);
    let _ = std::fs::remove_dir_all(&temp_dir);
    let (raw_json_path, raw_srt_path, raw_txt_path) = published?;
    let _ = app_handle.emit(
        "transcription-progress",
        TranscriptionProgress {
            phase: "complete".to_string(),
            progress: 100,
        },
    );
    Ok(TranscriptionResult {
        model_id: model.id.to_string(),
        raw_json_path: raw_json_path.to_string_lossy().into_owned(),
        raw_srt_path: raw_srt_path.to_string_lossy().into_owned(),
        raw_txt_path: raw_txt_path.to_string_lossy().into_owned(),
    })
}

const PDF_DECRYPT_MAX_INPUT_BYTES: u64 = 150 * 1024 * 1024;
const PDF_DECRYPT_MAX_PAGES: u32 = 200;
const PDF_COMPRESS_MAX_INPUT_BYTES: u64 = 150 * 1024 * 1024;
const PDF_COMPRESS_MAX_PAGES: u32 = 500;

fn get_qpdf_path() -> Result<std::path::PathBuf, String> {
    let exe_name = if cfg!(target_os = "windows") {
        "qpdf.exe"
    } else {
        "qpdf"
    };
    let exe = std::env::current_exe().map_err(|_| "pdf-decrypt:qpdf-unavailable".to_string())?;
    let exe_dir = exe.parent().ok_or("pdf-decrypt:qpdf-unavailable")?;
    let bundled = exe_dir.join("resources").join("qpdf").join(exe_name);
    if bundled.exists() {
        return Ok(bundled);
    }

    // Tauri dev and direct Rust checks run outside the packaged resources directory.
    let source_resource = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("qpdf")
        .join(exe_name);
    if source_resource.exists() {
        return Ok(source_resource);
    }

    Err("pdf-decrypt:qpdf-unavailable".to_string())
}

fn clear_pdf_decrypt_password(password: &mut String) {
    if !password.is_empty() {
        let zeros = "\0".repeat(password.len());
        password.replace_range(.., &zeros);
        password.clear();
    }
}

async fn run_qpdf(
    qpdf_path: &std::path::Path,
    args: &[std::ffi::OsString],
    password: Option<&str>,
) -> Result<std::process::Output, String> {
    use tokio::io::AsyncWriteExt;

    let mut command = tokio::process::Command::new(qpdf_path);
    command
        .args(args)
        .stdin(if password.is_some() {
            std::process::Stdio::piped()
        } else {
            std::process::Stdio::null()
        })
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000);
    }

    let mut child = command
        .spawn()
        .map_err(|_| "pdf-decrypt:decryption-failed".to_string())?;
    if let Some(value) = password {
        let mut stdin = child.stdin.take().ok_or("pdf-decrypt:decryption-failed")?;
        stdin
            .write_all(value.as_bytes())
            .await
            .map_err(|_| "pdf-decrypt:decryption-failed".to_string())?;
        stdin
            .write_all(b"\n")
            .await
            .map_err(|_| "pdf-decrypt:decryption-failed".to_string())?;
        stdin
            .shutdown()
            .await
            .map_err(|_| "pdf-decrypt:decryption-failed".to_string())?;
    }
    child
        .wait_with_output()
        .await
        .map_err(|_| "pdf-decrypt:decryption-failed".to_string())
}

fn create_pdf_decrypt_file_name(input_path: &std::path::Path) -> String {
    let raw_stem = input_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("document");
    let sanitized: String = raw_stem
        .chars()
        .map(|character| {
            if matches!(
                character,
                '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            ) {
                '_'
            } else {
                character
            }
        })
        .collect();
    let trimmed = sanitized
        .trim()
        .trim_end_matches(|character| character == '.' || character == ' ');
    let stem = if trimmed.is_empty() {
        "document"
    } else {
        trimmed
    };
    format!("{}_decrypted.pdf", stem)
}

fn create_pdf_decrypt_temp_path(
    output_dir: &std::path::Path,
) -> Result<std::path::PathBuf, String> {
    use std::time::{SystemTime, UNIX_EPOCH};

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "pdf-decrypt:decryption-failed".to_string())?
        .as_nanos();
    for _ in 0..100 {
        let id = PDF_DECRYPT_TEMP_ID.fetch_add(1, Ordering::Relaxed);
        let candidate = output_dir.join(format!(
            ".toolknit-decrypt-{}-{}-{}.pdf",
            std::process::id(),
            timestamp,
            id
        ));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("pdf-decrypt:decryption-failed".to_string())
}

fn publish_pdf_decrypt_output(
    temporary_path: &std::path::Path,
    output_dir: &std::path::Path,
    file_name: &str,
) -> Result<String, String> {
    let source = std::path::Path::new(file_name);
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or("pdf-decrypt:decryption-failed")?;
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("pdf");

    for counter in 0..10_000_u32 {
        let candidate_name = if counter == 0 {
            file_name.to_string()
        } else {
            format!("{}_{}.{}", stem, counter, extension)
        };
        let candidate = output_dir.join(candidate_name);
        match std::fs::hard_link(temporary_path, &candidate) {
            Ok(()) => {
                std::fs::remove_file(temporary_path)
                    .map_err(|_| "pdf-decrypt:decryption-failed".to_string())?;
                return Ok(candidate.to_string_lossy().into_owned());
            }
            Err(_) if candidate.exists() => continue,
            Err(_) => return Err("pdf-decrypt:decryption-failed".to_string()),
        }
    }
    Err("pdf-decrypt:decryption-failed".to_string())
}

fn map_qpdf_decrypt_error(output: &std::process::Output) -> String {
    let details = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
    if details.contains("invalid password") || details.contains("password supplied is incorrect") {
        "pdf-decrypt:invalid-password".to_string()
    } else if details.contains("not a pdf")
        || details.contains("damaged pdf")
        || details.contains("can't find pdf header")
    {
        "pdf-decrypt:invalid-pdf".to_string()
    } else {
        "pdf-decrypt:decryption-failed".to_string()
    }
}

#[tauri::command]
async fn decrypt_pdf(
    input_path: String,
    mut password: String,
    output_dir: Option<String>,
) -> Result<String, String> {
    let result = decrypt_pdf_inner(&input_path, &password, output_dir.as_deref()).await;
    clear_pdf_decrypt_password(&mut password);
    result
}

async fn decrypt_pdf_inner(
    input_path: &str,
    password: &str,
    requested_output_dir: Option<&str>,
) -> Result<String, String> {
    let input = std::path::Path::new(&input_path);
    if input_path.contains('\0')
        || !input.is_file()
        || !input
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("pdf"))
    {
        return Err("pdf-decrypt:invalid-pdf".to_string());
    }
    let metadata = std::fs::metadata(input).map_err(|_| "pdf-decrypt:invalid-pdf".to_string())?;
    if metadata.len() > PDF_DECRYPT_MAX_INPUT_BYTES {
        return Err("pdf-decrypt:input-too-large".to_string());
    }

    let qpdf_path = get_qpdf_path()?;
    let output_dir = requested_output_dir
        .filter(|value| !value.trim().is_empty() && !value.contains('\0'))
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            dirs::document_dir()
                .unwrap_or_default()
                .join("ToolKnit")
                .join("PDF_Decrypt")
        });
    is_path_safe(&output_dir).map_err(|_| "pdf-decrypt:output-path".to_string())?;
    std::fs::create_dir_all(&output_dir)
        .map_err(|_| "pdf-decrypt:decryption-failed".to_string())?;
    is_path_safe(&output_dir).map_err(|_| "pdf-decrypt:output-path".to_string())?;
    let temporary_path = create_pdf_decrypt_temp_path(&output_dir)?;

    let mut decrypt_args = vec![
        std::ffi::OsString::from("--warning-exit-0"),
        std::ffi::OsString::from("--decrypt"),
        input.as_os_str().to_os_string(),
        temporary_path.as_os_str().to_os_string(),
    ];
    let use_password_pipe = !password.is_empty();
    if use_password_pipe {
        decrypt_args.insert(1, std::ffi::OsString::from("--password-file=-"));
    }
    let result = run_qpdf(
        &qpdf_path,
        &decrypt_args,
        if use_password_pipe {
            Some(password)
        } else {
            None
        },
    )
    .await;
    let output = result?;
    if !output.status.success() {
        let _ = std::fs::remove_file(&temporary_path);
        return Err(map_qpdf_decrypt_error(&output));
    }

    let page_output = run_qpdf(
        &qpdf_path,
        &[
            std::ffi::OsString::from("--show-npages"),
            temporary_path.as_os_str().to_os_string(),
        ],
        None,
    )
    .await?;
    let page_count = String::from_utf8_lossy(&page_output.stdout)
        .trim()
        .parse::<u32>()
        .ok();
    if !page_output.status.success() || !matches!(page_count, Some(1..=PDF_DECRYPT_MAX_PAGES)) {
        let _ = std::fs::remove_file(&temporary_path);
        return Err(
            if page_count.is_some_and(|count| count > PDF_DECRYPT_MAX_PAGES) {
                "pdf-decrypt:too-many-pages".to_string()
            } else {
                "pdf-decrypt:invalid-pdf".to_string()
            },
        );
    }

    publish_pdf_decrypt_output(
        &temporary_path,
        &output_dir,
        &create_pdf_decrypt_file_name(input),
    )
}

#[derive(serde::Serialize)]
struct PdfCompressResult {
    original_size: u64,
    compressed_size: u64,
    output_path: Option<String>,
    output_dir: String,
}

fn create_pdf_compress_temp_path(
    output_dir: &std::path::Path,
) -> Result<std::path::PathBuf, String> {
    use std::time::{SystemTime, UNIX_EPOCH};

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "pdf-compress:compression-failed".to_string())?
        .as_nanos();
    for _ in 0..100 {
        let id = PDF_DECRYPT_TEMP_ID.fetch_add(1, Ordering::Relaxed);
        let candidate = output_dir.join(format!(
            ".toolknit-compress-{}-{}-{}.pdf",
            std::process::id(),
            timestamp,
            id
        ));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("pdf-compress:compression-failed".to_string())
}

fn create_pdf_compress_file_name(input_path: &std::path::Path) -> String {
    let raw_stem = input_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("document");
    let sanitized: String = raw_stem
        .chars()
        .map(|character| {
            if matches!(
                character,
                '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            ) {
                '_'
            } else {
                character
            }
        })
        .collect();
    let trimmed = sanitized
        .trim()
        .trim_end_matches(|character| character == '.' || character == ' ');
    let stem = if trimmed.is_empty() {
        "document"
    } else {
        trimmed
    };
    format!("{}_compressed.pdf", stem)
}

fn publish_pdf_compress_output(
    temporary_path: &std::path::Path,
    output_dir: &std::path::Path,
    file_name: &str,
) -> Result<String, String> {
    let file = std::path::Path::new(file_name);
    let stem = file
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or("pdf-compress:compression-failed")?;
    for counter in 0..10_000_u32 {
        let candidate_name = if counter == 0 {
            file_name.to_string()
        } else {
            format!("{}_{}.pdf", stem, counter)
        };
        let candidate = output_dir.join(candidate_name);
        match std::fs::hard_link(temporary_path, &candidate) {
            Ok(()) => {
                std::fs::remove_file(temporary_path)
                    .map_err(|_| "pdf-compress:compression-failed".to_string())?;
                return Ok(candidate.to_string_lossy().into_owned());
            }
            Err(_) if candidate.exists() => continue,
            Err(_) => return Err("pdf-compress:compression-failed".to_string()),
        }
    }
    Err("pdf-compress:compression-failed".to_string())
}

fn map_qpdf_compress_error(output: &std::process::Output) -> String {
    let details = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
    if details.contains("invalid password") || details.contains("encrypted") {
        "pdf-compress:password-protected".to_string()
    } else if details.contains("not a pdf")
        || details.contains("damaged pdf")
        || details.contains("can't find pdf header")
    {
        "pdf-compress:invalid-pdf".to_string()
    } else {
        "pdf-compress:compression-failed".to_string()
    }
}

#[tauri::command]
async fn compress_pdf(
    input_path: String,
    level: String,
    output_dir: Option<String>,
) -> Result<PdfCompressResult, String> {
    let input = std::path::Path::new(&input_path);
    if input_path.contains('\0')
        || !input.is_file()
        || !input
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("pdf"))
    {
        return Err("pdf-compress:invalid-pdf".to_string());
    }
    let original_size = std::fs::metadata(input)
        .map_err(|_| "pdf-compress:invalid-pdf".to_string())?
        .len();
    if original_size > PDF_COMPRESS_MAX_INPUT_BYTES {
        return Err("pdf-compress:input-too-large".to_string());
    }
    if !matches!(level.as_str(), "low" | "medium" | "high") {
        return Err("pdf-compress:invalid-level".to_string());
    }

    let qpdf_path = get_qpdf_path().map_err(|_| "pdf-compress:qpdf-unavailable".to_string())?;
    let page_output = run_qpdf(
        &qpdf_path,
        &[
            std::ffi::OsString::from("--show-npages"),
            input.as_os_str().to_os_string(),
        ],
        None,
    )
    .await
    .map_err(|_| "pdf-compress:compression-failed".to_string())?;
    if !page_output.status.success() {
        return Err(map_qpdf_compress_error(&page_output));
    }
    let page_count = String::from_utf8_lossy(&page_output.stdout)
        .trim()
        .parse::<u32>()
        .map_err(|_| "pdf-compress:invalid-pdf".to_string())?;
    if page_count == 0 {
        return Err("pdf-compress:invalid-pdf".to_string());
    }
    if page_count > PDF_COMPRESS_MAX_PAGES {
        return Err("pdf-compress:too-many-pages".to_string());
    }

    let output_dir = output_dir
        .filter(|value| !value.trim().is_empty() && !value.contains('\0'))
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            dirs::document_dir()
                .unwrap_or_default()
                .join("ToolKnit")
                .join("PDF_Compress")
        });
    is_path_safe(&output_dir).map_err(|_| "pdf-compress:output-path".to_string())?;
    std::fs::create_dir_all(&output_dir)
        .map_err(|_| "pdf-compress:compression-failed".to_string())?;
    is_path_safe(&output_dir).map_err(|_| "pdf-compress:output-path".to_string())?;
    let temporary_path = create_pdf_compress_temp_path(&output_dir)?;
    let mut args = vec![
        std::ffi::OsString::from("--warning-exit-0"),
        std::ffi::OsString::from("--object-streams=generate"),
        std::ffi::OsString::from("--compress-streams=y"),
    ];
    if level != "low" {
        args.push(std::ffi::OsString::from("--recompress-flate"));
        args.push(std::ffi::OsString::from(if level == "high" {
            "--compression-level=9"
        } else {
            "--compression-level=6"
        }));
    }
    args.push(input.as_os_str().to_os_string());
    args.push(temporary_path.as_os_str().to_os_string());
    let output = run_qpdf(&qpdf_path, &args, None)
        .await
        .map_err(|_| "pdf-compress:compression-failed".to_string())?;
    if !output.status.success() {
        let _ = std::fs::remove_file(&temporary_path);
        return Err(map_qpdf_compress_error(&output));
    }
    let check_output = run_qpdf(
        &qpdf_path,
        &[
            std::ffi::OsString::from("--check"),
            temporary_path.as_os_str().to_os_string(),
        ],
        None,
    )
    .await
    .map_err(|_| "pdf-compress:compression-failed".to_string())?;
    if !check_output.status.success() {
        let _ = std::fs::remove_file(&temporary_path);
        return Err("pdf-compress:compression-failed".to_string());
    }
    let compressed_size = std::fs::metadata(&temporary_path)
        .map_err(|_| "pdf-compress:compression-failed".to_string())?
        .len();
    let output_path = if compressed_size < original_size {
        Some(publish_pdf_compress_output(
            &temporary_path,
            &output_dir,
            &create_pdf_compress_file_name(input),
        )?)
    } else {
        let _ = std::fs::remove_file(&temporary_path);
        None
    };
    Ok(PdfCompressResult {
        original_size,
        compressed_size,
        output_path,
        output_dir: output_dir.to_string_lossy().into_owned(),
    })
}

#[derive(serde::Serialize, Clone)]
struct ConvertProgress {
    file_name: String,
    current: usize,
    total: usize,
    progress: f64,
    status: String,
}

#[derive(serde::Serialize)]
struct BatchConvertResult {
    success_count: usize,
    fail_count: usize,
    output_dir: String,
    errors: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    original_size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    compressed_size: Option<u64>,
}

#[derive(serde::Serialize)]
struct AudioBatchConvertResult {
    success_count: usize,
    fail_count: usize,
    output_dir: String,
    output_paths: Vec<String>,
    errors: Vec<String>,
}

fn normalize_audio_convert_quality(quality: Option<&str>) -> Result<&'static str, String> {
    match quality
        .unwrap_or("medium")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "low" => Ok("low"),
        "medium" => Ok("medium"),
        "high" => Ok("high"),
        _ => Err("audio-convert:invalid-quality".to_string()),
    }
}

fn get_encoder_params(target_format: &str, quality: &str) -> (String, Vec<String>, &'static str) {
    // Returns (encoder, extra_args, extension)
    match target_format.to_uppercase().as_str() {
        "MP3" => {
            let q = match quality {
                "low" => "6",
                "high" => "2",
                _ => "4",
            };
            (
                "libmp3lame".to_string(),
                vec!["-q:a".to_string(), q.to_string()],
                ".mp3",
            )
        }
        "AAC" => {
            let q = match quality {
                "low" => "128k",
                "high" => "256k",
                _ => "192k",
            };
            (
                "aac".to_string(),
                vec![
                    "-b:a".to_string(),
                    q.to_string(),
                    "-movflags".to_string(),
                    "+faststart".to_string(),
                ],
                ".m4a",
            )
        }
        "WAV" => ("pcm_s16le".to_string(), vec![], ".wav"),
        "FLAC" => {
            let q = match quality {
                "low" => "2",
                "high" => "8",
                _ => "5",
            };
            (
                "flac".to_string(),
                vec!["-compression_level".to_string(), q.to_string()],
                ".flac",
            )
        }
        "ALAC" => (
            "alac".to_string(),
            vec!["-movflags".to_string(), "+faststart".to_string()],
            ".m4a",
        ),
        "OGG" => {
            let q = match quality {
                "low" => "3",
                "high" => "7",
                _ => "5",
            };
            (
                "libvorbis".to_string(),
                vec!["-q:a".to_string(), q.to_string()],
                ".ogg",
            )
        }
        _ => (
            "libmp3lame".to_string(),
            vec!["-q:a".to_string(), "4".to_string()],
            ".mp3",
        ),
    }
}

fn get_unique_output_path(
    output_dir: &std::path::Path,
    stem: &str,
    ext: &str,
) -> std::path::PathBuf {
    let mut path = output_dir.join(format!("{}{}", stem, ext));
    let mut counter = 1;
    while path.exists() {
        path = output_dir.join(format!("{}_{}{}", stem, counter, ext));
        counter += 1;
    }
    path
}

const AUDIO_CONVERT_MAX_INPUT_BYTES: u64 = 10 * 1024 * 1024 * 1024;
const AUDIO_CONVERT_MAX_FILES: usize = 100;

fn validate_audio_convert_inputs(
    input_paths: &[String],
) -> Result<Vec<std::path::PathBuf>, String> {
    if input_paths.is_empty() {
        return Err("audio-convert:missing-input".to_string());
    }
    if input_paths.len() > AUDIO_CONVERT_MAX_FILES {
        return Err("audio-convert:too-many-files".to_string());
    }

    let mut seen = std::collections::BTreeSet::new();
    let mut validated = Vec::with_capacity(input_paths.len());
    for input_path in input_paths {
        if input_path.contains('\0') {
            return Err("audio-convert:invalid-input".to_string());
        }
        let input = std::path::PathBuf::from(input_path);
        let metadata = std::fs::symlink_metadata(&input)
            .map_err(|_| "audio-convert:invalid-input".to_string())?;
        let extension = input
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase());
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || !matches!(
                extension.as_deref(),
                Some("mp3" | "aac" | "m4a" | "wav" | "flac" | "alac" | "ogg" | "wma")
            )
            || metadata.len() == 0
        {
            return Err("audio-convert:invalid-input".to_string());
        }
        if metadata.len() > AUDIO_CONVERT_MAX_INPUT_BYTES {
            return Err("audio-convert:input-too-large".to_string());
        }
        let canonical = input
            .canonicalize()
            .map_err(|_| "audio-convert:invalid-input".to_string())?;
        if !seen.insert(canonical.clone()) {
            return Err("audio-convert:duplicate-input".to_string());
        }
        validated.push(canonical);
    }
    Ok(validated)
}

fn validate_audio_convert_output_dir(output_dir: &str) -> Result<std::path::PathBuf, String> {
    if output_dir.trim().is_empty() || output_dir.contains('\0') {
        return Err("audio-convert:output-path".to_string());
    }
    let output_dir = std::path::PathBuf::from(output_dir);
    is_path_safe(&output_dir).map_err(|_| "audio-convert:output-path".to_string())?;
    std::fs::create_dir_all(&output_dir).map_err(|_| "audio-convert:output-path".to_string())?;
    if !output_dir.is_dir() {
        return Err("audio-convert:output-path".to_string());
    }
    is_path_safe(&output_dir).map_err(|_| "audio-convert:output-path".to_string())?;
    Ok(output_dir)
}

fn audio_convert_file_stem(input: &std::path::Path) -> String {
    let raw_stem = input
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("audio");
    let sanitized: String = raw_stem
        .chars()
        .map(|character| {
            if matches!(
                character,
                '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            ) {
                '_'
            } else {
                character
            }
        })
        .collect();
    let trimmed = sanitized
        .trim()
        .trim_end_matches(|character| character == '.' || character == ' ');
    let safe_stem: String = trimmed.chars().take(96).collect();
    if safe_stem.is_empty() {
        "audio".to_string()
    } else {
        safe_stem
    }
}

fn create_audio_convert_temp_path(
    output_dir: &std::path::Path,
    extension: &str,
) -> Result<std::path::PathBuf, String> {
    for _ in 0..10_000 {
        let id = AUDIO_CONVERT_TEMP_ID.fetch_add(1, Ordering::SeqCst);
        let candidate = output_dir.join(format!(
            ".toolknit-audio-{}-{}{}",
            std::process::id(),
            id,
            extension
        ));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("audio-convert:output-path".to_string())
}

fn publish_audio_convert_output(
    temporary_path: &std::path::Path,
    output_dir: &std::path::Path,
    source_stem: &str,
    extension: &str,
) -> Result<String, String> {
    for counter in 0..10_000_u32 {
        let file_name = if counter == 0 {
            format!("{}{}", source_stem, extension)
        } else {
            format!("{}_{}{}", source_stem, counter, extension)
        };
        let candidate = output_dir.join(file_name);
        match std::fs::hard_link(temporary_path, &candidate) {
            Ok(()) => {
                std::fs::remove_file(temporary_path)
                    .map_err(|_| "audio-convert:output-path".to_string())?;
                return Ok(candidate.to_string_lossy().into_owned());
            }
            Err(_) if candidate.exists() => continue,
            Err(_) => return Err("audio-convert:output-path".to_string()),
        }
    }
    Err("audio-convert:output-path".to_string())
}

fn compact_audio_convert_error(stderr: &str) -> String {
    let detail = stderr
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("FFmpeg could not convert this audio file.");
    let compact = detail.trim().chars().take(480).collect::<String>();
    if compact.is_empty() {
        "FFmpeg could not convert this audio file.".to_string()
    } else {
        compact
    }
}

async fn convert_audio_file(
    app_handle: tauri::AppHandle,
    ffmpeg_path: std::path::PathBuf,
    input: std::path::PathBuf,
    output_dir: std::path::PathBuf,
    encoder: String,
    extra_args: Vec<String>,
    extension: &'static str,
    current: usize,
    total: usize,
) -> Result<String, String> {
    use tauri::Emitter;
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};

    if CANCEL_FLAG.load(Ordering::SeqCst) {
        return Err("audio-convert:cancelled".to_string());
    }
    let file_name = input
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("audio")
        .to_string();
    let _ = app_handle.emit(
        "convert-progress",
        ConvertProgress {
            file_name: file_name.clone(),
            current,
            total,
            progress: 0.0,
            status: "preparing".to_string(),
        },
    );
    let duration = probe_video_convert_duration(&ffmpeg_path, &input)
        .await
        .unwrap_or(0.0);
    if CANCEL_FLAG.load(Ordering::SeqCst) {
        return Err("audio-convert:cancelled".to_string());
    }
    let temporary_path = create_audio_convert_temp_path(&output_dir, extension)?;
    let mut command = tokio::process::Command::new(&ffmpeg_path);
    command
        .arg("-y")
        .arg("-i")
        .arg(&input)
        .arg("-c:a")
        .arg(&encoder)
        .args(&extra_args)
        .arg("-progress")
        .arg("pipe:1")
        .arg("-nostats")
        .arg(&temporary_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000);
    }

    let mut child = command
        .spawn()
        .map_err(|_| "audio-convert:failed".to_string())?;
    let child_id = match child.id() {
        Some(id) => id,
        None => {
            let _ = child.kill().await;
            let _ = std::fs::remove_file(&temporary_path);
            return Err("audio-convert:failed".to_string());
        }
    };
    CURRENT_CHILD_ID.store(child_id, Ordering::SeqCst);
    if CANCEL_FLAG.load(Ordering::SeqCst) {
        terminate_conversion_process(child_id);
    }
    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            terminate_conversion_process(child_id);
            let _ = child.wait().await;
            CURRENT_CHILD_ID.store(0, Ordering::SeqCst);
            let _ = std::fs::remove_file(&temporary_path);
            return Err("audio-convert:failed".to_string());
        }
    };
    let stderr = match child.stderr.take() {
        Some(stderr) => stderr,
        None => {
            terminate_conversion_process(child_id);
            let _ = child.wait().await;
            CURRENT_CHILD_ID.store(0, Ordering::SeqCst);
            let _ = std::fs::remove_file(&temporary_path);
            return Err("audio-convert:failed".to_string());
        }
    };
    let progress_app = app_handle.clone();
    let progress_name = file_name.clone();
    let progress_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(seconds) = parse_ffmpeg_progress_seconds(&line) {
                let progress = if duration > 0.0 {
                    (seconds / duration).clamp(0.0, 0.99)
                } else {
                    0.0
                };
                let _ = progress_app.emit(
                    "convert-progress",
                    ConvertProgress {
                        file_name: progress_name.clone(),
                        current,
                        total,
                        progress,
                        status: "converting".to_string(),
                    },
                );
            }
        }
    });
    let stderr_task = tokio::spawn(async move {
        let mut bytes = Vec::new();
        let mut reader = BufReader::new(stderr);
        let _ = reader.read_to_end(&mut bytes).await;
        String::from_utf8_lossy(&bytes).into_owned()
    });
    let status = child.wait().await;
    CURRENT_CHILD_ID.store(0, Ordering::SeqCst);
    let _ = progress_task.await;
    let stderr = stderr_task.await.unwrap_or_default();

    if CANCEL_FLAG.load(Ordering::SeqCst) {
        let _ = std::fs::remove_file(&temporary_path);
        return Err("audio-convert:cancelled".to_string());
    }
    match status {
        Ok(status) if status.success() => {
            let output_size = std::fs::metadata(&temporary_path)
                .map_err(|_| "audio-convert:failed".to_string())?
                .len();
            if output_size == 0 {
                let _ = std::fs::remove_file(&temporary_path);
                return Err("audio-convert:failed".to_string());
            }
            let output_path = match publish_audio_convert_output(
                &temporary_path,
                &output_dir,
                &audio_convert_file_stem(&input),
                extension,
            ) {
                Ok(path) => path,
                Err(error) => {
                    let _ = std::fs::remove_file(&temporary_path);
                    return Err(error);
                }
            };
            let _ = app_handle.emit(
                "convert-progress",
                ConvertProgress {
                    file_name,
                    current,
                    total,
                    progress: 1.0,
                    status: "done".to_string(),
                },
            );
            Ok(output_path)
        }
        _ => {
            let _ = std::fs::remove_file(&temporary_path);
            Err(compact_audio_convert_error(&stderr))
        }
    }
}

#[tauri::command]
async fn convert_audio_batch(
    app_handle: tauri::AppHandle,
    input_paths: Vec<String>,
    output_dir: String,
    target_format: String,
    quality: Option<String>,
) -> Result<AudioBatchConvertResult, String> {
    use tauri::Emitter;

    let _conversion_guard = begin_conversion()?;
    let input_paths = validate_audio_convert_inputs(&input_paths)?;
    let output_dir = validate_audio_convert_output_dir(&output_dir)?;
    let target_format = target_format.trim().to_ascii_uppercase();
    if !matches!(
        target_format.as_str(),
        "MP3" | "AAC" | "WAV" | "FLAC" | "ALAC" | "OGG"
    ) {
        return Err("audio-convert:invalid-target-format".to_string());
    }
    let quality = normalize_audio_convert_quality(quality.as_deref())?;
    let ffmpeg_path = get_ffmpeg_path()?;
    let (encoder, extra_args, extension) = get_encoder_params(&target_format, quality);
    let total = input_paths.len();
    let mut success_count = 0usize;
    let mut fail_count = 0usize;
    let mut output_paths = Vec::with_capacity(total);
    let mut errors = Vec::new();

    for (index, input) in input_paths.into_iter().enumerate() {
        let current = index + 1;
        let file_name = input
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("audio")
            .to_string();
        match convert_audio_file(
            app_handle.clone(),
            ffmpeg_path.clone(),
            input,
            output_dir.clone(),
            encoder.clone(),
            extra_args.clone(),
            extension,
            current,
            total,
        )
        .await
        {
            Ok(output_path) => {
                success_count += 1;
                output_paths.push(output_path);
            }
            Err(error) if error == "audio-convert:cancelled" => return Err(error),
            Err(error) => {
                fail_count += 1;
                errors.push(format!("{}: {}", file_name, error));
                let _ = app_handle.emit(
                    "convert-progress",
                    ConvertProgress {
                        file_name,
                        current,
                        total,
                        progress: 1.0,
                        status: "error".to_string(),
                    },
                );
            }
        }
    }
    Ok(AudioBatchConvertResult {
        success_count,
        fail_count,
        output_dir: output_dir.to_string_lossy().to_string(),
        output_paths,
        errors,
    })
}

#[cfg(test)]
mod audio_conversion_tests {
    use super::*;

    fn test_directory(label: &str) -> std::path::PathBuf {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock must be after epoch")
            .as_nanos();
        let directory =
            std::env::temp_dir().join(format!("toolknit-audio-convert-{}-{}", label, suffix));
        std::fs::create_dir_all(&directory).expect("create test directory");
        directory
    }

    #[test]
    fn audio_convert_rejects_duplicate_empty_and_unsupported_inputs() {
        let directory = test_directory("validation");
        let audio = directory.join("track.m4a");
        std::fs::write(&audio, [1_u8; 32]).expect("write audio fixture");
        let audio_path = audio.to_string_lossy().into_owned();
        assert_eq!(
            validate_audio_convert_inputs(&[audio_path.clone()])
                .expect("m4a input should be accepted")
                .len(),
            1,
        );
        assert_eq!(
            validate_audio_convert_inputs(&[audio_path.clone(), audio_path])
                .expect_err("duplicate input must be rejected"),
            "audio-convert:duplicate-input",
        );

        let empty = directory.join("empty.mp3");
        std::fs::write(&empty, []).expect("write empty fixture");
        assert_eq!(
            validate_audio_convert_inputs(&[empty.to_string_lossy().into_owned()])
                .expect_err("empty input must be rejected"),
            "audio-convert:invalid-input",
        );

        let unsupported = directory.join("notes.txt");
        std::fs::write(&unsupported, [1_u8; 32]).expect("write unsupported fixture");
        assert_eq!(
            validate_audio_convert_inputs(&[unsupported.to_string_lossy().into_owned()])
                .expect_err("unsupported input must be rejected"),
            "audio-convert:invalid-input",
        );
        std::fs::remove_dir_all(&directory).expect("remove test directory");
    }

    #[test]
    fn audio_convert_uses_bounded_quality_profiles() {
        assert_eq!(
            normalize_audio_convert_quality(Some(" HIGH ")).expect("high should normalize"),
            "high"
        );
        assert_eq!(
            normalize_audio_convert_quality(None).expect("default should normalize"),
            "medium"
        );
        assert_eq!(
            normalize_audio_convert_quality(Some("192k"))
                .expect_err("raw FFmpeg arguments must be rejected"),
            "audio-convert:invalid-quality"
        );

        let mp3 = get_encoder_params("MP3", "high");
        assert_eq!(mp3.0, "libmp3lame");
        assert_eq!(mp3.1, vec!["-q:a", "2"]);
        assert_eq!(mp3.2, ".mp3");

        let aac = get_encoder_params("AAC", "low");
        assert_eq!(aac.0, "aac");
        assert_eq!(aac.1, vec!["-b:a", "128k", "-movflags", "+faststart"]);
        assert_eq!(aac.2, ".m4a");

        let wav = get_encoder_params("WAV", "low");
        assert_eq!(wav.0, "pcm_s16le");
        assert!(wav.1.is_empty());
        assert_eq!(wav.2, ".wav");
    }

    #[test]
    fn audio_convert_publication_keeps_existing_output_and_removes_temporary_file() {
        let directory = test_directory("publish");
        let existing = directory.join("track.mp3");
        let temporary = directory.join(".toolknit-audio-test.mp3");
        std::fs::write(&existing, b"original-output").expect("write existing output");
        std::fs::write(&temporary, b"new-output").expect("write temporary output");

        let published = publish_audio_convert_output(&temporary, &directory, "track", ".mp3")
            .expect("publish unique audio output");
        assert!(published.ends_with("track_1.mp3"));
        assert_eq!(
            std::fs::read(&existing).expect("read existing output"),
            b"original-output"
        );
        assert_eq!(
            std::fs::read(&published).expect("read published output"),
            b"new-output"
        );
        assert!(!temporary.exists());
        std::fs::remove_dir_all(&directory).expect("remove test directory");
    }
}

#[derive(serde::Serialize)]
struct TrimResult {
    success: bool,
    output_path: String,
    error: Option<String>,
}

#[tauri::command]
async fn trim_audio(
    input_path: String,
    output_dir: String,
    start_time: f64,
    end_time: f64,
) -> Result<TrimResult, String> {
    let _conversion_guard = begin_conversion()?;
    if !start_time.is_finite()
        || !end_time.is_finite()
        || start_time < 0.0
        || end_time <= start_time
    {
        return Err("audio-clip:invalid-selection".to_string());
    }

    let ffmpeg_path = get_ffmpeg_path()?;
    let input = validate_audio_convert_inputs(&[input_path])
        .map_err(|_| "audio-clip:invalid-input".to_string())?
        .into_iter()
        .next()
        .ok_or("audio-clip:invalid-input")?;
    let input_size = std::fs::metadata(&input)
        .map_err(|_| "audio-clip:invalid-input".to_string())?
        .len();
    if input_size > 100 * 1024 * 1024 {
        return Err("audio-clip:input-too-large".to_string());
    }
    let output_dir_path = validate_audio_convert_output_dir(&output_dir)
        .map_err(|_| "audio-clip:output-path".to_string())?;
    let source_duration = probe_video_convert_duration(&ffmpeg_path, &input)
        .await
        .filter(|duration| duration.is_finite() && *duration > 0.0)
        .ok_or("audio-clip:invalid-input")?;
    if source_duration > 20.0 * 60.0 {
        return Err("audio-clip:audio-too-long".to_string());
    }
    if start_time >= source_duration || end_time > source_duration + 0.05 {
        return Err("audio-clip:invalid-selection".to_string());
    }

    let output_stem = format!("{}_clip", audio_convert_file_stem(&input));
    let original_extension = input
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| format!(".{}", extension.to_ascii_lowercase()))
        .ok_or("audio-clip:invalid-input")?;
    let temporary_path = create_audio_convert_temp_path(&output_dir_path, &original_extension)
        .map_err(|_| "audio-clip:output-path".to_string())?;
    let clip_duration = end_time - start_time;

    let mut cmd = tokio::process::Command::new(&ffmpeg_path);
    cmd.arg("-y")
        .arg("-i")
        .arg(&input)
        .arg("-ss")
        .arg(start_time.to_string())
        .arg("-t")
        .arg(clip_duration.to_string())
        .arg("-c")
        .arg("copy")
        .arg(&temporary_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }

    let child = cmd.spawn().map_err(|_| "audio-clip:failed".to_string())?;
    if let Some(id) = child.id() {
        CURRENT_CHILD_ID.store(id, Ordering::SeqCst);
    }
    let output = match child.wait_with_output().await {
        Ok(output) => output,
        Err(_) => {
            CURRENT_CHILD_ID.store(0, Ordering::SeqCst);
            let _ = std::fs::remove_file(&temporary_path);
            return Err("audio-clip:failed".to_string());
        }
    };
    CURRENT_CHILD_ID.store(0, Ordering::SeqCst);

    if CANCEL_FLAG.load(Ordering::SeqCst) {
        let _ = std::fs::remove_file(&temporary_path);
        return Err("audio-clip:cancelled".to_string());
    }

    let copy_succeeded = output.status.success()
        && std::fs::metadata(&temporary_path)
            .map(|metadata| metadata.len() > 0)
            .unwrap_or(false);
    if copy_succeeded {
        let output_path = match publish_audio_convert_output(
            &temporary_path,
            &output_dir_path,
            &output_stem,
            &original_extension,
        ) {
            Ok(path) => path,
            Err(error) => {
                let _ = std::fs::remove_file(&temporary_path);
                return Err(error);
            }
        };
        return Ok(TrimResult {
            success: true,
            output_path,
            error: None,
        });
    }

    let _ = std::fs::remove_file(&temporary_path);
    let mp3_temporary_path = create_audio_convert_temp_path(&output_dir_path, ".mp3")
        .map_err(|_| "audio-clip:output-path".to_string())?;
    {
        let mut cmd2 = tokio::process::Command::new(&ffmpeg_path);
        cmd2.arg("-y")
            .arg("-i")
            .arg(&input)
            .arg("-ss")
            .arg(start_time.to_string())
            .arg("-t")
            .arg((end_time - start_time).to_string())
            .arg("-c:a")
            .arg("libmp3lame")
            .arg("-q:a")
            .arg("2")
            .arg(&mp3_temporary_path)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        #[cfg(target_os = "windows")]
        {
            cmd2.creation_flags(0x08000000);
        }

        let child2 = cmd2.spawn().map_err(|_| "audio-clip:failed".to_string())?;
        if let Some(id) = child2.id() {
            CURRENT_CHILD_ID.store(id, Ordering::SeqCst);
        }
        let output2 = match child2.wait_with_output().await {
            Ok(output) => output,
            Err(_) => {
                CURRENT_CHILD_ID.store(0, Ordering::SeqCst);
                let _ = std::fs::remove_file(&mp3_temporary_path);
                return Err("audio-clip:failed".to_string());
            }
        };
        CURRENT_CHILD_ID.store(0, Ordering::SeqCst);

        if CANCEL_FLAG.load(Ordering::SeqCst) {
            let _ = std::fs::remove_file(&mp3_temporary_path);
            return Err("audio-clip:cancelled".to_string());
        }

        if output2.status.success()
            && std::fs::metadata(&mp3_temporary_path)
                .map(|metadata| metadata.len() > 0)
                .unwrap_or(false)
        {
            let output_path = match publish_audio_convert_output(
                &mp3_temporary_path,
                &output_dir_path,
                &output_stem,
                ".mp3",
            ) {
                Ok(path) => path,
                Err(error) => {
                    let _ = std::fs::remove_file(&mp3_temporary_path);
                    return Err(error);
                }
            };
            Ok(TrimResult {
                success: true,
                output_path,
                error: None,
            })
        } else {
            let _ = std::fs::remove_file(&mp3_temporary_path);
            Ok(TrimResult {
                success: false,
                output_path: String::new(),
                error: Some(compact_audio_convert_error(&String::from_utf8_lossy(
                    &output2.stderr,
                ))),
            })
        }
    }
}

#[cfg(test)]
mod audio_clip_backend_tests {
    use super::*;

    fn test_directory() -> std::path::PathBuf {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock must be after epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("toolknit-audio-clip-{}", suffix));
        std::fs::create_dir_all(&directory).expect("create test directory");
        directory
    }

    #[tokio::test]
    async fn trim_audio_publishes_unique_nonempty_outputs_with_the_requested_duration() {
        let _conversion_lock = test_conversion_lock();
        let directory = test_directory();
        let input = directory.join("tone.wav");
        let ffmpeg = get_ffmpeg_path().expect("bundled FFmpeg must be available");
        let status = tokio::process::Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=48000:duration=4",
                "-c:a",
                "pcm_s16le",
            ])
            .arg(&input)
            .status()
            .await
            .expect("start FFmpeg fixture generation");
        assert!(status.success(), "generate a valid audio fixture");

        let output_directory = directory.to_string_lossy().into_owned();
        let first = trim_audio(
            input.to_string_lossy().into_owned(),
            output_directory.clone(),
            1.0,
            2.25,
        )
        .await
        .expect("first trim must succeed");
        assert!(first.success);
        assert!(
            std::fs::metadata(&first.output_path)
                .expect("inspect first output")
                .len()
                > 0
        );
        let duration =
            probe_video_convert_duration(&ffmpeg, std::path::Path::new(&first.output_path))
                .await
                .expect("read output duration");
        assert!(
            (duration - 1.25).abs() < 0.08,
            "clip duration was {duration}"
        );

        let second = trim_audio(
            input.to_string_lossy().into_owned(),
            output_directory,
            1.0,
            2.25,
        )
        .await
        .expect("second trim must succeed");
        assert!(second.success);
        assert_ne!(first.output_path, second.output_path);
        assert!(second.output_path.ends_with("tone_clip_1.wav"));
        std::fs::remove_dir_all(&directory).expect("remove test directory");
    }
}

#[tauri::command]
fn cancel_convert() -> Result<(), String> {
    CANCEL_FLAG.store(true, Ordering::SeqCst);
    let pid = CURRENT_CHILD_ID.load(Ordering::SeqCst);
    terminate_conversion_process(pid);
    CURRENT_CHILD_ID.store(0, Ordering::SeqCst);

    let video_pids: Vec<u32> = active_video_children()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .iter()
        .copied()
        .collect();
    for video_pid in video_pids {
        terminate_conversion_process(video_pid);
    }
    Ok(())
}

// ===== Image Conversion =====

#[tauri::command]
async fn convert_image_batch(
    app_handle: tauri::AppHandle,
    input_paths: Vec<String>,
    output_dir: String,
    target_format: String,
) -> Result<BatchConvertResult, String> {
    let _conversion_guard = begin_conversion()?;
    tokio::task::spawn_blocking(move || {
        convert_image_batch_blocking(app_handle, input_paths, output_dir, target_format)
    })
    .await
    .map_err(|error| format!("Image conversion worker failed: {}", error))?
}

fn validate_image_batch_inputs(input_paths: &[String]) -> Result<(), String> {
    if input_paths.is_empty() {
        return Err("Select at least one image file".to_string());
    }
    if input_paths.len() > MAX_IMAGE_BATCH_FILES {
        return Err(format!(
            "A batch can contain at most {} image files",
            MAX_IMAGE_BATCH_FILES
        ));
    }

    let mut seen = std::collections::BTreeSet::new();
    for input_path in input_paths {
        if input_path.contains('\0') {
            return Err("An image input path is invalid".to_string());
        }
        let input = std::path::Path::new(input_path);
        let file_name = input
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("input image");
        let extension = input
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !matches!(
            extension.as_str(),
            "jpg" | "jpeg" | "png" | "webp" | "bmp" | "gif"
        ) {
            return Err(format!("{} has an unsupported image format", file_name));
        }
        let metadata = std::fs::symlink_metadata(input)
            .map_err(|error| format!("Cannot read {}: {}", file_name, error))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(format!("{} is not a regular file", file_name));
        }
        if metadata.len() > MAX_IMAGE_FILE_BYTES {
            return Err(format!(
                "{} exceeds the {} MB file limit",
                file_name,
                MAX_IMAGE_FILE_BYTES / 1024 / 1024
            ));
        }
        let canonical = input
            .canonicalize()
            .map_err(|error| format!("Cannot resolve {}: {}", file_name, error))?;
        if !seen.insert(canonical.clone()) {
            return Err(format!("Duplicate image file: {}", file_name));
        }
        let (width, height) = image::image_dimensions(&canonical)
            .map_err(|error| format!("Cannot read dimensions for {}: {}", file_name, error))?;
        let pixels = u64::from(width) * u64::from(height);
        if width == 0 || height == 0 || pixels > MAX_IMAGE_PIXELS {
            return Err(format!(
                "{} exceeds the {} megapixel limit",
                file_name,
                MAX_IMAGE_PIXELS / 1_000_000
            ));
        }
        if extension == "gif" && image_has_multiple_gif_frames(&canonical)? {
            return Err(format!(
                "{} is animated and cannot be converted without losing frames",
                file_name
            ));
        }
    }
    Ok(())
}

fn image_has_multiple_gif_frames(input: &std::path::Path) -> Result<bool, String> {
    use image::AnimationDecoder;
    use std::io::BufReader;

    let file = std::fs::File::open(input).map_err(|error| format!("Cannot read GIF: {}", error))?;
    let decoder = image::codecs::gif::GifDecoder::new(BufReader::new(file))
        .map_err(|error| format!("Cannot decode GIF: {}", error))?;
    let mut frames = decoder.into_frames();
    if frames
        .next()
        .transpose()
        .map_err(|error| format!("Cannot decode GIF: {}", error))?
        .is_none()
    {
        return Err("GIF has no image frames".to_string());
    }
    Ok(frames
        .next()
        .transpose()
        .map_err(|error| format!("Cannot decode GIF: {}", error))?
        .is_some())
}

fn validate_image_output_dir(output_dir: &str) -> Result<std::path::PathBuf, String> {
    if output_dir.trim().is_empty() || output_dir.contains('\0') {
        return Err("Image output directory is invalid".to_string());
    }
    let directory = std::path::PathBuf::from(output_dir);
    is_path_safe(&directory)?;
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("Cannot create image output directory: {}", error))?;
    if !directory.is_dir() {
        return Err("Image output path is not a directory".to_string());
    }
    let directory = directory
        .canonicalize()
        .map_err(|error| format!("Cannot resolve image output directory: {}", error))?;
    is_path_safe(&directory)?;
    Ok(directory)
}

fn publish_image_output(
    temporary_output_path: &std::path::Path,
    output_path: &std::path::Path,
) -> Result<(), String> {
    std::fs::hard_link(temporary_output_path, output_path)
        .map_err(|error| format!("Cannot publish image output: {}", error))?;
    let _ = std::fs::remove_file(temporary_output_path);
    Ok(())
}

fn write_converted_image(
    image: &image::DynamicImage,
    output_path: &std::path::Path,
    target_format: image::ImageFormat,
) -> image::ImageResult<()> {
    match target_format {
        image::ImageFormat::Jpeg => {
            use image::codecs::jpeg::JpegEncoder;
            use std::io::BufWriter;

            let file = std::fs::File::create(output_path)?;
            let writer = BufWriter::new(file);
            let mut encoder = JpegEncoder::new_with_quality(writer, 92);
            let rgb = image.to_rgb8();
            encoder.encode(
                &rgb,
                image.width(),
                image.height(),
                image::ExtendedColorType::Rgb8,
            )
        }
        _ => image.save_with_format(output_path, target_format),
    }
}

fn write_raster_svg(
    image: &image::DynamicImage,
    output_path: &std::path::Path,
) -> Result<(), String> {
    use base64::Engine;
    use image::ImageEncoder;

    let rgba = image.to_rgba8();
    let width = image.width();
    let height = image.height();
    let mut png = Vec::new();
    image::codecs::png::PngEncoder::new(&mut png)
        .write_image(&rgba, width, height, image::ExtendedColorType::Rgba8)
        .map_err(|error| format!("Cannot encode SVG image data: {}", error))?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(png);
    let svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><image width="{width}" height="{height}" href="data:image/png;base64,{encoded}"/></svg>"#
    );
    std::fs::write(output_path, svg).map_err(|error| format!("Cannot write SVG output: {}", error))
}

#[derive(Clone, Debug, serde::Serialize)]
struct ImageStitchResult {
    output_path: String,
    width: u32,
    height: u32,
    count: usize,
    format: String,
}

#[derive(serde::Serialize)]
struct ImageStitchInputPreview {
    path: String,
    name: String,
    width: u32,
    height: u32,
    thumbnail_data_url: String,
}

#[derive(Clone)]
struct ImageStitchOptions {
    input_paths: Vec<String>,
    output_dir: String,
    output_name: Option<String>,
    mode: String,
    reference: String,
    spacing_px: u32,
    scale_percent: u32,
    format: String,
    jpeg_quality: u8,
    background_rgba: String,
}

#[derive(Clone, Debug, PartialEq)]
struct ImageStitchLayout {
    sizes: Vec<(u32, u32)>,
    width: u32,
    height: u32,
}

fn read_oriented_image(path: &std::path::Path) -> Result<image::DynamicImage, String> {
    use image::ImageDecoder;
    let reader = image::ImageReader::open(path)
        .map_err(|_| "image-stitch:invalid-input".to_string())?
        .with_guessed_format()
        .map_err(|_| "image-stitch:invalid-input".to_string())?;
    let mut decoder = reader
        .into_decoder()
        .map_err(|_| "image-stitch:invalid-input".to_string())?;
    let orientation = decoder
        .orientation()
        .map_err(|_| "image-stitch:invalid-input".to_string())?;
    let mut decoded = image::DynamicImage::from_decoder(decoder)
        .map_err(|_| "image-stitch:invalid-input".to_string())?;
    decoded.apply_orientation(orientation);
    Ok(decoded)
}

fn oriented_image_dimensions(path: &std::path::Path) -> Result<(u32, u32), String> {
    use image::ImageDecoder;
    let reader = image::ImageReader::open(path)
        .map_err(|_| "image-stitch:invalid-input".to_string())?
        .with_guessed_format()
        .map_err(|_| "image-stitch:invalid-input".to_string())?;
    let mut decoder = reader
        .into_decoder()
        .map_err(|_| "image-stitch:invalid-input".to_string())?;
    let (width, height) = decoder.dimensions();
    let orientation = decoder
        .orientation()
        .map_err(|_| "image-stitch:invalid-input".to_string())?;
    if matches!(
        orientation,
        image::metadata::Orientation::Rotate90
            | image::metadata::Orientation::Rotate270
            | image::metadata::Orientation::Rotate90FlipH
            | image::metadata::Orientation::Rotate270FlipH
    ) {
        Ok((height, width))
    } else {
        Ok((width, height))
    }
}

fn stitch_background(value: &str) -> Result<image::Rgba<u8>, String> {
    let raw = value.trim().trim_start_matches('#');
    if raw.len() != 8 || !raw.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err("image-stitch:invalid-background".to_string());
    }
    let part = |from| {
        u8::from_str_radix(&raw[from..from + 2], 16)
            .map_err(|_| "image-stitch:invalid-background".to_string())
    };
    Ok(image::Rgba([part(0)?, part(2)?, part(4)?, part(6)?]))
}

fn calculate_image_stitch_layout(
    dimensions: &[(u32, u32)],
    mode: &str,
    reference: &str,
    spacing_px: u32,
    scale_percent: u32,
) -> Result<ImageStitchLayout, String> {
    if dimensions.len() < 2
        || dimensions.len() > MAX_IMAGE_BATCH_FILES
        || spacing_px > 500
        || !(10..=100).contains(&scale_percent)
    {
        return Err("image-stitch:invalid-settings".to_string());
    }
    let vertical = match mode {
        "vertical" => true,
        "horizontal" => false,
        _ => return Err("image-stitch:invalid-settings".to_string()),
    };
    let axis = |dimensions: &(u32, u32)| if vertical { dimensions.0 } else { dimensions.1 };
    let chosen = match reference {
        "first" => dimensions[0],
        "smallest" => *dimensions
            .iter()
            .min_by_key(|dimensions| axis(dimensions))
            .ok_or_else(|| "image-stitch:invalid-settings".to_string())?,
        "largest" => *dimensions
            .iter()
            .max_by_key(|dimensions| axis(dimensions))
            .ok_or_else(|| "image-stitch:invalid-settings".to_string())?,
        _ => return Err("image-stitch:invalid-settings".to_string()),
    };
    let fixed = ((u64::from(axis(&chosen)) * u64::from(scale_percent) + 50) / 100).max(1);
    let sizes = dimensions
        .iter()
        .map(|(width, height)| {
            if vertical {
                let target_height = ((u64::from(*height) * fixed + u64::from(*width) / 2)
                    / u64::from(*width))
                .max(1);
                (fixed as u32, target_height as u32)
            } else {
                let target_width = ((u64::from(*width) * fixed + u64::from(*height) / 2)
                    / u64::from(*height))
                .max(1);
                (target_width as u32, fixed as u32)
            }
        })
        .collect::<Vec<_>>();
    let gap = u64::from(spacing_px) * (sizes.len() as u64 - 1);
    let width = if vertical {
        fixed
    } else {
        sizes
            .iter()
            .try_fold(gap, |sum, item| sum.checked_add(u64::from(item.0)))
            .ok_or_else(|| "image-stitch:output-too-large".to_string())?
    };
    let height = if vertical {
        sizes
            .iter()
            .try_fold(gap, |sum, item| sum.checked_add(u64::from(item.1)))
            .ok_or_else(|| "image-stitch:output-too-large".to_string())?
    } else {
        fixed
    };
    if width > 65_535 || height > 65_535 {
        return Err("image-stitch:output-too-large".to_string());
    }
    Ok(ImageStitchLayout {
        sizes,
        width: width as u32,
        height: height as u32,
    })
}

#[cfg(target_os = "windows")]
fn available_image_stitch_pixels() -> u64 {
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut memory = MEMORYSTATUSEX::default();
    memory.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
    if unsafe { GlobalMemoryStatusEx(&mut memory) }.is_ok() {
        return (memory.ullAvailPhys / 12).clamp(4_000_000, 160_000_000);
    }
    80_000_000
}

#[cfg(not(target_os = "windows"))]
fn available_image_stitch_pixels() -> u64 {
    80_000_000
}

static IMAGE_STITCH_TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);
static IMAGE_STITCH_PDF_SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);
static PDF_TO_IMAGE_SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);
static PDF_TO_IMAGE_TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

const IMAGE_STITCH_PDF_SESSION_ROOT: &str = "toolknit-image-stitch-pdf";
const PDF_TO_IMAGE_SESSION_ROOT: &str = "toolknit-pdf-to-image";
const PDF_TO_IMAGE_MAX_PAGE_BYTES: usize = 192 * 1024 * 1024;
const PDF_TO_IMAGE_MAX_SESSION_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const PDF_TO_IMAGE_MAX_PAGES: usize = 200;
const PDF_TO_IMAGE_MAX_LONG_PAGES: usize = 20;
const PDF_TO_IMAGE_MAX_PAGES_PER_LONG_IMAGE: usize = 5;
const PDF_TO_IMAGE_MAX_RENDER_SIDE: u32 = 16_384;
const PDF_TO_IMAGE_MAX_RENDER_PIXELS: u64 = 40_000_000;
const PDF_TO_IMAGE_MAX_LONG_SIDE: u32 = 32_767;
const PDF_TO_IMAGE_MAX_LONG_PIXELS: u64 = 60_000_000;
const PDF_TO_IMAGE_MAX_ESTIMATED_WORKING_BYTES: u64 = 384 * 1024 * 1024;
struct PdfToImageJobState {
    cancelled: std::sync::Arc<std::sync::atomic::AtomicBool>,
    active: bool,
}

static PDF_TO_IMAGE_JOBS: std::sync::OnceLock<
    std::sync::Mutex<std::collections::BTreeMap<String, PdfToImageJobState>>,
> = std::sync::OnceLock::new();

fn pdf_to_image_jobs(
) -> &'static std::sync::Mutex<std::collections::BTreeMap<String, PdfToImageJobState>> {
    PDF_TO_IMAGE_JOBS.get_or_init(|| std::sync::Mutex::new(std::collections::BTreeMap::new()))
}

fn valid_pdf_to_image_job_id(job_id: &str) -> bool {
    !job_id.is_empty()
        && job_id.len() <= 128
        && job_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

struct PdfToImageJobGuard {
    job_id: String,
    cancelled: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl PdfToImageJobGuard {
    fn register(job_id: String) -> Result<Self, String> {
        if !valid_pdf_to_image_job_id(&job_id) {
            return Err("pdf-to-image:invalid-job-id".to_string());
        }
        let mut jobs = pdf_to_image_jobs()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let state = jobs
            .entry(job_id.clone())
            .or_insert_with(|| PdfToImageJobState {
                cancelled: std::sync::Arc::new(AtomicBool::new(false)),
                active: false,
            });
        if state.active {
            return Err("pdf-to-image:duplicate-job".to_string());
        }
        state.active = true;
        let cancelled = std::sync::Arc::clone(&state.cancelled);
        Ok(Self { job_id, cancelled })
    }
}

impl Drop for PdfToImageJobGuard {
    fn drop(&mut self) {
        let mut jobs = pdf_to_image_jobs()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if jobs
            .get(&self.job_id)
            .is_some_and(|current| std::sync::Arc::ptr_eq(&current.cancelled, &self.cancelled))
        {
            jobs.remove(&self.job_id);
        }
    }
}

#[tauri::command]
fn cancel_pdf_to_image(job_id: String) -> Result<(), String> {
    if !valid_pdf_to_image_job_id(&job_id) {
        return Err("pdf-to-image:invalid-job-id".to_string());
    }
    let mut jobs = pdf_to_image_jobs()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if !jobs.contains_key(&job_id) && jobs.len() >= 128 {
        jobs.retain(|_, state| state.active || !state.cancelled.load(Ordering::SeqCst));
    }
    if !jobs.contains_key(&job_id) && jobs.len() >= 128 {
        return Err("pdf-to-image:too-many-jobs".to_string());
    }
    jobs.entry(job_id)
        .or_insert_with(|| PdfToImageJobState {
            cancelled: std::sync::Arc::new(AtomicBool::new(false)),
            active: false,
        })
        .cancelled
        .store(true, Ordering::SeqCst);
    Ok(())
}

#[derive(serde::Serialize)]
struct ImageStitchPdfSession {
    session_id: String,
    directory: String,
}

fn image_stitch_pdf_session_root() -> std::path::PathBuf {
    std::env::temp_dir().join(IMAGE_STITCH_PDF_SESSION_ROOT)
}

fn valid_image_stitch_session_id(session_id: &str) -> bool {
    !session_id.is_empty()
        && session_id.len() <= 96
        && session_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

fn image_stitch_pdf_session_directory(session_id: &str) -> Result<std::path::PathBuf, String> {
    if !valid_image_stitch_session_id(session_id) {
        return Err("image-stitch:invalid-pdf-session".to_string());
    }
    let root = image_stitch_pdf_session_root();
    let directory = root.join(session_id);
    let canonical_root = root
        .canonicalize()
        .map_err(|_| "image-stitch:invalid-pdf-session".to_string())?;
    let canonical_directory = directory
        .canonicalize()
        .map_err(|_| "image-stitch:invalid-pdf-session".to_string())?;
    if !canonical_directory.starts_with(canonical_root) {
        return Err("image-stitch:invalid-pdf-session".to_string());
    }
    Ok(canonical_directory)
}

fn cleanup_image_stitch_pdf_sessions() {
    let root = image_stitch_pdf_session_root();
    if root.is_dir() {
        let _ = std::fs::remove_dir_all(&root);
    }
}

#[tauri::command]
fn create_image_stitch_pdf_session() -> Result<ImageStitchPdfSession, String> {
    let root = image_stitch_pdf_session_root();
    std::fs::create_dir_all(&root)
        .map_err(|_| "image-stitch:pdf-session-create-failed".to_string())?;
    for _ in 0..10_000 {
        let counter = IMAGE_STITCH_PDF_SESSION_COUNTER.fetch_add(1, Ordering::SeqCst);
        let session_id = format!(
            "{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos(),
            counter
        );
        let directory = root.join(&session_id);
        match std::fs::create_dir(&directory) {
            Ok(()) => {
                return Ok(ImageStitchPdfSession {
                    session_id,
                    directory: directory.to_string_lossy().into_owned(),
                });
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("image-stitch:pdf-session-create-failed".to_string()),
        }
    }
    Err("image-stitch:pdf-session-create-failed".to_string())
}

#[tauri::command]
fn write_image_stitch_pdf_page(
    session_id: String,
    page_number: u32,
    bytes: Vec<u8>,
) -> Result<String, String> {
    use std::io::Write;
    const MAX_PAGE_BYTES: usize = 20 * 1024 * 1024;
    if !(1..=100).contains(&page_number)
        || bytes.len() < 8
        || bytes.len() > MAX_PAGE_BYTES
        || bytes[..8] != [137, 80, 78, 71, 13, 10, 26, 10]
    {
        return Err("image-stitch:invalid-pdf-page".to_string());
    }
    let directory = image_stitch_pdf_session_directory(&session_id)?;
    let output_path = directory.join(format!("page_{:04}.png", page_number));
    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&output_path)
        .map_err(|_| "image-stitch:pdf-page-write-failed".to_string())?;
    if let Err(error) = output.write_all(&bytes).and_then(|_| output.sync_all()) {
        drop(output);
        let _ = std::fs::remove_file(&output_path);
        return Err(format!("image-stitch:pdf-page-write-failed:{error}"));
    }
    drop(output);
    let valid = image::image_dimensions(&output_path)
        .map(|(width, height)| {
            width > 0 && height > 0 && u64::from(width) * u64::from(height) <= MAX_IMAGE_PIXELS
        })
        .unwrap_or(false);
    if !valid {
        let _ = std::fs::remove_file(&output_path);
        return Err("image-stitch:invalid-pdf-page".to_string());
    }
    Ok(output_path.to_string_lossy().into_owned())
}

#[tauri::command]
fn discard_image_stitch_pdf_session(session_id: String) -> Result<(), String> {
    let directory = image_stitch_pdf_session_directory(&session_id)?;
    std::fs::remove_dir_all(directory)
        .map_err(|_| "image-stitch:pdf-session-cleanup-failed".to_string())
}

struct ImageStitchTemporaryFile {
    path: std::path::PathBuf,
    published: bool,
}

impl ImageStitchTemporaryFile {
    fn new(directory: &std::path::Path) -> Self {
        let counter = IMAGE_STITCH_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        Self {
            path: directory.join(format!(
                ".toolknit-stitch-{}-{}-{}.tmp",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos(),
                counter
            )),
            published: false,
        }
    }
}

impl Drop for ImageStitchTemporaryFile {
    fn drop(&mut self) {
        if !self.published {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

fn publish_image_stitch_output(
    temporary: &mut ImageStitchTemporaryFile,
    directory: &std::path::Path,
    output_name: Option<&str>,
    extension: &str,
) -> Result<String, String> {
    let stem = normalize_image_stitch_output_name(output_name)?;
    for index in 0..10_000u32 {
        let suffix = if index == 0 {
            String::new()
        } else {
            format!("_{}", index)
        };
        let target = directory.join(format!("{}{}{}", stem, suffix, extension));
        match std::fs::hard_link(&temporary.path, &target) {
            Ok(()) => {
                std::fs::remove_file(&temporary.path)
                    .map_err(|_| "image-stitch:output-path".to_string())?;
                temporary.published = true;
                return Ok(target.to_string_lossy().into_owned());
            }
            Err(_) if target.exists() => continue,
            Err(_) => return Err("image-stitch:output-path".to_string()),
        }
    }
    Err("image-stitch:output-path".to_string())
}

fn normalize_image_stitch_output_name(value: Option<&str>) -> Result<String, String> {
    let value = value.unwrap_or("stitched_image").trim();
    if value.is_empty()
        || value.chars().count() > 96
        || value == "."
        || value == ".."
        || value.chars().any(|character| {
            character.is_control()
                || matches!(
                    character,
                    '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
                )
        })
        || value.ends_with([' ', '.'])
    {
        return Err("image-stitch:invalid-output-name".to_string());
    }
    let reserved = value
        .split('.')
        .next()
        .unwrap_or(value)
        .trim_end()
        .to_ascii_uppercase();
    if matches!(reserved.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (reserved.len() == 4
            && (reserved.starts_with("COM") || reserved.starts_with("LPT"))
            && matches!(reserved.as_bytes()[3], b'1'..=b'9'))
    {
        return Err("image-stitch:invalid-output-name".to_string());
    }
    Ok(value.to_string())
}

fn encode_image_stitch(
    canvas: &image::RgbaImage,
    temporary: &std::path::Path,
    format: &str,
    jpeg_quality: u8,
) -> Result<(), String> {
    use image::ImageEncoder;
    use std::io::{BufWriter, Write};
    let file = std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(temporary)
        .map_err(|_| "image-stitch:output-path".to_string())?;
    let mut writer = BufWriter::new(file);
    if format == "jpg" {
        let rgb = image::DynamicImage::ImageRgba8(canvas.clone()).to_rgb8();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, jpeg_quality)
            .encode(
                &rgb,
                canvas.width(),
                canvas.height(),
                image::ExtendedColorType::Rgb8,
            )
            .map_err(|_| "image-stitch:encode-failed".to_string())?;
    } else if format == "webp" {
        image::codecs::webp::WebPEncoder::new_lossless(&mut writer)
            .encode(
                canvas.as_raw(),
                canvas.width(),
                canvas.height(),
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|_| "image-stitch:encode-failed".to_string())?;
    } else {
        image::codecs::png::PngEncoder::new(&mut writer)
            .write_image(
                canvas.as_raw(),
                canvas.width(),
                canvas.height(),
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|_| "image-stitch:encode-failed".to_string())?;
    }
    writer
        .flush()
        .map_err(|_| "image-stitch:output-path".to_string())?;
    writer
        .get_ref()
        .sync_all()
        .map_err(|_| "image-stitch:output-path".to_string())
}

fn stitch_images_blocking<F>(
    options: ImageStitchOptions,
    mut progress: F,
) -> Result<ImageStitchResult, String>
where
    F: FnMut(&str, usize, usize, u8),
{
    validate_image_batch_inputs(&options.input_paths)?;
    if options.input_paths.len() < 2
        || !(60..=100).contains(&options.jpeg_quality)
        || !matches!(options.format.as_str(), "png" | "jpg" | "webp")
    {
        return Err("image-stitch:invalid-settings".to_string());
    }
    let background = stitch_background(&options.background_rgba)?;
    let canvas_background = if options.format == "jpg" {
        image::Rgba([background.0[0], background.0[1], background.0[2], 255])
    } else {
        background
    };
    let output_directory = validate_image_output_dir(&options.output_dir)?;
    let inputs = options
        .input_paths
        .iter()
        .map(std::path::PathBuf::from)
        .collect::<Vec<_>>();
    progress("prepare", 0, inputs.len(), 2);

    let mut dimensions = Vec::with_capacity(inputs.len());
    for (index, input) in inputs.iter().enumerate() {
        if CANCEL_FLAG.load(Ordering::SeqCst) {
            return Err("image-stitch:cancelled".to_string());
        }
        dimensions.push(oriented_image_dimensions(input)?);
        progress(
            "inspect",
            index + 1,
            inputs.len(),
            10 + ((index + 1) * 15 / inputs.len()) as u8,
        );
    }

    let layout = calculate_image_stitch_layout(
        &dimensions,
        &options.mode,
        &options.reference,
        options.spacing_px,
        options.scale_percent,
    )?;
    let pixels = u64::from(layout.width)
        .checked_mul(u64::from(layout.height))
        .ok_or_else(|| "image-stitch:output-too-large".to_string())?;
    if pixels > available_image_stitch_pixels() {
        return Err("image-stitch:output-too-large-for-memory".to_string());
    }

    let mut canvas = image::RgbaImage::from_pixel(layout.width, layout.height, canvas_background);
    let vertical = options.mode == "vertical";
    let mut cursor = 0u32;
    for (index, (input, (width, height))) in inputs.iter().zip(layout.sizes.iter()).enumerate() {
        if CANCEL_FLAG.load(Ordering::SeqCst) {
            return Err("image-stitch:cancelled".to_string());
        }
        let resized = read_oriented_image(input)?
            .resize_exact(*width, *height, image::imageops::FilterType::Lanczos3)
            .to_rgba8();
        image::imageops::overlay(
            &mut canvas,
            &resized,
            if vertical { 0 } else { i64::from(cursor) },
            if vertical { i64::from(cursor) } else { 0 },
        );
        cursor = cursor
            .saturating_add(if vertical { *height } else { *width })
            .saturating_add(options.spacing_px);
        progress(
            "compose",
            index + 1,
            inputs.len(),
            25 + ((index + 1) * 60 / inputs.len()) as u8,
        );
    }

    if CANCEL_FLAG.load(Ordering::SeqCst) {
        return Err("image-stitch:cancelled".to_string());
    }
    progress("encode", inputs.len(), inputs.len(), 88);
    let mut temporary = ImageStitchTemporaryFile::new(&output_directory);
    encode_image_stitch(
        &canvas,
        &temporary.path,
        &options.format,
        options.jpeg_quality,
    )?;
    if CANCEL_FLAG.load(Ordering::SeqCst) {
        return Err("image-stitch:cancelled".to_string());
    }
    let extension = match options.format.as_str() {
        "png" => ".png",
        "jpg" => ".jpg",
        "webp" => ".webp",
        _ => unreachable!("validated image stitch format"),
    };
    let output_path = publish_image_stitch_output(
        &mut temporary,
        &output_directory,
        options.output_name.as_deref(),
        extension,
    )?;
    progress("complete", inputs.len(), inputs.len(), 100);
    Ok(ImageStitchResult {
        output_path,
        width: layout.width,
        height: layout.height,
        count: inputs.len(),
        format: options.format.to_ascii_uppercase(),
    })
}

#[tauri::command]
async fn inspect_image_stitch_inputs(
    input_paths: Vec<String>,
) -> Result<Vec<ImageStitchInputPreview>, String> {
    tokio::task::spawn_blocking(move || {
        use base64::Engine;
        use image::ImageEncoder;
        validate_image_batch_inputs(&input_paths)?;
        input_paths
            .iter()
            .map(|input_path| {
                let path = std::path::PathBuf::from(input_path);
                let decoded = read_oriented_image(&path)?;
                let thumbnail = decoded.thumbnail(160, 160).to_rgba8();
                let mut bytes = Vec::new();
                image::codecs::png::PngEncoder::new(&mut bytes)
                    .write_image(
                        thumbnail.as_raw(),
                        thumbnail.width(),
                        thumbnail.height(),
                        image::ExtendedColorType::Rgba8,
                    )
                    .map_err(|_| "image-stitch:thumbnail-failed".to_string())?;
                Ok(ImageStitchInputPreview {
                    path: input_path.clone(),
                    name: path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("image")
                        .to_string(),
                    width: decoded.width(),
                    height: decoded.height(),
                    thumbnail_data_url: format!(
                        "data:image/png;base64,{}",
                        base64::engine::general_purpose::STANDARD.encode(bytes)
                    ),
                })
            })
            .collect::<Result<Vec<_>, String>>()
    })
    .await
    .map_err(|error| format!("image-stitch:worker-failed:{error}"))?
}

#[tauri::command]
async fn stitch_images(
    app_handle: tauri::AppHandle,
    input_paths: Vec<String>,
    output_dir: String,
    output_name: Option<String>,
    mode: String,
    reference: String,
    spacing_px: u32,
    scale_percent: u32,
    format: String,
    jpeg_quality: u8,
    background_rgba: String,
    job_id: Option<String>,
) -> Result<ImageStitchResult, String> {
    let _guard = begin_conversion()?;
    tokio::task::spawn_blocking(move || {
        let job_id = job_id.unwrap_or_else(|| "desktop".to_string());
        stitch_images_blocking(
            ImageStitchOptions {
                input_paths,
                output_dir,
                output_name,
                mode,
                reference,
                spacing_px,
                scale_percent,
                format,
                jpeg_quality,
                background_rgba,
            },
            |phase, current, total, percent| {
                let _ = app_handle.emit(
                    "image-stitch-progress",
                    serde_json::json!({
                        "jobId": job_id,
                        "phase": phase,
                        "current": current,
                        "total": total,
                        "percent": percent
                    }),
                );
            },
        )
    })
    .await
    .map_err(|error| format!("image-stitch:worker-failed:{error}"))?
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfToImageSession {
    session_id: String,
    directory: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfToImagePageWriteResult {
    page_number: u32,
    path: String,
    width: u32,
    height: u32,
    byte_length: u64,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PdfToImageExportRequest {
    session_id: String,
    #[serde(rename = "pages", alias = "pageNumbers")]
    page_numbers: Vec<u32>,
    page_count: u32,
    output_dir: String,
    output_name: Option<String>,
    format: String,
    #[serde(rename = "mode", alias = "exportMode")]
    export_mode: String,
    pages_per_long_image: Option<u8>,
    jpeg_quality: Option<u8>,
    background_rgba: Option<String>,
    job_id: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfToImageExportItem {
    output_path: String,
    width: u32,
    height: u32,
    page_numbers: Vec<u32>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfToImageExportResult {
    output_dir: String,
    outputs: Vec<PdfToImageExportItem>,
    output_count: usize,
    page_count: usize,
    format: String,
    export_mode: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PdfToImageExportMode {
    Pages,
    Long,
}

#[derive(Clone, Debug)]
struct PdfToImageSourcePage {
    page_number: u32,
    path: std::path::PathBuf,
    width: u32,
    height: u32,
}

struct PdfToImageTemporaryFile {
    path: std::path::PathBuf,
}

impl PdfToImageTemporaryFile {
    fn new(directory: &std::path::Path) -> Self {
        let counter = PDF_TO_IMAGE_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        Self {
            path: directory.join(format!(
                ".toolknit-pdf-image-{}-{}-{}.tmp",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos(),
                counter
            )),
        }
    }
}

impl Drop for PdfToImageTemporaryFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

struct PdfToImagePreparedOutput {
    temporary: PdfToImageTemporaryFile,
    logical_stem: String,
    extension: String,
    width: u32,
    height: u32,
    page_numbers: Vec<u32>,
}

fn pdf_to_image_session_root() -> std::path::PathBuf {
    std::env::temp_dir().join(PDF_TO_IMAGE_SESSION_ROOT)
}

fn valid_pdf_to_image_session_id(session_id: &str) -> bool {
    !session_id.is_empty()
        && session_id.len() <= 96
        && session_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

fn pdf_to_image_session_directory(session_id: &str) -> Result<std::path::PathBuf, String> {
    if !valid_pdf_to_image_session_id(session_id) {
        return Err("pdf-to-image:invalid-session".to_string());
    }
    let root = pdf_to_image_session_root();
    let directory = root.join(session_id);
    let canonical_root = root
        .canonicalize()
        .map_err(|_| "pdf-to-image:invalid-session".to_string())?;
    let canonical_directory = directory
        .canonicalize()
        .map_err(|_| "pdf-to-image:invalid-session".to_string())?;
    if !canonical_directory.starts_with(&canonical_root) || !canonical_directory.is_dir() {
        return Err("pdf-to-image:invalid-session".to_string());
    }
    Ok(canonical_directory)
}

fn remove_pdf_to_image_session(session_id: &str) -> Result<(), String> {
    if !valid_pdf_to_image_session_id(session_id) {
        return Err("pdf-to-image:invalid-session".to_string());
    }
    let directory = pdf_to_image_session_root().join(session_id);
    if !directory.exists() {
        return Ok(());
    }
    let directory = pdf_to_image_session_directory(session_id)?;
    std::fs::remove_dir_all(directory)
        .map_err(|_| "pdf-to-image:session-cleanup-failed".to_string())
}

fn cleanup_pdf_to_image_sessions() {
    let root = pdf_to_image_session_root();
    if root.is_dir() {
        let _ = std::fs::remove_dir_all(root);
    }
}

#[tauri::command]
fn create_pdf_to_image_session() -> Result<PdfToImageSession, String> {
    let root = pdf_to_image_session_root();
    std::fs::create_dir_all(&root).map_err(|_| "pdf-to-image:session-create-failed".to_string())?;
    for _ in 0..10_000 {
        let counter = PDF_TO_IMAGE_SESSION_COUNTER.fetch_add(1, Ordering::SeqCst);
        let session_id = format!(
            "{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos(),
            counter
        );
        let directory = root.join(&session_id);
        match std::fs::create_dir(&directory) {
            Ok(()) => {
                return Ok(PdfToImageSession {
                    session_id,
                    directory: cleanup_display_path(&directory),
                });
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("pdf-to-image:session-create-failed".to_string()),
        }
    }
    Err("pdf-to-image:session-create-failed".to_string())
}

fn pdf_to_image_session_usage(directory: &std::path::Path) -> Result<(usize, u64), String> {
    let mut count = 0usize;
    let mut bytes = 0u64;
    for entry in
        std::fs::read_dir(directory).map_err(|_| "pdf-to-image:invalid-session".to_string())?
    {
        let entry = entry.map_err(|_| "pdf-to-image:invalid-session".to_string())?;
        let metadata = entry
            .metadata()
            .map_err(|_| "pdf-to-image:invalid-session".to_string())?;
        if metadata.is_file() {
            count = count.saturating_add(1);
            bytes = bytes.saturating_add(metadata.len());
        }
    }
    Ok((count, bytes))
}

fn pdf_to_image_page_number_from_file_name(file_name: &str) -> Option<u32> {
    let digits = file_name.strip_prefix("page_")?.strip_suffix(".png")?;
    if digits.len() != 5 || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let page_number = digits.parse::<u32>().ok()?;
    if page_number == 0
        || page_number > 10_000
        || file_name != format!("page_{:05}.png", page_number)
    {
        return None;
    }
    Some(page_number)
}

fn write_pdf_to_image_page_bytes(
    session_id: &str,
    file_name: &str,
    bytes: &[u8],
) -> Result<PdfToImagePageWriteResult, String> {
    use std::io::Write;

    let page_number = pdf_to_image_page_number_from_file_name(file_name)
        .ok_or_else(|| "pdf-to-image:invalid-page-name".to_string())?;
    if bytes.len() < 8
        || bytes.len() > PDF_TO_IMAGE_MAX_PAGE_BYTES
        || bytes[..8] != [137, 80, 78, 71, 13, 10, 26, 10]
    {
        return Err("pdf-to-image:invalid-page".to_string());
    }
    let directory = pdf_to_image_session_directory(session_id)?;
    let output_path = directory.join(file_name);
    if output_path.exists() {
        return Err("pdf-to-image:duplicate-page".to_string());
    }
    let (page_count, session_bytes) = pdf_to_image_session_usage(&directory)?;
    if page_count >= PDF_TO_IMAGE_MAX_PAGES {
        return Err("pdf-to-image:too-many-pages".to_string());
    }
    if session_bytes.saturating_add(bytes.len() as u64) > PDF_TO_IMAGE_MAX_SESSION_BYTES {
        return Err("pdf-to-image:session-too-large".to_string());
    }

    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&output_path)
        .map_err(|_| "pdf-to-image:page-write-failed".to_string())?;
    if let Err(error) = output.write_all(&bytes).and_then(|_| output.sync_all()) {
        drop(output);
        let _ = std::fs::remove_file(&output_path);
        return Err(format!("pdf-to-image:page-write-failed:{error}"));
    }
    drop(output);

    let dimensions = image::image_dimensions(&output_path).ok();
    let Some((width, height)) = dimensions else {
        let _ = std::fs::remove_file(&output_path);
        return Err("pdf-to-image:invalid-page".to_string());
    };
    let pixels = u64::from(width).saturating_mul(u64::from(height));
    if width == 0
        || height == 0
        || width > PDF_TO_IMAGE_MAX_RENDER_SIDE
        || height > PDF_TO_IMAGE_MAX_RENDER_SIDE
        || pixels > PDF_TO_IMAGE_MAX_RENDER_PIXELS
    {
        let _ = std::fs::remove_file(&output_path);
        return Err("pdf-to-image:invalid-page".to_string());
    }
    Ok(PdfToImagePageWriteResult {
        page_number,
        path: cleanup_display_path(&output_path),
        width,
        height,
        byte_length: bytes.len() as u64,
    })
}

#[tauri::command]
fn write_pdf_to_image_page(
    request: tauri::ipc::Request<'_>,
) -> Result<PdfToImagePageWriteResult, String> {
    let session_id = request
        .headers()
        .get("session-id")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "pdf-to-image:invalid-session".to_string())?;
    let file_name = request
        .headers()
        .get("file-name")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "pdf-to-image:invalid-page-name".to_string())?;
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.as_slice(),
        _ => return Err("pdf-to-image:raw-body-required".to_string()),
    };
    write_pdf_to_image_page_bytes(session_id, file_name, bytes)
}

#[tauri::command]
fn write_pdf_to_image_page_json(
    session_id: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<PdfToImagePageWriteResult, String> {
    write_pdf_to_image_page_bytes(&session_id, &file_name, &bytes)
}

#[tauri::command]
fn read_pdf_to_image_source(path: String) -> Result<tauri::ipc::Response, String> {
    use std::io::Read;

    const MAX_PDF_BYTES: u64 = 150 * 1024 * 1024;
    if path.contains('\0') {
        return Err("pdf-to-image:invalid-pdf".to_string());
    }
    let requested = std::path::PathBuf::from(path);
    let requested_metadata = std::fs::symlink_metadata(&requested)
        .map_err(|_| "pdf-to-image:invalid-pdf".to_string())?;
    if requested_metadata.file_type().is_symlink() || !requested_metadata.is_file() {
        return Err("pdf-to-image:invalid-pdf".to_string());
    }
    let input = requested
        .canonicalize()
        .map_err(|_| "pdf-to-image:invalid-pdf".to_string())?;
    if !input
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
    {
        return Err("pdf-to-image:invalid-pdf".to_string());
    }
    if requested_metadata.len() < 5 || requested_metadata.len() > MAX_PDF_BYTES {
        return Err(if requested_metadata.len() > MAX_PDF_BYTES {
            "pdf-to-image:pdf-too-large".to_string()
        } else {
            "pdf-to-image:invalid-pdf".to_string()
        });
    }
    let file = std::fs::File::open(&input).map_err(|_| "pdf-to-image:invalid-pdf".to_string())?;
    let mut reader = file.take(MAX_PDF_BYTES + 1);
    let mut bytes = Vec::with_capacity(requested_metadata.len() as usize);
    reader
        .read_to_end(&mut bytes)
        .map_err(|_| "pdf-to-image:invalid-pdf".to_string())?;
    if bytes.len() as u64 > MAX_PDF_BYTES {
        return Err("pdf-to-image:pdf-too-large".to_string());
    }
    let header_length = bytes.len().min(1024);
    if !bytes[..header_length]
        .windows(5)
        .any(|window| window == b"%PDF-")
    {
        return Err("pdf-to-image:invalid-pdf".to_string());
    }
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
fn discard_pdf_to_image_session(session_id: String) -> Result<(), String> {
    remove_pdf_to_image_session(&session_id)
}

fn normalize_pdf_to_image_format(value: &str) -> Result<(String, String), String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "png" => Ok(("png".to_string(), ".png".to_string())),
        "jpg" | "jpeg" => Ok(("jpg".to_string(), ".jpg".to_string())),
        "webp" => Ok(("webp".to_string(), ".webp".to_string())),
        _ => Err("pdf-to-image:invalid-format".to_string()),
    }
}

fn normalize_pdf_to_image_mode(value: &str) -> Result<PdfToImageExportMode, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "images" | "pages" => Ok(PdfToImageExportMode::Pages),
        "long" => Ok(PdfToImageExportMode::Long),
        _ => Err("pdf-to-image:invalid-mode".to_string()),
    }
}

fn load_pdf_to_image_source_pages(
    session_directory: &std::path::Path,
    page_numbers: &[u32],
) -> Result<Vec<PdfToImageSourcePage>, String> {
    let mut seen = std::collections::BTreeSet::new();
    let mut pages = Vec::with_capacity(page_numbers.len());
    for page_number in page_numbers {
        if *page_number == 0 || *page_number > 10_000 || !seen.insert(*page_number) {
            return Err("pdf-to-image:invalid-selection".to_string());
        }
        let path = session_directory.join(format!("page_{:05}.png", page_number));
        let metadata = std::fs::symlink_metadata(&path)
            .map_err(|_| "pdf-to-image:missing-page".to_string())?;
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || metadata.len() == 0
            || metadata.len() > PDF_TO_IMAGE_MAX_PAGE_BYTES as u64
        {
            return Err("pdf-to-image:invalid-page".to_string());
        }
        let canonical = path
            .canonicalize()
            .map_err(|_| "pdf-to-image:invalid-page".to_string())?;
        if !canonical.starts_with(session_directory) {
            return Err("pdf-to-image:invalid-page".to_string());
        }
        let (width, height) = image::image_dimensions(&canonical)
            .map_err(|_| "pdf-to-image:invalid-page".to_string())?;
        let pixels = u64::from(width).saturating_mul(u64::from(height));
        if width == 0
            || height == 0
            || width > PDF_TO_IMAGE_MAX_RENDER_SIDE
            || height > PDF_TO_IMAGE_MAX_RENDER_SIDE
            || pixels > PDF_TO_IMAGE_MAX_RENDER_PIXELS
        {
            return Err("pdf-to-image:invalid-page".to_string());
        }
        pages.push(PdfToImageSourcePage {
            page_number: *page_number,
            path: canonical,
            width,
            height,
        });
    }
    Ok(pages)
}

fn pdf_to_image_group_layout(
    pages: &[PdfToImageSourcePage],
    max_pixels: u64,
) -> Result<ImageStitchLayout, String> {
    if pages.is_empty() {
        return Err("pdf-to-image:invalid-selection".to_string());
    }
    let width = pages
        .iter()
        .map(|page| page.width)
        .max()
        .ok_or_else(|| "pdf-to-image:invalid-selection".to_string())?;
    let height = pages.iter().try_fold(0u64, |sum, page| {
        sum.checked_add(u64::from(page.height))
            .ok_or_else(|| "pdf-to-image:output-too-large".to_string())
    })?;
    if width > PDF_TO_IMAGE_MAX_LONG_SIDE || height > u64::from(PDF_TO_IMAGE_MAX_LONG_SIDE) {
        return Err("pdf-to-image:output-too-large".to_string());
    }
    let pixels = u64::from(width)
        .checked_mul(height)
        .ok_or_else(|| "pdf-to-image:output-too-large".to_string())?;
    if pixels > max_pixels {
        return Err("pdf-to-image:output-too-large-for-memory".to_string());
    }
    let max_page_pixels = pages
        .iter()
        .map(|page| u64::from(page.width) * u64::from(page.height))
        .max()
        .unwrap_or(0);
    let estimated_working_bytes = pixels
        .checked_mul(6)
        .and_then(|value| value.checked_add(max_page_pixels.saturating_mul(4)))
        .ok_or_else(|| "pdf-to-image:output-too-large-for-memory".to_string())?;
    if estimated_working_bytes > PDF_TO_IMAGE_MAX_ESTIMATED_WORKING_BYTES {
        return Err("pdf-to-image:output-too-large-for-memory".to_string());
    }
    Ok(ImageStitchLayout {
        sizes: pages.iter().map(|page| (page.width, page.height)).collect(),
        width,
        height: height as u32,
    })
}

fn build_pdf_to_image_groups(
    pages: &[PdfToImageSourcePage],
    mode: PdfToImageExportMode,
    pages_per_long_image: usize,
    max_pixels: u64,
) -> Result<Vec<Vec<PdfToImageSourcePage>>, String> {
    if mode == PdfToImageExportMode::Pages {
        for page in pages {
            pdf_to_image_group_layout(std::slice::from_ref(page), max_pixels)?;
        }
        return Ok(pages.iter().cloned().map(|page| vec![page]).collect());
    }

    let mut groups = Vec::new();
    let mut current = Vec::new();
    for page in pages.iter().cloned() {
        if current.len() >= pages_per_long_image {
            groups.push(std::mem::take(&mut current));
        }
        let mut candidate = current.clone();
        candidate.push(page.clone());
        if pdf_to_image_group_layout(&candidate, max_pixels).is_ok() {
            current = candidate;
            continue;
        }
        if !current.is_empty() {
            groups.push(std::mem::take(&mut current));
        }
        pdf_to_image_group_layout(std::slice::from_ref(&page), max_pixels)?;
        current.push(page);
    }
    if !current.is_empty() {
        groups.push(current);
    }
    Ok(groups)
}

fn compose_pdf_to_image_group(
    pages: &[PdfToImageSourcePage],
    layout: &ImageStitchLayout,
    background: image::Rgba<u8>,
    format: &str,
    cancelled: &AtomicBool,
) -> Result<image::RgbaImage, String> {
    let canvas_background = if format == "jpg" {
        image::Rgba([background.0[0], background.0[1], background.0[2], 255])
    } else {
        background
    };
    let mut canvas = image::RgbaImage::from_pixel(layout.width, layout.height, canvas_background);
    let mut cursor = 0u32;
    for (page, (width, height)) in pages.iter().zip(layout.sizes.iter()) {
        if cancelled.load(Ordering::SeqCst) {
            return Err("pdf-to-image:cancelled".to_string());
        }
        let decoded =
            read_oriented_image(&page.path).map_err(|_| "pdf-to-image:invalid-page".to_string())?;
        if decoded.width() != *width || decoded.height() != *height {
            return Err("pdf-to-image:invalid-page".to_string());
        }
        let rendered = decoded.into_rgba8();
        let x = (layout.width.saturating_sub(*width)) / 2;
        image::imageops::overlay(&mut canvas, &rendered, i64::from(x), i64::from(cursor));
        cursor = cursor.saturating_add(*height);
    }
    Ok(canvas)
}

fn encode_pdf_to_image(
    canvas: image::RgbaImage,
    temporary: &std::path::Path,
    format: &str,
    jpeg_quality: u8,
) -> Result<(), String> {
    use image::ImageEncoder;
    use std::io::{BufWriter, Write};

    let file = std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(temporary)
        .map_err(|_| "pdf-to-image:output-path".to_string())?;
    let mut writer = BufWriter::new(file);
    match format {
        "jpg" => {
            let width = canvas.width();
            let height = canvas.height();
            let rgb = image::DynamicImage::ImageRgba8(canvas).into_rgb8();
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, jpeg_quality)
                .encode(&rgb, width, height, image::ExtendedColorType::Rgb8)
                .map_err(|_| "pdf-to-image:encode-failed".to_string())?;
        }
        "webp" => {
            image::codecs::webp::WebPEncoder::new_lossless(&mut writer)
                .encode(
                    canvas.as_raw(),
                    canvas.width(),
                    canvas.height(),
                    image::ExtendedColorType::Rgba8,
                )
                .map_err(|_| "pdf-to-image:encode-failed".to_string())?;
        }
        "png" => {
            image::codecs::png::PngEncoder::new(&mut writer)
                .write_image(
                    canvas.as_raw(),
                    canvas.width(),
                    canvas.height(),
                    image::ExtendedColorType::Rgba8,
                )
                .map_err(|_| "pdf-to-image:encode-failed".to_string())?;
        }
        _ => return Err("pdf-to-image:invalid-format".to_string()),
    }
    writer
        .flush()
        .and_then(|_| writer.get_ref().sync_all())
        .map_err(|_| "pdf-to-image:output-path".to_string())
}

fn pdf_to_image_logical_stem(
    base: &str,
    mode: PdfToImageExportMode,
    output_index: usize,
    pages: &[PdfToImageSourcePage],
    page_count: u32,
) -> String {
    let digits = std::cmp::max(2, page_count.to_string().len());
    if mode == PdfToImageExportMode::Pages {
        return format!(
            "{}_page_{:0width$}",
            base,
            pages[0].page_number,
            width = digits
        );
    }
    let page_label = pages
        .iter()
        .map(|page| format!("{:0width$}", page.page_number, width = digits))
        .collect::<Vec<_>>()
        .join("_");
    format!("{}_long_{:02}_pages_{}", base, output_index + 1, page_label)
}

fn pdf_to_image_candidate_path(
    directory: &std::path::Path,
    prepared: &PdfToImagePreparedOutput,
    batch_suffix: u32,
) -> std::path::PathBuf {
    let suffix = if batch_suffix == 0 {
        String::new()
    } else {
        format!("_{}", batch_suffix)
    };
    directory.join(format!(
        "{}{}{}",
        prepared.logical_stem, suffix, prepared.extension
    ))
}

fn copy_pdf_to_image_output(
    source: &std::path::Path,
    target: &std::path::Path,
    cancelled: &AtomicBool,
) -> std::io::Result<()> {
    use std::io::{Read, Write};

    if cancelled.load(Ordering::SeqCst) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Interrupted,
            "PDF image export cancelled",
        ));
    }
    let input = std::fs::File::open(source)?;
    let output = std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(target)?;
    let mut reader = std::io::BufReader::with_capacity(256 * 1024, input);
    let mut writer = std::io::BufWriter::with_capacity(256 * 1024, output);
    let result = (|| -> std::io::Result<()> {
        let mut buffer = vec![0u8; 256 * 1024];
        loop {
            if cancelled.load(Ordering::SeqCst) {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::Interrupted,
                    "PDF image export cancelled",
                ));
            }
            let read = reader.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            writer.write_all(&buffer[..read])?;
        }
        if cancelled.load(Ordering::SeqCst) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Interrupted,
                "PDF image export cancelled",
            ));
        }
        writer.flush()?;
        writer.get_ref().sync_all()
    })();
    if result.is_err() {
        drop(writer);
        let _ = std::fs::remove_file(target);
    }
    result
}

fn publish_pdf_to_image_output(
    source: &std::path::Path,
    target: &std::path::Path,
    cancelled: &AtomicBool,
) -> std::io::Result<()> {
    match std::fs::hard_link(source, target) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Err(error),
        Err(_) => copy_pdf_to_image_output(source, target, cancelled),
    }
}

fn publish_pdf_to_image_batch(
    prepared: &[PdfToImagePreparedOutput],
    directory: &std::path::Path,
    cancelled: &AtomicBool,
) -> Result<Vec<PdfToImageExportItem>, String> {
    if prepared.is_empty() {
        return Err("pdf-to-image:no-output".to_string());
    }
    for batch_suffix in 0..10_000u32 {
        if cancelled.load(Ordering::SeqCst) {
            return Err("pdf-to-image:cancelled".to_string());
        }
        let candidates = prepared
            .iter()
            .map(|item| pdf_to_image_candidate_path(directory, item, batch_suffix))
            .collect::<Vec<_>>();
        if candidates.iter().any(|candidate| candidate.exists()) {
            continue;
        }

        let mut published = Vec::with_capacity(prepared.len());
        let mut collision = false;
        let mut fatal = false;
        for (item, candidate) in prepared.iter().zip(candidates.iter()) {
            if cancelled.load(Ordering::SeqCst) {
                fatal = true;
                break;
            }
            match publish_pdf_to_image_output(&item.temporary.path, candidate, cancelled) {
                Ok(()) => published.push(candidate.clone()),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    collision = true;
                    break;
                }
                Err(_) => {
                    fatal = true;
                    break;
                }
            }
        }
        if cancelled.load(Ordering::SeqCst) {
            fatal = true;
        }
        if collision || fatal {
            for path in &published {
                let _ = std::fs::remove_file(path);
            }
            if collision {
                continue;
            }
            return Err(if cancelled.load(Ordering::SeqCst) {
                "pdf-to-image:cancelled".to_string()
            } else {
                "pdf-to-image:publish-failed".to_string()
            });
        }

        return Ok(prepared
            .iter()
            .zip(candidates)
            .map(|(item, output_path)| PdfToImageExportItem {
                output_path: cleanup_display_path(&output_path),
                width: item.width,
                height: item.height,
                page_numbers: item.page_numbers.clone(),
            })
            .collect());
    }
    Err("pdf-to-image:output-path".to_string())
}

fn export_pdf_to_images_blocking<F>(
    request: PdfToImageExportRequest,
    cancelled: &AtomicBool,
    mut progress: F,
) -> Result<PdfToImageExportResult, String>
where
    F: FnMut(&str, usize, usize, u8),
{
    if cancelled.load(Ordering::SeqCst) {
        return Err("pdf-to-image:cancelled".to_string());
    }
    let mode = normalize_pdf_to_image_mode(&request.export_mode)?;
    let unique_page_numbers = request
        .page_numbers
        .iter()
        .copied()
        .collect::<std::collections::BTreeSet<_>>();
    if request.page_count == 0
        || request.page_count as usize > PDF_TO_IMAGE_MAX_PAGES
        || request.page_numbers.is_empty()
        || request.page_numbers.len() > PDF_TO_IMAGE_MAX_PAGES
        || unique_page_numbers.len() != request.page_numbers.len()
        || request
            .page_numbers
            .iter()
            .any(|page_number| *page_number == 0 || *page_number > request.page_count)
    {
        return Err("pdf-to-image:invalid-selection".to_string());
    }
    if mode == PdfToImageExportMode::Long
        && request.page_numbers.len() > PDF_TO_IMAGE_MAX_LONG_PAGES
    {
        return Err("pdf-to-image:too-many-long-pages".to_string());
    }
    let pages_per_long_image = usize::from(
        request
            .pages_per_long_image
            .unwrap_or(PDF_TO_IMAGE_MAX_PAGES_PER_LONG_IMAGE as u8),
    );
    if pages_per_long_image == 0 || pages_per_long_image > PDF_TO_IMAGE_MAX_PAGES_PER_LONG_IMAGE {
        return Err("pdf-to-image:invalid-group-size".to_string());
    }
    let jpeg_quality = request.jpeg_quality.unwrap_or(92);
    if !(60..=100).contains(&jpeg_quality) {
        return Err("pdf-to-image:invalid-quality".to_string());
    }
    let (format, extension) = normalize_pdf_to_image_format(&request.format)?;
    let background = stitch_background(request.background_rgba.as_deref().unwrap_or("#FFFFFFFF"))
        .map_err(|_| "pdf-to-image:invalid-background".to_string())?;
    let base_name =
        normalize_image_stitch_output_name(request.output_name.as_deref().or(Some("document")))
            .map_err(|_| "pdf-to-image:invalid-output-name".to_string())?
            .trim()
            .to_string();
    let session_directory = pdf_to_image_session_directory(&request.session_id)?;
    let output_directory = validate_image_output_dir(&request.output_dir)
        .map_err(|_| "pdf-to-image:output-path".to_string())?;

    progress("prepare", 0, request.page_numbers.len(), 2);
    let pages = load_pdf_to_image_source_pages(&session_directory, &request.page_numbers)?;
    for (index, _) in pages.iter().enumerate() {
        if cancelled.load(Ordering::SeqCst) {
            return Err("pdf-to-image:cancelled".to_string());
        }
        progress(
            "inspect",
            index + 1,
            pages.len(),
            2 + (((index + 1) * 10 / pages.len()) as u8),
        );
    }

    let max_output_pixels = available_image_stitch_pixels().min(PDF_TO_IMAGE_MAX_LONG_PIXELS);
    let groups = build_pdf_to_image_groups(&pages, mode, pages_per_long_image, max_output_pixels)?;
    let mut prepared = Vec::with_capacity(groups.len());
    for (index, group) in groups.iter().enumerate() {
        if cancelled.load(Ordering::SeqCst) {
            return Err("pdf-to-image:cancelled".to_string());
        }
        let layout = pdf_to_image_group_layout(group, max_output_pixels)?;
        progress(
            "compose",
            index,
            groups.len(),
            12 + ((index * 65 / groups.len()) as u8),
        );
        let canvas = compose_pdf_to_image_group(group, &layout, background, &format, cancelled)?;
        let temporary = PdfToImageTemporaryFile::new(&output_directory);
        encode_pdf_to_image(canvas, &temporary.path, &format, jpeg_quality)?;
        if cancelled.load(Ordering::SeqCst) {
            return Err("pdf-to-image:cancelled".to_string());
        }
        prepared.push(PdfToImagePreparedOutput {
            temporary,
            logical_stem: pdf_to_image_logical_stem(
                &base_name,
                mode,
                index,
                group,
                request.page_count,
            ),
            extension: extension.clone(),
            width: layout.width,
            height: layout.height,
            page_numbers: group.iter().map(|page| page.page_number).collect(),
        });
        progress(
            "encode",
            index + 1,
            groups.len(),
            12 + (((index + 1) * 73 / groups.len()) as u8),
        );
    }

    progress("publish", prepared.len(), prepared.len(), 90);
    let outputs = publish_pdf_to_image_batch(&prepared, &output_directory, cancelled)?;
    progress("complete", outputs.len(), outputs.len(), 100);
    Ok(PdfToImageExportResult {
        output_dir: cleanup_display_path(&output_directory),
        output_count: outputs.len(),
        page_count: pages.len(),
        outputs,
        format: format.to_ascii_uppercase(),
        export_mode: match mode {
            PdfToImageExportMode::Pages => "images".to_string(),
            PdfToImageExportMode::Long => "long".to_string(),
        },
    })
}

#[tauri::command]
async fn export_pdf_to_images(
    app_handle: tauri::AppHandle,
    request: PdfToImageExportRequest,
) -> Result<PdfToImageExportResult, String> {
    let job_id = request
        .job_id
        .clone()
        .unwrap_or_else(|| "desktop".to_string());
    let job_guard = PdfToImageJobGuard::register(job_id.clone())?;
    let _guard = begin_conversion().map_err(|_| "pdf-to-image:busy".to_string())?;
    let cleanup_session_id = request.session_id.clone();
    let cancelled = std::sync::Arc::clone(&job_guard.cancelled);
    let worker = tokio::task::spawn_blocking(move || {
        export_pdf_to_images_blocking(request, &cancelled, |phase, current, total, percent| {
            let _ = app_handle.emit(
                "pdf-to-image-progress",
                serde_json::json!({
                    "jobId": job_id,
                    "phase": phase,
                    "current": current,
                    "total": total,
                    "percent": percent
                }),
            );
        })
    })
    .await
    .map_err(|error| format!("pdf-to-image:worker-failed:{error}"));
    let _ = remove_pdf_to_image_session(&cleanup_session_id);
    worker?
}

#[cfg(test)]
mod pdf_to_image_backend_tests {
    use super::*;
    use image::{GenericImageView, ImageEncoder};
    use tauri::ipc::IpcResponse;

    fn test_directory(label: &str) -> std::path::PathBuf {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock must be after Unix epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "toolknit-pdf-to-image-test-{}-{}-{}",
            label,
            std::process::id(),
            suffix
        ));
        std::fs::create_dir_all(&directory).expect("create PDF-to-image test directory");
        directory
    }

    fn solid_png(width: u32, height: u32, color: image::Rgba<u8>) -> Vec<u8> {
        let image = image::RgbaImage::from_pixel(width, height, color);
        let mut bytes = Vec::new();
        image::codecs::png::PngEncoder::new(&mut bytes)
            .write_image(
                image.as_raw(),
                width,
                height,
                image::ExtendedColorType::Rgba8,
            )
            .expect("encode test PNG");
        bytes
    }

    #[test]
    fn pdf_to_image_names_match_the_frontend_contract() {
        let page = PdfToImageSourcePage {
            page_number: 7,
            path: std::path::PathBuf::new(),
            width: 10,
            height: 20,
        };
        assert_eq!(
            pdf_to_image_logical_stem(
                "document",
                PdfToImageExportMode::Pages,
                0,
                std::slice::from_ref(&page),
                8,
            ),
            "document_page_07"
        );
        let mut second = page.clone();
        second.page_number = 105;
        assert_eq!(
            pdf_to_image_logical_stem(
                "document",
                PdfToImageExportMode::Long,
                1,
                &[page, second],
                200,
            ),
            "document_long_02_pages_007_105"
        );
        assert_eq!(
            pdf_to_image_page_number_from_file_name("page_00007.png"),
            Some(7)
        );
        assert_eq!(
            pdf_to_image_page_number_from_file_name("../page_00007.png"),
            None
        );
        assert!(normalize_image_stitch_output_name(Some(&"页面".repeat(32))).is_ok());
    }

    #[test]
    fn pdf_to_image_native_grouping_matches_the_frontend_plan() {
        let pages = (1..=16)
            .map(|page_number| PdfToImageSourcePage {
                page_number,
                path: std::path::PathBuf::new(),
                width: 100,
                height: 200,
            })
            .collect::<Vec<_>>();
        let groups = build_pdf_to_image_groups(
            &pages,
            PdfToImageExportMode::Long,
            PDF_TO_IMAGE_MAX_PAGES_PER_LONG_IMAGE,
            PDF_TO_IMAGE_MAX_LONG_PIXELS,
        )
        .expect("build 16-page long-image groups");

        assert_eq!(
            groups.iter().map(Vec::len).collect::<Vec<_>>(),
            vec![5, 5, 5, 1]
        );
        assert_eq!(
            groups
                .iter()
                .map(|group| group
                    .iter()
                    .map(|page| page.page_number)
                    .collect::<Vec<_>>())
                .collect::<Vec<_>>(),
            vec![
                vec![1, 2, 3, 4, 5],
                vec![6, 7, 8, 9, 10],
                vec![11, 12, 13, 14, 15],
                vec![16],
            ]
        );

        let memory_limited = build_pdf_to_image_groups(
            &pages[..6],
            PdfToImageExportMode::Long,
            PDF_TO_IMAGE_MAX_PAGES_PER_LONG_IMAGE,
            60_000,
        )
        .expect("split groups to respect the native pixel budget");
        assert_eq!(
            memory_limited.iter().map(Vec::len).collect::<Vec<_>>(),
            vec![3, 3]
        );
    }

    #[test]
    fn pdf_to_image_source_read_uses_a_raw_ipc_response() {
        let root = test_directory("raw-read");
        let input = root.join("sample.pdf");
        let expected = b"\xef\xbb\xbf%PDF-1.7\n%%EOF\n".to_vec();
        std::fs::write(&input, &expected).expect("write PDF fixture");
        let response = read_pdf_to_image_source(input.to_string_lossy().into_owned())
            .expect("read PDF fixture");
        match response.body().expect("build raw IPC body") {
            tauri::ipc::InvokeResponseBody::Raw(bytes) => assert_eq!(bytes, expected),
            tauri::ipc::InvokeResponseBody::Json(_) => panic!("PDF response must stay binary"),
        }
        std::fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn pdf_to_image_json_writer_accepts_frontend_page_bytes() {
        let session = create_pdf_to_image_session().expect("create page session");
        let bytes = solid_png(12, 8, image::Rgba([10, 20, 30, 255]));
        let result = write_pdf_to_image_page_json(
            session.session_id.clone(),
            "page_00003.png".to_string(),
            bytes,
        )
        .expect("write page through JSON command");

        assert_eq!(result.page_number, 3);
        assert_eq!(result.width, 12);
        assert_eq!(result.height, 8);
        remove_pdf_to_image_session(&session.session_id).expect("remove page session");
    }

    #[test]
    fn pdf_to_image_pre_cancelled_job_stops_before_file_access() {
        let _conversion_lock = test_conversion_lock();
        let job_id = format!(
            "pre-cancel-{}",
            PDF_TO_IMAGE_TEMP_COUNTER.fetch_add(1, Ordering::SeqCst)
        );
        cancel_pdf_to_image(job_id.clone()).expect("pre-cancel PDF export job");
        let job_guard = PdfToImageJobGuard::register(job_id).expect("register cancelled job");

        let error = export_pdf_to_images_blocking(
            PdfToImageExportRequest {
                session_id: "missing-session".to_string(),
                page_numbers: vec![1],
                page_count: 1,
                output_dir: "missing-output".to_string(),
                output_name: Some("cancelled".to_string()),
                format: "png".to_string(),
                export_mode: "images".to_string(),
                pages_per_long_image: Some(5),
                jpeg_quality: Some(92),
                background_rgba: Some("#FFFFFFFF".to_string()),
                job_id: None,
            },
            &job_guard.cancelled,
            |_, _, _, _| panic!("pre-cancelled export must not report progress"),
        )
        .expect_err("pre-cancelled export must stop immediately");

        assert_eq!(error, "pdf-to-image:cancelled");
    }

    #[test]
    fn pdf_to_image_rejects_duplicate_and_zero_page_numbers() {
        let _conversion_lock = test_conversion_lock();
        let cancelled = AtomicBool::new(false);
        let request_for = |page_numbers| PdfToImageExportRequest {
            session_id: "missing-session".to_string(),
            page_numbers,
            page_count: 2,
            output_dir: "missing-output".to_string(),
            output_name: Some("invalid-selection".to_string()),
            format: "png".to_string(),
            export_mode: "images".to_string(),
            pages_per_long_image: Some(5),
            jpeg_quality: Some(92),
            background_rgba: Some("#FFFFFFFF".to_string()),
            job_id: None,
        };

        for page_numbers in [vec![1, 1], vec![0]] {
            assert_eq!(
                export_pdf_to_images_blocking(
                    request_for(page_numbers),
                    &cancelled,
                    |_, _, _, _| panic!("invalid selection must not report progress"),
                )
                .expect_err("invalid page selection must fail before file access"),
                "pdf-to-image:invalid-selection"
            );
        }
    }

    #[test]
    fn pdf_to_image_cancel_does_not_touch_shared_conversion_flag() {
        let _conversion_lock = test_conversion_lock();
        CANCEL_FLAG.store(false, Ordering::SeqCst);
        let job_id = format!(
            "isolated-cancel-{}",
            PDF_TO_IMAGE_TEMP_COUNTER.fetch_add(1, Ordering::SeqCst)
        );

        cancel_pdf_to_image(job_id.clone()).expect("cancel isolated PDF export job");

        assert!(!CANCEL_FLAG.load(Ordering::SeqCst));
        let job_guard = PdfToImageJobGuard::register(job_id).expect("register cancelled job");
        assert!(job_guard.cancelled.load(Ordering::SeqCst));
    }

    #[test]
    fn pdf_to_image_duplicate_job_cannot_orphan_the_active_cancel_token() {
        let _conversion_lock = test_conversion_lock();
        let job_id = format!(
            "duplicate-job-{}",
            PDF_TO_IMAGE_TEMP_COUNTER.fetch_add(1, Ordering::SeqCst)
        );
        let active = PdfToImageJobGuard::register(job_id.clone()).expect("register active job");

        assert_eq!(
            PdfToImageJobGuard::register(job_id.clone())
                .err()
                .expect("duplicate job must fail"),
            "pdf-to-image:duplicate-job"
        );
        cancel_pdf_to_image(job_id).expect("cancel the original active job");
        assert!(active.cancelled.load(Ordering::SeqCst));
    }

    #[test]
    fn pdf_to_image_exports_a_single_page_long_group_as_webp() {
        let _conversion_lock = test_conversion_lock();
        let cancelled = AtomicBool::new(false);
        let root = test_directory("webp-single");
        let output = root.join("outputs");
        std::fs::create_dir_all(&output).expect("create output directory");
        let session = create_pdf_to_image_session().expect("create page session");
        let bytes = solid_png(6, 4, image::Rgba([12, 34, 56, 255]));
        write_pdf_to_image_page_bytes(&session.session_id, "page_00006.png", &bytes)
            .expect("write rendered PDF page");

        let result = export_pdf_to_images_blocking(
            PdfToImageExportRequest {
                session_id: session.session_id.clone(),
                page_numbers: vec![6],
                page_count: 6,
                output_dir: output.to_string_lossy().into_owned(),
                output_name: Some("sample".to_string()),
                format: "webp".to_string(),
                export_mode: "long".to_string(),
                pages_per_long_image: Some(5),
                jpeg_quality: Some(97),
                background_rgba: Some("#FFFFFFFF".to_string()),
                job_id: None,
            },
            &cancelled,
            |_, _, _, _| {},
        )
        .expect("export single-page WebP long group");
        assert_eq!(result.output_count, 1);
        assert_eq!(result.outputs[0].page_numbers, vec![6]);
        assert!(result.outputs[0]
            .output_path
            .ends_with("sample_long_01_pages_06.webp"));
        let decoded = image::open(&result.outputs[0].output_path)
            .expect("decode WebP output")
            .to_rgba8();
        assert_eq!(decoded.dimensions(), (6, 4));
        assert_eq!(decoded.get_pixel(2, 2).0, [12, 34, 56, 255]);

        remove_pdf_to_image_session(&session.session_id).expect("remove page session");
        std::fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn pdf_to_image_encodes_png_and_jpg_outputs() {
        let _conversion_lock = test_conversion_lock();
        let root = test_directory("png-jpg-encoding");
        let source = image::RgbaImage::from_pixel(8, 5, image::Rgba([48, 96, 144, 255]));

        for format in ["png", "jpg"] {
            let temporary = PdfToImageTemporaryFile::new(&root);
            encode_pdf_to_image(source.clone(), &temporary.path, format, 94)
                .expect("encode PDF page image");
            let decoded = image::ImageReader::open(&temporary.path)
                .expect("open encoded PDF page image")
                .with_guessed_format()
                .expect("detect encoded PDF page image format")
                .decode()
                .expect("decode encoded PDF page image");
            assert_eq!(decoded.dimensions(), (8, 5));
        }

        std::fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn pdf_to_image_exports_sixteen_pages_as_four_png_long_images() {
        let _conversion_lock = test_conversion_lock();
        let cancelled = AtomicBool::new(false);
        let root = test_directory("sixteen-page-long-images");
        let output = root.join("outputs");
        std::fs::create_dir_all(&output).expect("create output directory");
        let session = create_pdf_to_image_session().expect("create page session");
        for page_number in 1..=16u32 {
            let color = image::Rgba([page_number as u8, 40, 80, 255]);
            let bytes = solid_png(2, 2, color);
            write_pdf_to_image_page_bytes(
                &session.session_id,
                &format!("page_{page_number:05}.png"),
                &bytes,
            )
            .expect("write rendered PDF page");
        }

        let result = export_pdf_to_images_blocking(
            PdfToImageExportRequest {
                session_id: session.session_id.clone(),
                page_numbers: (1..=16).collect(),
                page_count: 16,
                output_dir: output.to_string_lossy().into_owned(),
                output_name: Some("sixteen".to_string()),
                format: "png".to_string(),
                export_mode: "long".to_string(),
                pages_per_long_image: Some(5),
                jpeg_quality: Some(94),
                background_rgba: Some("#FFFFFFFF".to_string()),
                job_id: None,
            },
            &cancelled,
            |_, _, _, _| {},
        )
        .expect("export sixteen PDF pages");

        assert_eq!(result.output_count, 4);
        assert_eq!(
            result
                .outputs
                .iter()
                .map(|item| item.page_numbers.clone())
                .collect::<Vec<_>>(),
            vec![
                vec![1, 2, 3, 4, 5],
                vec![6, 7, 8, 9, 10],
                vec![11, 12, 13, 14, 15],
                vec![16],
            ]
        );
        assert_eq!(
            result
                .outputs
                .iter()
                .map(|item| (item.width, item.height))
                .collect::<Vec<_>>(),
            vec![(2, 10), (2, 10), (2, 10), (2, 2)]
        );
        for item in &result.outputs {
            image::open(&item.output_path).expect("decode exported PNG long image");
        }
        assert!(result.outputs[3]
            .output_path
            .ends_with("sixteen_long_04_pages_16.png"));

        remove_pdf_to_image_session(&session.session_id).expect("remove page session");
        std::fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn pdf_to_image_long_layout_preserves_page_pixels_and_centers_narrow_pages() {
        let _conversion_lock = test_conversion_lock();
        let cancelled = AtomicBool::new(false);
        let root = test_directory("centering");
        let narrow_path = root.join("narrow.png");
        let wide_path = root.join("wide.png");
        std::fs::write(&narrow_path, solid_png(2, 2, image::Rgba([255, 0, 0, 255])))
            .expect("write narrow page");
        std::fs::write(&wide_path, solid_png(4, 1, image::Rgba([0, 0, 255, 255])))
            .expect("write wide page");
        let pages = vec![
            PdfToImageSourcePage {
                page_number: 1,
                path: narrow_path,
                width: 2,
                height: 2,
            },
            PdfToImageSourcePage {
                page_number: 2,
                path: wide_path,
                width: 4,
                height: 1,
            },
        ];
        let layout = pdf_to_image_group_layout(&pages, PDF_TO_IMAGE_MAX_LONG_PIXELS)
            .expect("calculate centered long layout");
        assert_eq!((layout.width, layout.height), (4, 3));
        assert_eq!(layout.sizes, vec![(2, 2), (4, 1)]);
        let canvas = compose_pdf_to_image_group(
            &pages,
            &layout,
            image::Rgba([255, 255, 255, 255]),
            "png",
            &cancelled,
        )
        .expect("compose centered long image");
        assert_eq!(canvas.get_pixel(0, 0).0, [255, 255, 255, 255]);
        assert_eq!(canvas.get_pixel(1, 0).0, [255, 0, 0, 255]);
        assert_eq!(canvas.get_pixel(0, 2).0, [0, 0, 255, 255]);
        std::fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn pdf_to_image_batch_publish_rolls_back_on_failure() {
        let _conversion_lock = test_conversion_lock();
        let cancelled = AtomicBool::new(false);
        let root = test_directory("rollback");
        let first_temporary = PdfToImageTemporaryFile::new(&root);
        let missing_temporary = PdfToImageTemporaryFile::new(&root);
        std::fs::write(&first_temporary.path, b"complete first output")
            .expect("write first temporary output");
        let prepared = vec![
            PdfToImagePreparedOutput {
                temporary: first_temporary,
                logical_stem: "rollback_first".to_string(),
                extension: ".png".to_string(),
                width: 1,
                height: 1,
                page_numbers: vec![1],
            },
            PdfToImagePreparedOutput {
                temporary: missing_temporary,
                logical_stem: "rollback_second".to_string(),
                extension: ".png".to_string(),
                width: 1,
                height: 1,
                page_numbers: vec![2],
            },
        ];
        assert_eq!(
            publish_pdf_to_image_batch(&prepared, &root, &cancelled)
                .expect_err("missing second temporary output must fail"),
            "pdf-to-image:publish-failed"
        );
        assert!(!root.join("rollback_first.png").exists());
        assert!(!root.join("rollback_second.png").exists());
        drop(prepared);
        std::fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn pdf_to_image_cancelled_batch_publishes_no_outputs() {
        let _conversion_lock = test_conversion_lock();
        let cancelled = AtomicBool::new(true);
        let root = test_directory("cancelled-publish");
        let temporary = PdfToImageTemporaryFile::new(&root);
        std::fs::write(&temporary.path, b"complete temporary output")
            .expect("write temporary output");
        let prepared = vec![PdfToImagePreparedOutput {
            temporary,
            logical_stem: "must_not_publish".to_string(),
            extension: ".png".to_string(),
            width: 1,
            height: 1,
            page_numbers: vec![1],
        }];

        assert_eq!(
            publish_pdf_to_image_batch(&prepared, &root, &cancelled)
                .expect_err("cancelled batch must not publish"),
            "pdf-to-image:cancelled"
        );
        assert!(!root.join("must_not_publish.png").exists());

        drop(prepared);
        std::fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn pdf_to_image_copy_fallback_is_complete_and_never_overwrites() {
        let _conversion_lock = test_conversion_lock();
        let root = test_directory("copy-fallback");
        let source = root.join("source.tmp");
        let target = root.join("target.png");
        let cancelled_target = root.join("cancelled.png");
        let payload = vec![0x5au8; 700_000];
        std::fs::write(&source, &payload).expect("write fallback source");

        let running = AtomicBool::new(false);
        copy_pdf_to_image_output(&source, &target, &running).expect("copy fallback output");
        assert_eq!(
            std::fs::read(&target).expect("read fallback output"),
            payload
        );

        std::fs::write(&source, b"replacement").expect("replace fallback source");
        assert_eq!(
            copy_pdf_to_image_output(&source, &target, &running)
                .expect_err("fallback must not overwrite an existing output")
                .kind(),
            std::io::ErrorKind::AlreadyExists
        );
        assert_eq!(
            std::fs::metadata(&target)
                .expect("read target metadata")
                .len(),
            700_000
        );

        let cancelled = AtomicBool::new(true);
        assert_eq!(
            copy_pdf_to_image_output(&source, &cancelled_target, &cancelled)
                .expect_err("cancelled fallback must stop before publication")
                .kind(),
            std::io::ErrorKind::Interrupted
        );
        assert!(!cancelled_target.exists());
        std::fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn shared_image_stitch_backend_accepts_webp() {
        let _conversion_lock = test_conversion_lock();
        let root = test_directory("shared-webp");
        let first = root.join("first.png");
        let second = root.join("second.png");
        std::fs::write(&first, solid_png(3, 2, image::Rgba([255, 0, 0, 255])))
            .expect("write first stitch page");
        std::fs::write(&second, solid_png(3, 1, image::Rgba([0, 0, 255, 255])))
            .expect("write second stitch page");
        let result = stitch_images_blocking(
            ImageStitchOptions {
                input_paths: vec![
                    first.to_string_lossy().into_owned(),
                    second.to_string_lossy().into_owned(),
                ],
                output_dir: root.to_string_lossy().into_owned(),
                output_name: Some("shared-stitch".to_string()),
                mode: "vertical".to_string(),
                reference: "first".to_string(),
                spacing_px: 0,
                scale_percent: 100,
                format: "webp".to_string(),
                jpeg_quality: 92,
                background_rgba: "#FFFFFFFF".to_string(),
            },
            |_, _, _, _| {},
        )
        .expect("export shared WebP stitch");
        assert!(result.output_path.ends_with("shared-stitch.webp"));
        assert_eq!(
            image::open(&result.output_path).unwrap().dimensions(),
            (3, 3)
        );
        std::fs::remove_dir_all(root).expect("remove test directory");
    }
}

#[cfg(test)]
mod image_conversion_tests {
    use super::*;
    use image::GenericImage;

    #[test]
    fn jpeg_conversion_accepts_an_rgba_source() {
        let unique = format!(
            "toolknit-image-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock before Unix epoch")
                .as_nanos()
        );
        let directory = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&directory).expect("create temporary image test directory");
        let output = directory.join("converted.jpg");

        let mut source = image::DynamicImage::new_rgba8(2, 2);
        source.put_pixel(0, 0, image::Rgba([255, 0, 0, 0]));
        write_converted_image(&source, &output, image::ImageFormat::Jpeg)
            .expect("RGBA image should convert to JPEG");

        let decoded = image::open(&output).expect("converted JPEG should be readable");
        assert_eq!((decoded.width(), decoded.height()), (2, 2));
        assert!(!decoded.color().has_alpha());
        std::fs::remove_dir_all(&directory).expect("remove temporary image test directory");
    }

    #[test]
    fn svg_conversion_produces_a_standard_embedded_image_document() {
        let unique = format!(
            "toolknit-svg-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock before Unix epoch")
                .as_nanos()
        );
        let directory = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&directory).expect("create temporary image test directory");
        let output = directory.join("converted.svg");
        let source = image::DynamicImage::new_rgba8(3, 2);
        write_raster_svg(&source, &output).expect("write SVG image document");

        let svg = std::fs::read_to_string(&output).expect("read SVG output");
        assert!(svg.contains("<svg xmlns=\"http://www.w3.org/2000/svg\""));
        assert!(svg.contains("width=\"3\" height=\"2\""));
        assert!(svg.contains("data:image/png;base64,"));
        std::fs::remove_dir_all(&directory).expect("remove temporary image test directory");
    }

    #[test]
    fn image_batch_rejects_duplicate_inputs_and_never_overwrites_outputs() {
        let unique = format!(
            "toolknit-image-publish-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock before Unix epoch")
                .as_nanos()
        );
        let directory = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&directory).expect("create temporary image test directory");
        let input = directory.join("input.png");
        image::DynamicImage::new_rgba8(2, 2)
            .save_with_format(&input, image::ImageFormat::Png)
            .expect("write input PNG");

        let duplicate_result = validate_image_batch_inputs(&[
            input.to_string_lossy().to_string(),
            input.to_string_lossy().to_string(),
        ]);
        assert!(duplicate_result
            .expect_err("duplicate input must fail")
            .contains("Duplicate image file"));

        let temporary = directory.join("temporary.png");
        let output = directory.join("output.png");
        std::fs::write(&temporary, b"new-content").expect("write temporary output");
        std::fs::write(&output, b"existing-content").expect("write existing output");
        assert!(publish_image_output(&temporary, &output).is_err());
        assert_eq!(
            std::fs::read(&output).expect("read existing output"),
            b"existing-content"
        );
        assert!(temporary.exists());

        std::fs::remove_file(&output).expect("remove existing output");
        publish_image_output(&temporary, &output).expect("publish new output");
        assert_eq!(
            std::fs::read(&output).expect("read published output"),
            b"new-content"
        );
        assert!(!temporary.exists());
        std::fs::remove_dir_all(&directory).expect("remove temporary image test directory");
    }

    fn stitch_test_options(
        inputs: &[std::path::PathBuf],
        output: &std::path::Path,
        mode: &str,
        format: &str,
        background: &str,
    ) -> ImageStitchOptions {
        ImageStitchOptions {
            input_paths: inputs
                .iter()
                .map(|path| path.to_string_lossy().into_owned())
                .collect(),
            output_dir: output.to_string_lossy().into_owned(),
            output_name: None,
            mode: mode.to_string(),
            reference: "first".to_string(),
            spacing_px: 0,
            scale_percent: 100,
            format: format.to_string(),
            jpeg_quality: 92,
            background_rgba: background.to_string(),
        }
    }

    #[test]
    fn image_stitch_layout_rounds_and_counts_only_between_item_gaps() {
        let layout =
            calculate_image_stitch_layout(&[(101, 10), (5, 7)], "vertical", "first", 9, 50)
                .expect("calculate vertical layout");
        assert_eq!(layout.width, 51);
        assert_eq!(layout.sizes, vec![(51, 5), (51, 71)]);
        assert_eq!(layout.height, 5 + 9 + 71);

        let one_hundred = vec![(1, 1); 100];
        let boundary = calculate_image_stitch_layout(&one_hundred, "vertical", "smallest", 0, 100)
            .expect("100-image boundary should be valid");
        assert_eq!((boundary.width, boundary.height), (1, 100));
        assert!(
            calculate_image_stitch_layout(&vec![(1, 1); 101], "vertical", "first", 0, 100,)
                .is_err()
        );
    }

    #[test]
    fn image_stitch_outputs_are_complete_unique_and_pixel_correct() {
        let unique = format!(
            "toolknit-stitch-native-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock before Unix epoch")
                .as_nanos()
        );
        let directory = std::env::temp_dir().join(unique);
        let output = directory.join("导出 结果");
        std::fs::create_dir_all(&output).expect("create stitch output directory");
        let red = directory.join("红 色.png");
        let blue = directory.join("blue.png");
        let transparent = directory.join("透明.png");
        image::RgbaImage::from_pixel(10, 20, image::Rgba([255, 0, 0, 255]))
            .save(&red)
            .expect("write red input");
        image::RgbaImage::from_pixel(20, 10, image::Rgba([0, 0, 255, 255]))
            .save(&blue)
            .expect("write blue input");
        image::RgbaImage::from_pixel(10, 10, image::Rgba([0, 0, 0, 0]))
            .save(&transparent)
            .expect("write transparent input");
        CANCEL_FLAG.store(false, Ordering::SeqCst);

        let first = stitch_images_blocking(
            stitch_test_options(
                &[red.clone(), blue.clone()],
                &output,
                "vertical",
                "png",
                "#FFFFFFFF",
            ),
            |_, _, _, _| {},
        )
        .expect("stitch vertical PNG");
        assert_eq!((first.width, first.height), (10, 25));
        let decoded = image::open(&first.output_path)
            .expect("read vertical output")
            .to_rgba8();
        assert_eq!(decoded.get_pixel(5, 19).0, [255, 0, 0, 255]);
        assert_eq!(decoded.get_pixel(5, 20).0, [0, 0, 255, 255]);

        let mut horizontal_options = stitch_test_options(
            &[red.clone(), blue.clone()],
            &output,
            "horizontal",
            "png",
            "#00FF00FF",
        );
        horizontal_options.spacing_px = 3;
        horizontal_options.reference = "largest".to_string();
        horizontal_options.scale_percent = 50;
        let second = stitch_images_blocking(horizontal_options, |_, _, _, _| {})
            .expect("stitch horizontal PNG");
        assert_eq!((second.width, second.height), (28, 10));
        assert_ne!(first.output_path, second.output_path);
        let horizontal = image::open(&second.output_path)
            .expect("read horizontal output")
            .to_rgba8();
        assert_eq!(horizontal.get_pixel(4, 5).0, [255, 0, 0, 255]);
        assert_eq!(horizontal.get_pixel(5, 5).0, [0, 255, 0, 255]);
        assert_eq!(horizontal.get_pixel(7, 5).0, [0, 255, 0, 255]);
        assert_eq!(horizontal.get_pixel(8, 5).0, [0, 0, 255, 255]);

        let alpha_result = stitch_images_blocking(
            stitch_test_options(
                &[transparent.clone(), blue.clone()],
                &output,
                "vertical",
                "png",
                "#12345600",
            ),
            |_, _, _, _| {},
        )
        .expect("stitch transparent PNG");
        let alpha = image::open(&alpha_result.output_path)
            .expect("read transparent output")
            .to_rgba8();
        assert_eq!(alpha.get_pixel(2, 2).0[3], 0);

        let jpeg_result = stitch_images_blocking(
            stitch_test_options(
                &[transparent, blue],
                &output,
                "vertical",
                "jpg",
                "#FF00FF00",
            ),
            |_, _, _, _| {},
        )
        .expect("stitch flattened JPEG");
        let jpeg = image::open(&jpeg_result.output_path)
            .expect("read JPEG output")
            .to_rgb8();
        let pixel = jpeg.get_pixel(2, 2).0;
        assert!(pixel[0] > 220 && pixel[2] > 220);
        assert!(!std::fs::read_dir(&output)
            .expect("read output directory")
            .filter_map(Result::ok)
            .any(|entry| entry
                .file_name()
                .to_string_lossy()
                .starts_with(".toolknit-stitch-")));
        std::fs::remove_dir_all(&directory).expect("remove stitch test directory");
    }

    #[test]
    fn image_stitch_rejects_damaged_duplicate_and_animated_inputs() {
        use image::codecs::gif::GifEncoder;
        use image::{Delay, Frame};
        let unique = format!("toolknit-stitch-invalid-{}", std::process::id());
        let directory = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&directory).expect("create invalid stitch test directory");
        let valid = directory.join("valid.png");
        let damaged = directory.join("damaged.png");
        let animated = directory.join("animated.gif");
        image::RgbaImage::from_pixel(2, 2, image::Rgba([1, 2, 3, 255]))
            .save(&valid)
            .expect("write valid input");
        std::fs::write(&damaged, b"not an image").expect("write damaged input");
        let gif_file = std::fs::File::create(&animated).expect("create animated GIF");
        let mut encoder = GifEncoder::new(gif_file);
        for color in [[255, 0, 0, 255], [0, 0, 255, 255]] {
            encoder
                .encode_frame(Frame::from_parts(
                    image::RgbaImage::from_pixel(2, 2, image::Rgba(color)),
                    0,
                    0,
                    Delay::from_numer_denom_ms(100, 1),
                ))
                .expect("encode GIF frame");
        }
        drop(encoder);

        assert!(validate_image_batch_inputs(&[
            valid.to_string_lossy().into_owned(),
            damaged.to_string_lossy().into_owned(),
        ])
        .is_err());
        assert!(validate_image_batch_inputs(&[
            valid.to_string_lossy().into_owned(),
            valid.to_string_lossy().into_owned(),
        ])
        .expect_err("duplicate must fail")
        .contains("Duplicate"));
        assert!(validate_image_batch_inputs(&[
            valid.to_string_lossy().into_owned(),
            animated.to_string_lossy().into_owned(),
        ])
        .expect_err("animated GIF must fail")
        .contains("animated"));
        std::fs::remove_dir_all(&directory).expect("remove invalid stitch test directory");
    }

    #[test]
    fn icon_archive_session_publishes_uniquely_and_discards_partial_output() {
        let unique = format!(
            "toolknit-icon-archive-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock before Unix epoch")
                .as_nanos()
        );
        let directory = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&directory).expect("create temporary icon archive directory");
        std::fs::write(directory.join("icons.zip"), b"existing").expect("write existing archive");

        let session_id = begin_icon_archive_write(
            directory.to_string_lossy().to_string(),
            "icons.zip".to_string(),
        )
        .expect("begin archive write");
        append_icon_archive_chunk(session_id, b"generated".to_vec()).expect("append archive chunk");
        let output = finalize_icon_archive_write(session_id).expect("publish archive");
        assert!(output.ends_with("icons_1.zip"));
        assert_eq!(
            std::fs::read(&output).expect("read published archive"),
            b"generated"
        );
        assert_eq!(
            std::fs::read(directory.join("icons.zip")).expect("read original archive"),
            b"existing"
        );

        let discarded_session = begin_icon_archive_write(
            directory.to_string_lossy().to_string(),
            "discard.zip".to_string(),
        )
        .expect("begin archive discard test");
        append_icon_archive_chunk(discarded_session, b"partial".to_vec())
            .expect("append partial archive");
        discard_icon_archive_write(discarded_session).expect("discard partial archive");
        assert!(!directory.join("discard.zip").exists());
        std::fs::remove_dir_all(&directory).expect("remove temporary icon archive directory");
    }

    #[test]
    fn jpeg_compression_produces_a_smaller_readable_file() {
        let unique = format!(
            "toolknit-compression-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock before Unix epoch")
                .as_nanos()
        );
        let directory = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&directory).expect("create temporary compression test directory");
        let source_path = directory.join("source.jpg");
        let compressed_path = directory.join("compressed.jpg");

        let mut source = image::DynamicImage::new_rgba8(256, 256);
        for y in 0..256 {
            for x in 0..256 {
                let value = ((x * 31 + y * 17) % 256) as u8;
                source.put_pixel(
                    x,
                    y,
                    image::Rgba([value, value.wrapping_mul(3), value.wrapping_mul(7), 255]),
                );
            }
        }
        write_converted_image(&source, &source_path, image::ImageFormat::Jpeg)
            .expect("write high-quality source JPEG");
        write_compressed_image(
            &source,
            &compressed_path,
            image::ImageFormat::Jpeg,
            35,
            image::codecs::png::CompressionType::Best,
        )
        .expect("write compressed JPEG");

        let source_size = std::fs::metadata(&source_path)
            .expect("source metadata")
            .len();
        let compressed_size = std::fs::metadata(&compressed_path)
            .expect("compressed metadata")
            .len();
        assert!(compressed_size < source_size);
        assert!(image::open(&compressed_path).is_ok());
        std::fs::remove_dir_all(&directory).expect("remove temporary compression test directory");
    }

    #[test]
    fn webp_compression_preserves_pixels_losslessly() {
        let unique = format!(
            "toolknit-webp-compression-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock before Unix epoch")
                .as_nanos()
        );
        let directory = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&directory).expect("create temporary image test directory");
        let output = directory.join("compressed.webp");
        let mut source = image::DynamicImage::new_rgba8(2, 2);
        source.put_pixel(0, 0, image::Rgba([10, 20, 30, 40]));
        source.put_pixel(1, 1, image::Rgba([200, 150, 100, 50]));

        write_compressed_image(
            &source,
            &output,
            image::ImageFormat::WebP,
            35,
            image::codecs::png::CompressionType::Best,
        )
        .expect("write lossless WebP");
        let decoded = image::open(&output).expect("decode WebP").to_rgba8();
        assert_eq!(decoded, source.to_rgba8());
        std::fs::remove_dir_all(&directory).expect("remove temporary image test directory");
    }
}

fn convert_image_batch_blocking(
    app_handle: tauri::AppHandle,
    input_paths: Vec<String>,
    output_dir: String,
    target_format: String,
) -> Result<BatchConvertResult, String> {
    use image::ImageFormat;
    use tauri::Emitter;

    let target_fmt = match target_format.trim().to_uppercase().as_str() {
        "JPG" | "JPEG" => Some(ImageFormat::Jpeg),
        "PNG" => Some(ImageFormat::Png),
        "WEBP" => Some(ImageFormat::WebP),
        "BMP" => Some(ImageFormat::Bmp),
        "GIF" => Some(ImageFormat::Gif),
        "SVG" => None,
        _ => return Err(format!("Unsupported target format: {}", target_format)),
    };
    let ext = match target_fmt {
        Some(ImageFormat::Jpeg) => ".jpg",
        Some(ImageFormat::Png) => ".png",
        Some(ImageFormat::WebP) => ".webp",
        Some(ImageFormat::Bmp) => ".bmp",
        Some(ImageFormat::Gif) => ".gif",
        None => ".svg",
        _ => ".png",
    };
    validate_image_batch_inputs(&input_paths)?;
    let output_dir_path = validate_image_output_dir(&output_dir)?;

    let total = input_paths.len();
    let mut success_count = 0usize;
    let mut fail_count = 0usize;
    let mut errors = Vec::new();

    for (i, input_path) in input_paths.iter().enumerate() {
        if CANCEL_FLAG.load(Ordering::SeqCst) {
            break;
        }

        let input = std::path::Path::new(input_path);
        let file_name = input
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let stem = input
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "output".to_string());
        let output_path = get_unique_output_path(&output_dir_path, &stem, ext);
        let temporary_output_path = output_dir_path.join(format!(
            ".{}-toolknit-{}-{}.tmp",
            stem,
            std::process::id(),
            i
        ));

        let _ = app_handle.emit(
            "convert-progress",
            ConvertProgress {
                file_name: file_name.clone(),
                current: i + 1,
                total,
                progress: 0.0,
                status: "converting".to_string(),
            },
        );

        let result = image::open(input);
        match result {
            Ok(img) => {
                if CANCEL_FLAG.load(Ordering::SeqCst) {
                    break;
                }
                let save_result = match target_fmt {
                    Some(format) => write_converted_image(&img, &temporary_output_path, format)
                        .map_err(|error| error.to_string()),
                    None => write_raster_svg(&img, &temporary_output_path),
                };
                if save_result.is_ok() && !CANCEL_FLAG.load(Ordering::SeqCst) {
                    if let Err(error) = publish_image_output(&temporary_output_path, &output_path) {
                        fail_count += 1;
                        errors.push(format!("{}: {}", file_name, error));
                        let _ = std::fs::remove_file(&temporary_output_path);
                        let _ = app_handle.emit(
                            "convert-progress",
                            ConvertProgress {
                                file_name,
                                current: i + 1,
                                total,
                                progress: 1.0,
                                status: "error".to_string(),
                            },
                        );
                        continue;
                    }
                    success_count += 1;
                    let _ = app_handle.emit(
                        "convert-progress",
                        ConvertProgress {
                            file_name,
                            current: i + 1,
                            total,
                            progress: 1.0,
                            status: "done".to_string(),
                        },
                    );
                } else {
                    let cancelled = CANCEL_FLAG.load(Ordering::SeqCst);
                    fail_count += 1;
                    let e = save_result.err().map(|e| e.to_string()).unwrap_or_default();
                    if !cancelled {
                        errors.push(format!("{}: {}", file_name, e));
                    }
                    let _ = std::fs::remove_file(&temporary_output_path);
                    let _ = app_handle.emit(
                        "convert-progress",
                        ConvertProgress {
                            file_name,
                            current: i + 1,
                            total,
                            progress: 1.0,
                            status: "error".to_string(),
                        },
                    );
                    if cancelled {
                        break;
                    }
                }
            }
            Err(e) => {
                fail_count += 1;
                errors.push(format!("{}: {}", file_name, e));
                let _ = app_handle.emit(
                    "convert-progress",
                    ConvertProgress {
                        file_name,
                        current: i + 1,
                        total,
                        progress: 1.0,
                        status: "error".to_string(),
                    },
                );
            }
        }
    }

    Ok(BatchConvertResult {
        success_count,
        fail_count,
        output_dir: output_dir_path.to_string_lossy().to_string(),
        errors,
        original_size: None,
        compressed_size: None,
    })
}

#[tauri::command]
async fn compress_image_batch(
    app_handle: tauri::AppHandle,
    input_paths: Vec<String>,
    output_dir: String,
    quality: String,
) -> Result<BatchConvertResult, String> {
    let _conversion_guard = begin_conversion()?;
    tokio::task::spawn_blocking(move || {
        compress_image_batch_blocking(app_handle, input_paths, output_dir, quality)
    })
    .await
    .map_err(|error| format!("Image compression worker failed: {}", error))?
}

fn validate_image_compression_inputs(input_paths: &[String], quality: &str) -> Result<(), String> {
    validate_image_batch_inputs(input_paths)?;
    if !matches!(quality, "high" | "medium" | "low") {
        return Err("Unsupported image compression quality".to_string());
    }
    for input_path in input_paths {
        let input = std::path::Path::new(input_path);
        let file_name = input
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("input image");
        let extension = input
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "webp") {
            return Err(format!(
                "{} cannot be compressed safely while preserving its format",
                file_name
            ));
        }
    }
    Ok(())
}

fn write_compressed_image(
    image: &image::DynamicImage,
    output_path: &std::path::Path,
    format: image::ImageFormat,
    jpeg_quality: u8,
    png_compression: image::codecs::png::CompressionType,
) -> image::ImageResult<()> {
    use image::codecs::jpeg::JpegEncoder;
    use image::codecs::png::{FilterType, PngEncoder};
    use image::codecs::webp::WebPEncoder;
    use std::io::BufWriter;

    let file = std::fs::File::create(output_path)?;
    let writer = BufWriter::new(file);
    match format {
        image::ImageFormat::Jpeg => {
            let mut encoder = JpegEncoder::new_with_quality(writer, jpeg_quality);
            let rgb = image.to_rgb8();
            encoder.encode(
                &rgb,
                image.width(),
                image.height(),
                image::ExtendedColorType::Rgb8,
            )
        }
        image::ImageFormat::Png => {
            let encoder = PngEncoder::new_with_quality(writer, png_compression, FilterType::Sub);
            image.write_with_encoder(encoder)
        }
        image::ImageFormat::WebP => {
            let encoder = WebPEncoder::new_lossless(writer);
            let rgba = image.to_rgba8();
            encoder.encode(
                &rgba,
                image.width(),
                image.height(),
                image::ExtendedColorType::Rgba8,
            )
        }
        _ => unreachable!("validated image compression format"),
    }
}

fn compress_image_batch_blocking(
    app_handle: tauri::AppHandle,
    input_paths: Vec<String>,
    output_dir: String,
    quality: String,
) -> Result<BatchConvertResult, String> {
    use image::codecs::png::CompressionType;
    use image::ImageFormat;
    use tauri::Emitter;

    validate_image_compression_inputs(&input_paths, &quality)?;

    let output_dir_path = validate_image_output_dir(&output_dir)?;

    // Quality presets: (jpeg_quality, png_compression)
    let (jpeg_quality, png_compression) = match quality.as_str() {
        "high" => (90u8, CompressionType::Fast),
        "medium" => (65u8, CompressionType::Default),
        "low" => (35u8, CompressionType::Best),
        _ => unreachable!("validated image compression quality"),
    };

    let total = input_paths.len();
    let mut success_count = 0usize;
    let mut fail_count = 0usize;
    let mut errors = Vec::new();
    let mut original_size: u64 = 0;
    let mut compressed_size: u64 = 0;

    for (i, input_path) in input_paths.iter().enumerate() {
        if CANCEL_FLAG.load(Ordering::SeqCst) {
            break;
        }

        let input = std::path::Path::new(input_path);
        let file_name = input
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let stem = input
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "output".to_string());

        // The input format is validated before this worker starts.
        let ext = input
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png")
            .to_lowercase();
        let (format, out_ext) = match ext.as_str() {
            "jpg" | "jpeg" => (ImageFormat::Jpeg, ".jpg"),
            "png" => (ImageFormat::Png, ".png"),
            "webp" => (ImageFormat::WebP, ".webp"),
            _ => unreachable!("validated image compression extension"),
        };

        let output_path = get_unique_output_path(&output_dir_path, &stem, out_ext);
        let temporary_output_path = output_dir_path.join(format!(
            ".{}-toolknit-compress-{}-{}.tmp",
            stem,
            std::process::id(),
            i
        ));

        let _ = app_handle.emit(
            "convert-progress",
            ConvertProgress {
                file_name: file_name.clone(),
                current: i + 1,
                total,
                progress: 0.0,
                status: "converting".to_string(),
            },
        );

        let result = image::open(input);
        match result {
            Ok(img) => {
                if CANCEL_FLAG.load(Ordering::SeqCst) {
                    break;
                }
                let save_result = write_compressed_image(
                    &img,
                    &temporary_output_path,
                    format,
                    jpeg_quality,
                    png_compression,
                );
                let input_size = std::fs::metadata(input)
                    .map(|metadata| metadata.len())
                    .unwrap_or(0);
                let output_size = std::fs::metadata(&temporary_output_path)
                    .map(|metadata| metadata.len())
                    .unwrap_or(0);
                if save_result.is_ok()
                    && !CANCEL_FLAG.load(Ordering::SeqCst)
                    && output_size < input_size
                {
                    if let Err(error) = publish_image_output(&temporary_output_path, &output_path) {
                        fail_count += 1;
                        errors.push(format!("{}: {}", file_name, error));
                        let _ = std::fs::remove_file(&temporary_output_path);
                        let _ = app_handle.emit(
                            "convert-progress",
                            ConvertProgress {
                                file_name,
                                current: i + 1,
                                total,
                                progress: 1.0,
                                status: "error".to_string(),
                            },
                        );
                        continue;
                    }
                    success_count += 1;
                    compressed_size += output_size;
                    original_size += input_size;
                    let _ = app_handle.emit(
                        "convert-progress",
                        ConvertProgress {
                            file_name,
                            current: i + 1,
                            total,
                            progress: 1.0,
                            status: "done".to_string(),
                        },
                    );
                } else {
                    let cancelled = CANCEL_FLAG.load(Ordering::SeqCst);
                    fail_count += 1;
                    let e = save_result.err().map(|e| e.to_string()).unwrap_or_default();
                    if !cancelled {
                        let reason = if e.is_empty() {
                            "no smaller output was produced"
                        } else {
                            &e
                        };
                        errors.push(format!("{}: {}", file_name, reason));
                    }
                    let _ = std::fs::remove_file(&temporary_output_path);
                    let _ = app_handle.emit(
                        "convert-progress",
                        ConvertProgress {
                            file_name,
                            current: i + 1,
                            total,
                            progress: 1.0,
                            status: "error".to_string(),
                        },
                    );
                    if cancelled {
                        break;
                    }
                }
            }
            Err(e) => {
                fail_count += 1;
                errors.push(format!("{}: {}", file_name, e));
                let _ = app_handle.emit(
                    "convert-progress",
                    ConvertProgress {
                        file_name,
                        current: i + 1,
                        total,
                        progress: 1.0,
                        status: "error".to_string(),
                    },
                );
            }
        }
    }

    Ok(BatchConvertResult {
        success_count,
        fail_count,
        output_dir: output_dir_path.to_string_lossy().to_string(),
        errors,
        original_size: Some(original_size),
        compressed_size: Some(compressed_size),
    })
}

const VIDEO_CONVERT_MAX_BATCH_FILES: usize = 30;
const VIDEO_CONVERT_MAX_INPUT_BYTES: u64 = 10 * 1024 * 1024 * 1024;

fn video_convert_profile(
    target_format: &str,
) -> Result<
    (
        Option<&'static str>,
        &'static str,
        &'static str,
        &'static str,
    ),
    String,
> {
    match target_format.trim().to_ascii_uppercase().as_str() {
        "MP4" => Ok((Some("h264_nvenc"), "libx264", "aac", ".mp4")),
        "MKV" => Ok((Some("h264_nvenc"), "libx264", "aac", ".mkv")),
        "MOV" => Ok((Some("h264_nvenc"), "libx264", "aac", ".mov")),
        "AVI" => Ok((None, "mpeg4", "libmp3lame", ".avi")),
        "WEBM" => Ok((None, "libvpx-vp9", "libopus", ".webm")),
        "FLV" => Ok((Some("h264_nvenc"), "libx264", "aac", ".flv")),
        "WMV" => Ok((None, "wmv2", "wmav2", ".wmv")),
        "TS" => Ok((Some("h264_nvenc"), "libx264", "aac", ".ts")),
        _ => Err("video-convert:invalid-target-format".to_string()),
    }
}

fn validate_video_convert_inputs(
    input_paths: &[String],
) -> Result<Vec<std::path::PathBuf>, String> {
    if input_paths.is_empty() {
        return Err("video-convert:missing-input".to_string());
    }
    if input_paths.len() > VIDEO_CONVERT_MAX_BATCH_FILES {
        return Err("video-convert:too-many-files".to_string());
    }

    let mut seen = std::collections::BTreeSet::new();
    let mut validated = Vec::with_capacity(input_paths.len());
    for input_path in input_paths {
        if input_path.contains('\0') {
            return Err("video-convert:invalid-input".to_string());
        }
        let input = std::path::PathBuf::from(input_path);
        let metadata = std::fs::symlink_metadata(&input)
            .map_err(|_| "video-convert:invalid-input".to_string())?;
        let extension = input
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase());
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || !matches!(
                extension.as_deref(),
                Some("mp4" | "avi" | "mkv" | "mov" | "webm" | "flv" | "wmv" | "ts" | "m4v")
            )
            || metadata.len() == 0
        {
            return Err("video-convert:invalid-input".to_string());
        }
        if metadata.len() > VIDEO_CONVERT_MAX_INPUT_BYTES {
            return Err("video-convert:input-too-large".to_string());
        }
        let canonical = input
            .canonicalize()
            .map_err(|_| "video-convert:invalid-input".to_string())?;
        if !seen.insert(canonical.clone()) {
            return Err("video-convert:duplicate-input".to_string());
        }
        validated.push(canonical);
    }
    Ok(validated)
}

fn validate_video_convert_output_dir(output_dir: &str) -> Result<std::path::PathBuf, String> {
    if output_dir.trim().is_empty() || output_dir.contains('\0') {
        return Err("video-convert:output-path".to_string());
    }
    let output_dir = std::path::PathBuf::from(output_dir);
    is_path_safe(&output_dir).map_err(|_| "video-convert:output-path".to_string())?;
    std::fs::create_dir_all(&output_dir).map_err(|_| "video-convert:output-path".to_string())?;
    if !output_dir.is_dir() {
        return Err("video-convert:output-path".to_string());
    }
    is_path_safe(&output_dir).map_err(|_| "video-convert:output-path".to_string())?;
    Ok(output_dir)
}

fn video_convert_file_stem(input: &std::path::Path) -> String {
    let raw_stem = input
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("video");
    let sanitized: String = raw_stem
        .chars()
        .map(|character| {
            if matches!(
                character,
                '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            ) {
                '_'
            } else {
                character
            }
        })
        .collect();
    let trimmed = sanitized
        .trim()
        .trim_end_matches(|character| character == '.' || character == ' ');
    let safe_stem: String = trimmed.chars().take(96).collect();
    if safe_stem.is_empty() {
        "video".to_string()
    } else {
        safe_stem
    }
}

fn create_video_convert_temp_path(
    output_dir: &std::path::Path,
    extension: &str,
) -> Result<std::path::PathBuf, String> {
    for _ in 0..10_000 {
        let id = VIDEO_CONVERT_TEMP_ID.fetch_add(1, Ordering::SeqCst);
        let candidate = output_dir.join(format!(
            ".toolknit-video-{}-{}{}",
            std::process::id(),
            id,
            extension
        ));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("video-convert:output-path".to_string())
}

fn publish_video_convert_output(
    temporary_path: &std::path::Path,
    output_dir: &std::path::Path,
    source_stem: &str,
    extension: &str,
) -> Result<String, String> {
    for counter in 0..10_000_u32 {
        let file_name = if counter == 0 {
            format!("{}_converted{}", source_stem, extension)
        } else {
            format!("{}_converted_{}{}", source_stem, counter, extension)
        };
        let candidate = output_dir.join(file_name);
        match std::fs::hard_link(temporary_path, &candidate) {
            Ok(()) => {
                std::fs::remove_file(temporary_path)
                    .map_err(|_| "video-convert:output-path".to_string())?;
                return Ok(candidate.to_string_lossy().into_owned());
            }
            Err(_) if candidate.exists() => continue,
            Err(_) => return Err("video-convert:output-path".to_string()),
        }
    }
    Err("video-convert:output-path".to_string())
}

fn parse_ffmpeg_timestamp(value: &str) -> Option<f64> {
    let mut segments = value.trim().split(':');
    let hours: f64 = segments.next()?.trim().parse().ok()?;
    let minutes: f64 = segments.next()?.trim().parse().ok()?;
    let seconds: f64 = segments.next()?.trim().parse().ok()?;
    if segments.next().is_some()
        || !hours.is_finite()
        || !minutes.is_finite()
        || !seconds.is_finite()
        || hours < 0.0
        || minutes < 0.0
        || seconds < 0.0
    {
        return None;
    }
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

fn parse_ffmpeg_duration(stderr: &str) -> Option<f64> {
    stderr.lines().find_map(|line| {
        let duration = line.split_once("Duration:")?.1.trim();
        let value = duration.split(',').next()?.trim();
        parse_ffmpeg_timestamp(value)
    })
}

fn parse_ffmpeg_progress_seconds(line: &str) -> Option<f64> {
    if let Some(value) = line.strip_prefix("out_time=") {
        return parse_ffmpeg_timestamp(value);
    }
    let value = line
        .strip_prefix("out_time_us=")
        .or_else(|| line.strip_prefix("out_time_ms="))?;
    value
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite() && *value >= 0.0)
        .map(|value| value / 1_000_000.0)
}

fn compact_video_convert_error(stderr: &str) -> String {
    let detail = stderr
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("FFmpeg could not convert this video.");
    let compact = detail.trim().chars().take(480).collect::<String>();
    if compact.is_empty() {
        "FFmpeg could not convert this video.".to_string()
    } else {
        compact
    }
}

async fn probe_video_convert_duration(
    ffmpeg_path: &std::path::Path,
    input: &std::path::Path,
) -> Option<f64> {
    let mut command = tokio::process::Command::new(ffmpeg_path);
    command
        .arg("-hide_banner")
        .arg("-i")
        .arg(input)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000);
    }
    let output = command.output().await.ok()?;
    parse_ffmpeg_duration(&String::from_utf8_lossy(&output.stderr))
}

async fn has_video_nvenc_encoder(ffmpeg_path: &std::path::Path, encoder: &str) -> bool {
    let mut probe = tokio::process::Command::new(ffmpeg_path);
    probe
        .arg("-hide_banner")
        .arg("-f")
        .arg("lavfi")
        .arg("-i")
        .arg("nullsrc=s=64x64:d=0.1")
        .arg("-c:v")
        .arg(encoder)
        .arg("-f")
        .arg("null")
        .arg("-")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(target_os = "windows")]
    {
        probe.creation_flags(0x08000000);
    }
    probe
        .status()
        .await
        .map(|status| status.success())
        .unwrap_or(false)
}

async fn convert_video_file(
    app_handle: tauri::AppHandle,
    ffmpeg_path: std::path::PathBuf,
    input: std::path::PathBuf,
    output_dir: std::path::PathBuf,
    video_encoder: String,
    audio_encoder: String,
    extension: &'static str,
    current: usize,
    total: usize,
) -> Result<(), String> {
    use tauri::Emitter;
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};

    if CANCEL_FLAG.load(Ordering::SeqCst) {
        return Err("video-convert:cancelled".to_string());
    }
    let file_name = input
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("video")
        .to_string();
    let _ = app_handle.emit(
        "convert-progress",
        ConvertProgress {
            file_name: file_name.clone(),
            current,
            total,
            progress: 0.0,
            status: "preparing".to_string(),
        },
    );
    let duration = probe_video_convert_duration(&ffmpeg_path, &input)
        .await
        .unwrap_or(0.0);
    if CANCEL_FLAG.load(Ordering::SeqCst) {
        return Err("video-convert:cancelled".to_string());
    }
    let temporary_path = create_video_convert_temp_path(&output_dir, extension)?;
    let mut command = tokio::process::Command::new(&ffmpeg_path);
    command
        .arg("-y")
        .arg("-i")
        .arg(&input)
        .arg("-c:v")
        .arg(&video_encoder)
        .arg("-c:a")
        .arg(&audio_encoder)
        .arg("-pix_fmt")
        .arg("yuv420p");
    match video_encoder.as_str() {
        "h264_nvenc" => {
            command
                .arg("-preset")
                .arg("fast")
                .arg("-rc")
                .arg("vbr")
                .arg("-cq")
                .arg("23");
        }
        "libx264" => {
            command.arg("-preset").arg("fast").arg("-crf").arg("23");
        }
        "libvpx-vp9" => {
            command
                .arg("-row-mt")
                .arg("1")
                .arg("-speed")
                .arg("2")
                .arg("-crf")
                .arg("32")
                .arg("-b:v")
                .arg("0");
        }
        _ => {}
    }
    command
        .arg("-progress")
        .arg("pipe:1")
        .arg("-nostats")
        .arg(&temporary_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000);
    }

    let mut child = command
        .spawn()
        .map_err(|_| "video-convert:failed".to_string())?;
    let child_id = match child.id() {
        Some(id) => id,
        None => {
            let _ = child.kill().await;
            let _ = std::fs::remove_file(&temporary_path);
            return Err("video-convert:failed".to_string());
        }
    };
    active_video_children()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(child_id);
    if CANCEL_FLAG.load(Ordering::SeqCst) {
        terminate_conversion_process(child_id);
    }

    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            terminate_conversion_process(child_id);
            active_video_children()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .remove(&child_id);
            let _ = child.wait().await;
            let _ = std::fs::remove_file(&temporary_path);
            return Err("video-convert:failed".to_string());
        }
    };
    let stderr = match child.stderr.take() {
        Some(stderr) => stderr,
        None => {
            terminate_conversion_process(child_id);
            active_video_children()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .remove(&child_id);
            let _ = child.wait().await;
            let _ = std::fs::remove_file(&temporary_path);
            return Err("video-convert:failed".to_string());
        }
    };
    let progress_app = app_handle.clone();
    let progress_name = file_name.clone();
    let progress_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(seconds) = parse_ffmpeg_progress_seconds(&line) {
                let progress = if duration > 0.0 {
                    (seconds / duration).clamp(0.0, 0.99)
                } else {
                    0.0
                };
                let _ = progress_app.emit(
                    "convert-progress",
                    ConvertProgress {
                        file_name: progress_name.clone(),
                        current,
                        total,
                        progress,
                        status: "converting".to_string(),
                    },
                );
            }
        }
    });
    let stderr_task = tokio::spawn(async move {
        let mut bytes = Vec::new();
        let mut reader = BufReader::new(stderr);
        let _ = reader.read_to_end(&mut bytes).await;
        String::from_utf8_lossy(&bytes).into_owned()
    });
    let status = child.wait().await;
    active_video_children()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(&child_id);
    let _ = progress_task.await;
    let stderr = stderr_task.await.unwrap_or_default();

    if CANCEL_FLAG.load(Ordering::SeqCst) {
        let _ = std::fs::remove_file(&temporary_path);
        return Err("video-convert:cancelled".to_string());
    }
    match status {
        Ok(status) if status.success() => {
            publish_video_convert_output(
                &temporary_path,
                &output_dir,
                &video_convert_file_stem(&input),
                extension,
            )?;
            let _ = app_handle.emit(
                "convert-progress",
                ConvertProgress {
                    file_name,
                    current,
                    total,
                    progress: 1.0,
                    status: "done".to_string(),
                },
            );
            Ok(())
        }
        _ => {
            let _ = std::fs::remove_file(&temporary_path);
            Err(compact_video_convert_error(&stderr))
        }
    }
}

#[tauri::command]
async fn convert_video_batch(
    app_handle: tauri::AppHandle,
    input_paths: Vec<String>,
    output_dir: String,
    target_format: String,
) -> Result<BatchConvertResult, String> {
    use tauri::Emitter;

    let _conversion_guard = begin_conversion()?;
    let input_paths = validate_video_convert_inputs(&input_paths)?;
    let output_dir = validate_video_convert_output_dir(&output_dir)?;
    let (nvenc_encoder, cpu_encoder, audio_encoder, extension) =
        video_convert_profile(&target_format)?;
    let ffmpeg_path = get_ffmpeg_path()?;
    let video_encoder = match nvenc_encoder {
        Some(encoder) if has_video_nvenc_encoder(&ffmpeg_path, encoder).await => encoder,
        _ => cpu_encoder,
    }
    .to_string();
    let total = input_paths.len();
    let max_parallel = std::cmp::min(2, total);
    let mut success_count = 0usize;
    let mut fail_count = 0usize;
    let mut errors = Vec::new();
    let mut join_set = tokio::task::JoinSet::new();

    for (index, input) in input_paths.into_iter().enumerate() {
        if CANCEL_FLAG.load(Ordering::SeqCst) {
            break;
        }
        let file_name = input
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("video")
            .to_string();
        let ffmpeg_path = ffmpeg_path.clone();
        let output_dir = output_dir.clone();
        let worker_app_handle = app_handle.clone();
        let video_encoder = video_encoder.clone();
        let audio_encoder = audio_encoder.to_string();
        join_set.spawn(async move {
            let result = convert_video_file(
                worker_app_handle,
                ffmpeg_path,
                input,
                output_dir,
                video_encoder,
                audio_encoder,
                extension,
                index + 1,
                total,
            )
            .await;
            (index + 1, file_name, result)
        });

        while join_set.len() >= max_parallel {
            if let Some(result) = join_set.join_next().await {
                match result {
                    Ok((_current, _file_name, Ok(()))) => success_count += 1,
                    Ok((current, file_name, Err(error))) if error != "video-convert:cancelled" => {
                        fail_count += 1;
                        errors.push(format!("{}: {}", file_name, error));
                        let _ = app_handle.emit(
                            "convert-progress",
                            ConvertProgress {
                                file_name,
                                current,
                                total,
                                progress: 1.0,
                                status: "error".to_string(),
                            },
                        );
                    }
                    Ok(_) => {}
                    Err(error) => {
                        fail_count += 1;
                        errors.push(format!("Video worker failed: {}", error));
                    }
                }
            }
        }
    }

    while let Some(result) = join_set.join_next().await {
        match result {
            Ok((_current, _file_name, Ok(()))) => success_count += 1,
            Ok((current, file_name, Err(error))) if error != "video-convert:cancelled" => {
                fail_count += 1;
                errors.push(format!("{}: {}", file_name, error));
                let _ = app_handle.emit(
                    "convert-progress",
                    ConvertProgress {
                        file_name,
                        current,
                        total,
                        progress: 1.0,
                        status: "error".to_string(),
                    },
                );
            }
            Ok(_) => {}
            Err(error) => {
                fail_count += 1;
                errors.push(format!("Video worker failed: {}", error));
            }
        }
    }

    if CANCEL_FLAG.load(Ordering::SeqCst) {
        return Err("video-convert:cancelled".to_string());
    }
    Ok(BatchConvertResult {
        success_count,
        fail_count,
        output_dir: output_dir.to_string_lossy().to_string(),
        errors,
        original_size: None,
        compressed_size: None,
    })
}

#[cfg(test)]
mod video_conversion_tests {
    use super::*;

    fn test_directory(label: &str) -> std::path::PathBuf {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock is valid")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "toolknit-video-{}-{}-{}",
            label,
            std::process::id(),
            suffix
        ));
        std::fs::create_dir_all(&directory).expect("create temporary test directory");
        directory
    }

    #[test]
    fn video_convert_accepts_only_declared_target_formats() {
        let webm = video_convert_profile(" webm ").expect("webm should be supported");
        assert_eq!(webm.1, "libvpx-vp9");
        assert!(
            webm.0.is_none(),
            "WebM must not use an incompatible H.264 NVENC encoder"
        );
        assert!(video_convert_profile("mpeg").is_err());
    }

    #[test]
    fn video_convert_rejects_duplicate_or_invalid_input_paths() {
        let directory = test_directory("validation");
        let video = directory.join("clip.m4v");
        std::fs::write(&video, [0_u8; 32]).expect("write fixture video");
        let video_path = video.to_string_lossy().into_owned();
        assert_eq!(
            validate_video_convert_inputs(&[video_path.clone()])
                .expect("m4v input should be accepted")
                .len(),
            1
        );
        assert_eq!(
            validate_video_convert_inputs(&[video_path.clone(), video_path])
                .expect_err("duplicate input must be rejected"),
            "video-convert:duplicate-input"
        );
        let invalid = directory.join("clip.txt");
        std::fs::write(&invalid, [0_u8; 32]).expect("write invalid fixture");
        assert_eq!(
            validate_video_convert_inputs(&[invalid.to_string_lossy().into_owned()])
                .expect_err("non-video input must be rejected"),
            "video-convert:invalid-input"
        );
        std::fs::remove_dir_all(&directory).expect("remove temporary test directory");
    }

    #[test]
    fn video_convert_parses_timestamp_progress() {
        assert_eq!(parse_ffmpeg_timestamp("01:02:03.5"), Some(3723.5));
        assert_eq!(
            parse_ffmpeg_progress_seconds("out_time=00:00:05.25"),
            Some(5.25)
        );
        assert_eq!(
            parse_ffmpeg_progress_seconds("out_time_us=2500000"),
            Some(2.5)
        );
        assert_eq!(parse_ffmpeg_timestamp("bad"), None);
    }

    #[test]
    fn video_convert_publishes_unique_output_without_overwriting() {
        let directory = test_directory("publish");
        let existing = directory.join("sample_converted.mp4");
        let temporary = directory.join(".toolknit-video-temp.mp4");
        std::fs::write(&existing, b"original-output").expect("write existing output");
        std::fs::write(&temporary, b"new-output").expect("write temporary output");

        let published = publish_video_convert_output(&temporary, &directory, "sample", ".mp4")
            .expect("publish a unique output");
        assert!(published.ends_with("sample_converted_1.mp4"));
        assert_eq!(
            std::fs::read(&existing).expect("read existing output"),
            b"original-output"
        );
        assert_eq!(
            std::fs::read(&published).expect("read published output"),
            b"new-output"
        );
        assert!(!temporary.exists());
        std::fs::remove_dir_all(&directory).expect("remove temporary test directory");
    }
}

#[derive(serde::Serialize)]
struct ProbeResult {
    duration: f64,
    file_size: u64,
    audio_tracks: Vec<AudioTrack>,
    frame_rate: f64,
    width: u32,
    height: u32,
}

#[derive(serde::Serialize)]
struct AudioTrack {
    index: usize,
    codec: String,
    language: String,
    channels: String,
}

const AUDIO_EXTRACT_MAX_INPUT_BYTES: u64 = 10 * 1024 * 1024 * 1024;
const AUDIO_EXTRACT_MAX_TRACK_INDEX: usize = 31;

fn validate_audio_extract_input(input_path: &str) -> Result<std::path::PathBuf, String> {
    if input_path.contains('\0') {
        return Err("audio-extract:invalid-input".to_string());
    }
    let input = std::path::PathBuf::from(input_path);
    let extension = input
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    let metadata =
        std::fs::symlink_metadata(&input).map_err(|_| "audio-extract:invalid-input".to_string())?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || !matches!(
            extension.as_deref(),
            Some("mp4" | "mkv" | "avi" | "mov" | "webm" | "flv" | "wmv" | "ts" | "m4v")
        )
    {
        return Err("audio-extract:invalid-input".to_string());
    }
    if metadata.len() == 0 {
        return Err("audio-extract:invalid-input".to_string());
    }
    if metadata.len() > AUDIO_EXTRACT_MAX_INPUT_BYTES {
        return Err("audio-extract:input-too-large".to_string());
    }
    input
        .canonicalize()
        .map_err(|_| "audio-extract:invalid-input".to_string())
}

fn validate_audio_extract_output_dir(output_dir: &str) -> Result<std::path::PathBuf, String> {
    if output_dir.trim().is_empty() || output_dir.contains('\0') {
        return Err("audio-extract:output-path".to_string());
    }
    let output_dir = std::path::PathBuf::from(output_dir);
    is_path_safe(&output_dir).map_err(|_| "audio-extract:output-path".to_string())?;
    std::fs::create_dir_all(&output_dir).map_err(|_| "audio-extract:output-path".to_string())?;
    if !output_dir.is_dir() {
        return Err("audio-extract:output-path".to_string());
    }
    let output_dir = output_dir
        .canonicalize()
        .map_err(|_| "audio-extract:output-path".to_string())?;
    is_path_safe(&output_dir).map_err(|_| "audio-extract:output-path".to_string())?;
    Ok(output_dir)
}

fn normalize_audio_extract_format(value: &str) -> Result<&'static str, String> {
    match value.trim().to_ascii_uppercase().as_str() {
        "MP3" => Ok("MP3"),
        "AAC" => Ok("AAC"),
        "WAV" => Ok("WAV"),
        "FLAC" => Ok("FLAC"),
        "OGG" => Ok("OGG"),
        _ => Err("audio-extract:invalid-target-format".to_string()),
    }
}

fn create_audio_extract_temp_path(
    output_dir: &std::path::Path,
    extension: &str,
) -> Result<std::path::PathBuf, String> {
    use std::time::{SystemTime, UNIX_EPOCH};

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "audio-extract:output-path".to_string())?
        .as_nanos();
    for attempt in 0..100_u32 {
        let candidate = output_dir.join(format!(
            ".toolknit-audio-extract-{}-{}-{}{}",
            std::process::id(),
            timestamp,
            attempt,
            extension
        ));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("audio-extract:output-path".to_string())
}

fn audio_extract_file_stem(input: &std::path::Path) -> String {
    let raw_stem = input
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("video");
    let sanitized: String = raw_stem
        .chars()
        .map(|character| {
            if matches!(
                character,
                '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            ) {
                '_'
            } else {
                character
            }
        })
        .collect();
    let trimmed = sanitized
        .trim()
        .trim_end_matches(|character| character == '.' || character == ' ');
    let safe_stem: String = trimmed.chars().take(96).collect();
    if safe_stem.is_empty() {
        "video".to_string()
    } else {
        safe_stem
    }
}

fn publish_audio_extract_output(
    temporary_path: &std::path::Path,
    output_dir: &std::path::Path,
    source_stem: &str,
    extension: &str,
) -> Result<String, String> {
    for counter in 0..10_000_u32 {
        let name = if counter == 0 {
            format!("{}_audio{}", source_stem, extension)
        } else {
            format!("{}_audio_{}{}", source_stem, counter, extension)
        };
        let candidate = output_dir.join(name);
        match std::fs::hard_link(temporary_path, &candidate) {
            Ok(()) => {
                std::fs::remove_file(temporary_path)
                    .map_err(|_| "audio-extract:output-path".to_string())?;
                return Ok(candidate.to_string_lossy().into_owned());
            }
            Err(_) if candidate.exists() => continue,
            Err(_) => return Err("audio-extract:output-path".to_string()),
        }
    }
    Err("audio-extract:output-path".to_string())
}

#[tauri::command]
async fn probe_video(input_path: String) -> Result<ProbeResult, String> {
    let input = validate_audio_extract_input(&input_path)?;
    let ffmpeg_path = get_ffmpeg_path()?;
    let mut cmd = tokio::process::Command::new(&ffmpeg_path);
    cmd.arg("-i")
        .arg(&input)
        .arg("-hide_banner")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }

    let output = cmd
        .spawn()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?
        .wait_with_output()
        .await
        .map_err(|e| format!("ffmpeg wait failed: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Parse duration
    let mut duration: f64 = 0.0;
    for line in stderr.lines() {
        if line.contains("Duration:") {
            let start = line.find("Duration:").map(|i| i + 9);
            if let Some(s) = start {
                let dur_str = line[s..].trim();
                let end = dur_str.find(',').unwrap_or(dur_str.len());
                let parts: Vec<&str> = dur_str[..end].trim().split(':').collect();
                if parts.len() == 3 {
                    let h: f64 = parts[0].trim().parse().unwrap_or(0.0);
                    let m: f64 = parts[1].trim().parse().unwrap_or(0.0);
                    let s: f64 = parts[2].trim().parse().unwrap_or(0.0);
                    duration = h * 3600.0 + m * 60.0 + s;
                }
            }
            break;
        }
    }

    // Parse the primary video stream's declared frame rate for desktop frame stepping.
    let mut frame_rate = 0.0;
    let mut video_width: u32 = 0;
    let mut video_height: u32 = 0;
    for line in stderr.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Stream #") && trimmed.contains("Video:") {
            let tokens: Vec<&str> = trimmed.split_whitespace().collect();
            for token in &tokens {
                let clean = token.trim_end_matches(',').trim();
                if let Some((w, h)) = clean.split_once('x') {
                    if let (Ok(parsed_w), Ok(parsed_h)) = (w.parse::<u32>(), h.parse::<u32>()) {
                        if parsed_w > 0 && parsed_h > 0 {
                            video_width = parsed_w;
                            video_height = parsed_h;
                            break;
                        }
                    }
                }
            }
            for pair in tokens.windows(2) {
                if pair[1].eq_ignore_ascii_case("fps") {
                    frame_rate = pair[0].trim_end_matches(',').parse::<f64>().unwrap_or(0.0);
                    break;
                }
            }
            break;
        }
    }

    // Parse audio tracks
    let mut audio_tracks = Vec::new();
    for line in stderr.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Stream #") && trimmed.contains("Audio:") {
            let index = audio_tracks.len();
            let codec = if trimmed.contains("mp3") {
                "MP3"
            } else if trimmed.contains("aac") {
                "AAC"
            } else if trimmed.contains("ac3") {
                "AC3"
            } else if trimmed.contains("vorbis") {
                "Vorbis"
            } else if trimmed.contains("opus") {
                "Opus"
            } else if trimmed.contains("flac") {
                "FLAC"
            } else if trimmed.contains("pcm") {
                "PCM"
            } else {
                "Unknown"
            };
            let language = if trimmed.contains("(") {
                let lang_start = trimmed.rfind("(").map(|i| i + 1);
                let lang_end = trimmed.rfind(")").unwrap_or(trimmed.len());
                if let Some(s) = lang_start {
                    trimmed[s..lang_end].to_string()
                } else {
                    "default".to_string()
                }
            } else {
                "default".to_string()
            };
            let channels = if trimmed.contains("mono") {
                "mono"
            } else if trimmed.contains("stereo") {
                "stereo"
            } else if trimmed.contains("5.1") {
                "5.1"
            } else if trimmed.contains("7.1") {
                "7.1"
            } else {
                "unknown"
            };
            audio_tracks.push(AudioTrack {
                index,
                codec: codec.to_string(),
                language,
                channels: channels.to_string(),
            });
        }
    }

    let file_size = std::fs::metadata(&input).map(|m| m.len()).unwrap_or(0);

    Ok(ProbeResult {
        duration,
        file_size,
        audio_tracks,
        frame_rate,
        width: video_width,
        height: video_height,
    })
}

#[derive(serde::Serialize)]
struct VideoPreviewFrame {
    image_data_url: String,
    timestamp_ms: u64,
}

#[derive(serde::Serialize)]
struct VideoPreviewClip {
    media_data_url: String,
    start_ms: u64,
    end_ms: u64,
}

fn validate_video_preview_clip_range(start_ms: u64, end_ms: u64) -> Result<(), String> {
    const MAX_TIMESTAMP_MS: u64 = 24 * 60 * 60 * 1000;
    const MAX_DURATION_MS: u64 = 30_000;
    if end_ms <= start_ms || end_ms > MAX_TIMESTAMP_MS || end_ms - start_ms > MAX_DURATION_MS {
        return Err("video-preview:invalid-range".to_string());
    }
    Ok(())
}

/// Render a lightweight preview with the same FFmpeg decoder used for exports.
/// WebView media support varies by installed Windows codecs, so the desktop UI
/// deliberately does not depend on HTML video decoding for frame selection.
#[tauri::command]
async fn render_video_preview_frame(
    input_path: String,
    timestamp_ms: u64,
) -> Result<VideoPreviewFrame, String> {
    use base64::Engine;

    const MAX_TIMESTAMP_MS: u64 = 24 * 60 * 60 * 1000;
    const MAX_PREVIEW_BYTES: usize = 8 * 1024 * 1024;

    let input = validate_audio_extract_input(&input_path)?;
    if timestamp_ms > MAX_TIMESTAMP_MS {
        return Err("video-preview:invalid-timestamp".to_string());
    }
    let ffmpeg = get_ffmpeg_path()?;
    let mut command = tokio::process::Command::new(&ffmpeg);
    command
        .arg("-hide_banner")
        .arg("-nostdin")
        .arg("-loglevel")
        .arg("error")
        .arg("-i")
        .arg(&input)
        // Put -ss after the input so keyboard frame stepping matches export.
        .arg("-ss")
        .arg(format!("{:.3}", timestamp_ms as f64 / 1000.0))
        .arg("-map")
        .arg("0:v:0")
        .arg("-frames:v")
        .arg("1")
        .arg("-vf")
        .arg("scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos")
        .arg("-c:v")
        .arg("mjpeg")
        .arg("-q:v")
        .arg("4")
        .arg("-f")
        .arg("image2pipe")
        .arg("pipe:1")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000);
    }

    let output = command
        .spawn()
        .map_err(|_| "video-preview:engine-failed".to_string())?
        .wait_with_output()
        .await
        .map_err(|_| "video-preview:engine-failed".to_string())?;
    if !output.status.success() || output.stdout.is_empty() {
        return Err("video-preview:engine-failed".to_string());
    }
    if output.stdout.len() > MAX_PREVIEW_BYTES {
        return Err("video-preview:output-too-large".to_string());
    }

    Ok(VideoPreviewFrame {
        image_data_url: format!(
            "data:image/jpeg;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(output.stdout)
        ),
        timestamp_ms,
    })
}

/// Transcode the selected range to a small, browser-compatible stream. The source
/// file itself is never exposed to the WebView, whose codec support is inconsistent.
#[tauri::command]
async fn render_video_preview_clip(
    input_path: String,
    start_ms: u64,
    end_ms: u64,
) -> Result<VideoPreviewClip, String> {
    use base64::Engine;

    const MAX_PREVIEW_BYTES: usize = 10 * 1024 * 1024;

    validate_video_preview_clip_range(start_ms, end_ms)?;
    let input = validate_audio_extract_input(&input_path)?;
    let ffmpeg = get_ffmpeg_path()?;
    let source_duration = probe_video_convert_duration(&ffmpeg, &input)
        .await
        .unwrap_or(0.0);
    if source_duration > 0.0 && end_ms as f64 > source_duration * 1000.0 + 1.0 {
        return Err("video-preview:timestamp-out-of-range".to_string());
    }

    let mut command = tokio::process::Command::new(&ffmpeg);
    command
        .arg("-hide_banner")
        .arg("-nostdin")
        .arg("-loglevel")
        .arg("error")
        .arg("-i")
        .arg(&input)
        .arg("-ss")
        .arg(format!("{:.3}", start_ms as f64 / 1000.0))
        .arg("-t")
        .arg(format!("{:.3}", (end_ms - start_ms) as f64 / 1000.0))
        .arg("-map")
        .arg("0:v:0")
        .arg("-an")
        .arg("-vf")
        .arg("fps=12,scale=w='min(960,iw)':h='min(540,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos")
        .arg("-c:v")
        .arg("libx264")
        .arg("-profile:v")
        .arg("baseline")
        .arg("-level:v")
        .arg("3.1")
        .arg("-preset")
        .arg("veryfast")
        .arg("-crf")
        .arg("27")
        .arg("-maxrate")
        .arg("900k")
        .arg("-bufsize")
        .arg("1800k")
        .arg("-pix_fmt")
        .arg("yuv420p")
        .arg("-movflags")
        .arg("+frag_keyframe+empty_moov+default_base_moof")
        .arg("-f")
        .arg("mp4")
        .arg("pipe:1")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000);
    }

    let output = command
        .spawn()
        .map_err(|_| "video-preview:engine-failed".to_string())?
        .wait_with_output()
        .await
        .map_err(|_| "video-preview:engine-failed".to_string())?;
    if !output.status.success() || output.stdout.is_empty() {
        return Err("video-preview:engine-failed".to_string());
    }
    if output.stdout.len() > MAX_PREVIEW_BYTES {
        return Err("video-preview:output-too-large".to_string());
    }

    Ok(VideoPreviewClip {
        media_data_url: format!(
            "data:video/mp4;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(output.stdout)
        ),
        start_ms,
        end_ms,
    })
}

#[cfg(test)]
mod video_preview_contract_tests {
    use super::*;

    #[test]
    fn preview_clip_accepts_a_gif_sized_selection_only() {
        assert!(validate_video_preview_clip_range(0, 30_000).is_ok());
        assert_eq!(
            validate_video_preview_clip_range(0, 30_001).unwrap_err(),
            "video-preview:invalid-range"
        );
        assert_eq!(
            validate_video_preview_clip_range(4_000, 4_000).unwrap_err(),
            "video-preview:invalid-range"
        );
    }

    #[tokio::test]
    async fn preview_clip_transcodes_to_a_browser_compatible_mp4_stream() {
        use base64::Engine;

        let _guard = test_conversion_lock();
        let Ok(ffmpeg) = get_ffmpeg_path() else {
            return;
        };
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock is valid")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "toolknit-video-preview-{}-{}",
            std::process::id(),
            unique
        ));
        std::fs::create_dir_all(&directory).expect("create preview test directory");
        let source = directory.join("sample.mp4");
        let generated = std::process::Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=320x180:rate=12",
                "-t",
                "2",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
            ])
            .arg(&source)
            .status()
            .expect("start fixture encoder");
        assert!(generated.success(), "create preview fixture");

        let preview = render_video_preview_clip(source.to_string_lossy().into_owned(), 0, 1_000)
            .await
            .expect("render preview clip");
        let encoded = preview
            .media_data_url
            .strip_prefix("data:video/mp4;base64,")
            .expect("video preview data URL");
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .expect("decode preview video");
        assert!(bytes.windows(4).any(|chunk| chunk == b"ftyp"));
        assert!(bytes.len() > 1_000, "preview stream is non-empty");

        std::fs::remove_dir_all(&directory).expect("remove preview test directory");
    }
}

#[derive(serde::Serialize)]
struct VideoFrameResult {
    output_path: String,
    timestamp_ms: u64,
    format: String,
}

fn publish_video_frame_output(
    temporary_path: &std::path::Path,
    output_dir: &std::path::Path,
    source_stem: &str,
    timestamp_ms: u64,
    extension: &str,
) -> Result<String, String> {
    for counter in 0..10_000_u32 {
        let suffix = if counter == 0 {
            String::new()
        } else {
            format!("_{}", counter)
        };
        let candidate = output_dir.join(format!(
            "{}_frame_{}ms{}{}",
            source_stem, timestamp_ms, suffix, extension
        ));
        match std::fs::hard_link(temporary_path, &candidate) {
            Ok(()) => {
                std::fs::remove_file(temporary_path)
                    .map_err(|_| "video-frame:output-path".to_string())?;
                return Ok(candidate.to_string_lossy().into_owned());
            }
            Err(_) if candidate.exists() => continue,
            Err(_) => return Err("video-frame:output-path".to_string()),
        }
    }
    Err("video-frame:output-path".to_string())
}

#[tauri::command]
async fn extract_video_frame(
    app_handle: tauri::AppHandle,
    input_path: String,
    output_dir: String,
    timestamp_ms: u64,
    format: String,
) -> Result<VideoFrameResult, String> {
    use tauri::Emitter;
    let _guard = begin_conversion()?;
    let input = validate_audio_extract_input(&input_path)?;
    if timestamp_ms > 24 * 60 * 60 * 1000 {
        return Err("video-frame:invalid-timestamp".to_string());
    }
    let normalized_format = match format.trim().to_ascii_lowercase().as_str() {
        "png" => "png",
        "jpg" | "jpeg" => "jpg",
        _ => return Err("video-frame:invalid-format".to_string()),
    };
    let output_dir = validate_audio_extract_output_dir(&output_dir)?;
    let ffmpeg = get_ffmpeg_path()?;
    let duration = probe_video_convert_duration(&ffmpeg, &input)
        .await
        .unwrap_or(0.0);
    if duration > 0.0 && timestamp_ms as f64 > duration * 1000.0 + 1.0 {
        return Err("video-frame:timestamp-out-of-range".to_string());
    }
    let extension = if normalized_format == "png" {
        ".png"
    } else {
        ".jpg"
    };
    let temporary = create_audio_extract_temp_path(&output_dir, extension)?;
    let _ = app_handle.emit(
        "video-frame-progress",
        serde_json::json!({ "progress": 0.1, "phase": "prepare" }),
    );
    let mut command = tokio::process::Command::new(&ffmpeg);
    command
        .arg("-hide_banner")
        .arg("-nostdin")
        .arg("-y")
        .arg("-i")
        .arg(&input)
        .arg("-ss")
        .arg(format!("{:.3}", timestamp_ms as f64 / 1000.0))
        .arg("-map")
        .arg("0:v:0")
        .arg("-frames:v")
        .arg("1");
    if normalized_format == "png" {
        command.arg("-c:v").arg("png");
    } else {
        command.arg("-q:v").arg("2");
    }
    command
        .arg(&temporary)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000);
    }
    let result = command
        .spawn()
        .map_err(|_| "video-frame:engine-failed".to_string())?
        .wait_with_output()
        .await
        .map_err(|_| "video-frame:engine-failed".to_string())?;
    if CANCEL_FLAG.load(Ordering::SeqCst) {
        let _ = std::fs::remove_file(&temporary);
        return Err("video-frame:cancelled".to_string());
    }
    if !result.status.success()
        || !temporary.is_file()
        || std::fs::metadata(&temporary).map(|m| m.len()).unwrap_or(0) == 0
    {
        let _ = std::fs::remove_file(&temporary);
        return Err("video-frame:engine-failed".to_string());
    }
    let _ = app_handle.emit(
        "video-frame-progress",
        serde_json::json!({ "progress": 0.9, "phase": "publish" }),
    );
    let output_path = publish_video_frame_output(
        &temporary,
        &output_dir,
        &audio_extract_file_stem(&input),
        timestamp_ms,
        extension,
    )?;
    let _ = app_handle.emit(
        "video-frame-progress",
        serde_json::json!({ "progress": 1.0, "phase": "complete" }),
    );
    Ok(VideoFrameResult {
        output_path,
        timestamp_ms,
        format: normalized_format.to_string(),
    })
}

#[derive(serde::Serialize)]
struct VideoGifResult {
    output_path: String,
    start_ms: u64,
    end_ms: u64,
    duration_ms: u64,
    frame_rate: u32,
    width: u32,
    quality: String,
    output_size: u64,
}

fn publish_video_gif_output(
    temporary_path: &std::path::Path,
    output_dir: &std::path::Path,
    source_stem: &str,
    start_ms: u64,
    end_ms: u64,
) -> Result<String, String> {
    for counter in 0..10_000_u32 {
        let suffix = if counter == 0 {
            String::new()
        } else {
            format!("_{}", counter)
        };
        let candidate = output_dir.join(format!(
            "{}_clip_{}-{}ms{}.gif",
            source_stem, start_ms, end_ms, suffix
        ));
        match std::fs::hard_link(temporary_path, &candidate) {
            Ok(()) => {
                std::fs::remove_file(temporary_path)
                    .map_err(|_| "video-gif:output-path".to_string())?;
                return Ok(candidate.to_string_lossy().into_owned());
            }
            Err(_) if candidate.exists() => continue,
            Err(_) => return Err("video-gif:output-path".to_string()),
        }
    }
    Err("video-gif:output-path".to_string())
}

#[tauri::command]
async fn extract_video_gif(
    app_handle: tauri::AppHandle,
    input_path: String,
    output_dir: String,
    start_ms: u64,
    end_ms: u64,
    frame_rate: Option<u32>,
    width: Option<u32>,
    quality: Option<String>,
) -> Result<VideoGifResult, String> {
    use tauri::Emitter;
    const MAX_GIF_DURATION_MS: u64 = 30_000;
    const MAX_GIF_OUTPUT_BYTES: u64 = 500 * 1024 * 1024;
    let _guard = begin_conversion()?;
    let input = validate_audio_extract_input(&input_path)?;
    if end_ms <= start_ms || end_ms - start_ms > MAX_GIF_DURATION_MS || end_ms > 24 * 60 * 60 * 1000
    {
        return Err("video-gif:invalid-range".to_string());
    }
    let frame_rate = frame_rate.unwrap_or(12);
    let width = width.unwrap_or(640);
    if !(1..=20).contains(&frame_rate) || !(160..=1920).contains(&width) {
        return Err("video-gif:invalid-settings".to_string());
    }
    let quality = quality
        .unwrap_or_else(|| "balanced".to_string())
        .trim()
        .to_ascii_lowercase();
    let (max_colors, dither) = match quality.as_str() {
        "high" => (256_u32, "sierra2_4a"),
        "balanced" => (192_u32, "bayer:bayer_scale=3"),
        "small" => (128_u32, "bayer:bayer_scale=4"),
        "tiny" => (96_u32, "bayer:bayer_scale=5"),
        _ => return Err("video-gif:invalid-quality".to_string()),
    };
    let output_dir = validate_audio_extract_output_dir(&output_dir)?;
    let ffmpeg = get_ffmpeg_path()?;
    let duration = probe_video_convert_duration(&ffmpeg, &input)
        .await
        .unwrap_or(0.0);
    if duration > 0.0 && end_ms as f64 > duration * 1000.0 + 1.0 {
        return Err("video-gif:timestamp-out-of-range".to_string());
    }
    let temporary = create_audio_extract_temp_path(&output_dir, ".gif")?;
    let _ = app_handle.emit(
        "video-gif-progress",
        serde_json::json!({ "progress": 0.05, "phase": "prepare" }),
    );
    let filter = format!("fps={},scale=w='min({},iw)':h=-2:flags=lanczos,split[a][b];[a]palettegen=max_colors={}:stats_mode=diff[p];[b][p]paletteuse=dither={}:diff_mode=rectangle[out]", frame_rate, width, max_colors, dither);
    let mut command = tokio::process::Command::new(&ffmpeg);
    command
        .arg("-hide_banner")
        .arg("-nostdin")
        .arg("-y")
        .arg("-i")
        .arg(&input)
        .arg("-ss")
        .arg(format!("{:.3}", start_ms as f64 / 1000.0))
        .arg("-t")
        .arg(format!("{:.3}", (end_ms - start_ms) as f64 / 1000.0))
        .arg("-filter_complex")
        .arg(filter)
        .arg("-map")
        .arg("[out]")
        .arg("-loop")
        .arg("0")
        .arg(&temporary)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000);
    }
    let result = command
        .spawn()
        .map_err(|_| "video-gif:engine-failed".to_string())?
        .wait_with_output()
        .await
        .map_err(|_| "video-gif:engine-failed".to_string())?;
    if CANCEL_FLAG.load(Ordering::SeqCst) {
        let _ = std::fs::remove_file(&temporary);
        return Err("video-gif:cancelled".to_string());
    }
    let metadata =
        std::fs::metadata(&temporary).map_err(|_| "video-gif:engine-failed".to_string())?;
    if !result.status.success() || !metadata.is_file() || metadata.len() == 0 {
        let _ = std::fs::remove_file(&temporary);
        return Err("video-gif:engine-failed".to_string());
    }
    if metadata.len() > MAX_GIF_OUTPUT_BYTES {
        let _ = std::fs::remove_file(&temporary);
        return Err("video-gif:output-too-large".to_string());
    }
    let output_size = metadata.len();
    let _ = app_handle.emit(
        "video-gif-progress",
        serde_json::json!({ "progress": 0.92, "phase": "publish" }),
    );
    let output_path = publish_video_gif_output(
        &temporary,
        &output_dir,
        &audio_extract_file_stem(&input),
        start_ms,
        end_ms,
    )?;
    let _ = app_handle.emit(
        "video-gif-progress",
        serde_json::json!({ "progress": 1.0, "phase": "complete" }),
    );
    Ok(VideoGifResult {
        output_path,
        start_ms,
        end_ms,
        duration_ms: end_ms - start_ms,
        frame_rate,
        width,
        quality,
        output_size,
    })
}

#[derive(serde::Serialize)]
struct ExtractResult {
    success: bool,
    output_path: String,
    error: Option<String>,
}

fn emit_audio_extract_progress(app_handle: &Option<tauri::AppHandle>, status: &str, progress: f64) {
    use tauri::Emitter;

    if let Some(app_handle) = app_handle {
        let _ = app_handle.emit(
            "audio-extract-progress",
            serde_json::json!({
                "status": status,
                "progress": progress.clamp(0.0, 1.0),
            }),
        );
    }
}

#[tauri::command]
async fn extract_audio(
    app_handle: tauri::AppHandle,
    input_path: String,
    output_dir: String,
    target_format: String,
    track_index: Option<usize>,
) -> Result<ExtractResult, String> {
    extract_audio_inner(
        Some(app_handle),
        input_path,
        output_dir,
        target_format,
        track_index,
    )
    .await
}

async fn extract_audio_inner(
    app_handle: Option<tauri::AppHandle>,
    input_path: String,
    output_dir: String,
    target_format: String,
    track_index: Option<usize>,
) -> Result<ExtractResult, String> {
    let _conversion_guard = begin_conversion()?;
    let input = validate_audio_extract_input(&input_path)?;
    let target_format = normalize_audio_extract_format(&target_format)?;
    if track_index.is_some_and(|index| index > AUDIO_EXTRACT_MAX_TRACK_INDEX) {
        return Err("audio-extract:invalid-track".to_string());
    }
    let ffmpeg_path = get_ffmpeg_path()?;
    let output_dir_path = validate_audio_extract_output_dir(&output_dir)?;
    emit_audio_extract_progress(&app_handle, "probe", 0.0);
    let duration = probe_video_convert_duration(&ffmpeg_path, &input)
        .await
        .unwrap_or(0.0);
    if CANCEL_FLAG.load(Ordering::SeqCst) {
        emit_audio_extract_progress(&app_handle, "cancelled", 1.0);
        return Err("audio-extract:cancelled".to_string());
    }
    emit_audio_extract_progress(&app_handle, "prepare", 0.05);

    let (encoder, extra_args, ext) = get_encoder_params(target_format, "medium");
    let temporary_path = create_audio_extract_temp_path(&output_dir_path, ext)?;

    let mut cmd = tokio::process::Command::new(&ffmpeg_path);
    cmd.arg("-y")
        .arg("-i")
        .arg(&input)
        .arg("-vn")
        .arg("-map")
        .arg(format!("0:a:{}", track_index.unwrap_or(0)));

    cmd.arg("-c:a")
        .arg(&encoder)
        .args(&extra_args)
        .arg("-progress")
        .arg("pipe:1")
        .arg("-nostats")
        .arg(&temporary_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(_) => {
            emit_audio_extract_progress(&app_handle, "failed", 1.0);
            return Err("audio-extract:failed".to_string());
        }
    };
    if let Some(id) = child.id() {
        CURRENT_CHILD_ID.store(id, Ordering::SeqCst);
    }
    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = child.kill().await;
            CURRENT_CHILD_ID.store(0, Ordering::SeqCst);
            let _ = std::fs::remove_file(&temporary_path);
            emit_audio_extract_progress(&app_handle, "failed", 1.0);
            return Err("audio-extract:failed".to_string());
        }
    };
    let stderr = match child.stderr.take() {
        Some(stderr) => stderr,
        None => {
            let _ = child.kill().await;
            CURRENT_CHILD_ID.store(0, Ordering::SeqCst);
            let _ = std::fs::remove_file(&temporary_path);
            emit_audio_extract_progress(&app_handle, "failed", 1.0);
            return Err("audio-extract:failed".to_string());
        }
    };
    let progress_app = app_handle.clone();
    let progress_task = tokio::spawn(async move {
        use tauri::Emitter;
        use tokio::io::{AsyncBufReadExt, BufReader};

        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let Some(seconds) = parse_ffmpeg_progress_seconds(&line) else {
                continue;
            };
            let progress = if duration > 0.0 {
                0.05 + (seconds / duration).clamp(0.0, 0.9)
            } else {
                0.05
            };
            if let Some(app_handle) = &progress_app {
                let _ = app_handle.emit(
                    "audio-extract-progress",
                    serde_json::json!({ "status": "extract", "progress": progress }),
                );
            }
        }
    });
    let stderr_task = tokio::spawn(async move {
        use tokio::io::{AsyncReadExt, BufReader};

        let mut bytes = Vec::new();
        let mut reader = BufReader::new(stderr);
        let _ = reader.read_to_end(&mut bytes).await;
        String::from_utf8_lossy(&bytes).into_owned()
    });
    let status = match child.wait().await {
        Ok(status) => status,
        Err(_) => {
            CURRENT_CHILD_ID.store(0, Ordering::SeqCst);
            let _ = progress_task.await;
            let _ = stderr_task.await;
            let _ = std::fs::remove_file(&temporary_path);
            emit_audio_extract_progress(&app_handle, "failed", 1.0);
            return Err("audio-extract:failed".to_string());
        }
    };
    CURRENT_CHILD_ID.store(0, Ordering::SeqCst);
    let _ = progress_task.await;
    let stderr = stderr_task.await.unwrap_or_default();

    if CANCEL_FLAG.load(Ordering::SeqCst) {
        let _ = std::fs::remove_file(&temporary_path);
        emit_audio_extract_progress(&app_handle, "cancelled", 1.0);
        return Err("audio-extract:cancelled".to_string());
    }

    if status.success() {
        if std::fs::metadata(&temporary_path)
            .map(|metadata| metadata.len() == 0)
            .unwrap_or(true)
        {
            let _ = std::fs::remove_file(&temporary_path);
            emit_audio_extract_progress(&app_handle, "failed", 1.0);
            return Err("audio-extract:failed".to_string());
        }
        emit_audio_extract_progress(&app_handle, "publish", 0.97);
        let output_path = match publish_audio_extract_output(
            &temporary_path,
            &output_dir_path,
            &audio_extract_file_stem(&input),
            ext,
        ) {
            Ok(path) => path,
            Err(error) => {
                let _ = std::fs::remove_file(&temporary_path);
                emit_audio_extract_progress(&app_handle, "failed", 1.0);
                return Err(error);
            }
        };
        emit_audio_extract_progress(&app_handle, "done", 1.0);
        Ok(ExtractResult {
            success: true,
            output_path,
            error: None,
        })
    } else {
        let _ = std::fs::remove_file(&temporary_path);
        emit_audio_extract_progress(&app_handle, "failed", 1.0);
        let stderr = stderr.to_ascii_lowercase();
        if stderr.contains("matches no streams") || stderr.contains("does not contain any stream") {
            Err("audio-extract:no-audio-track".to_string())
        } else {
            Err("audio-extract:failed".to_string())
        }
    }
}

#[cfg(test)]
mod audio_extract_backend_tests {
    use super::*;

    fn test_directory() -> std::path::PathBuf {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock must be after epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("toolknit-audio-extract-{}", suffix));
        std::fs::create_dir_all(&directory).expect("create test directory");
        directory
    }

    #[tokio::test]
    async fn audio_extract_rejects_symlinks_and_publishes_unique_outputs() {
        let _conversion_lock = test_conversion_lock();
        let directory = test_directory();
        let video = directory.join("sample.mp4");
        let ffmpeg = get_ffmpeg_path().expect("bundled FFmpeg must be available");
        let status = tokio::process::Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=c=black:s=32x32:d=1",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=48000:duration=1",
                "-shortest",
                "-c:v",
                "mpeg4",
                "-c:a",
                "aac",
            ])
            .arg(&video)
            .status()
            .await
            .expect("start video fixture generation");
        assert!(status.success(), "generate a video with audio");

        let output_directory = directory.to_string_lossy().into_owned();
        let first = extract_audio_inner(
            None,
            video.to_string_lossy().into_owned(),
            output_directory.clone(),
            "MP3".to_string(),
            Some(0),
        )
        .await
        .expect("first extraction must succeed");
        assert!(first.success);
        assert!(
            std::fs::metadata(&first.output_path)
                .expect("inspect output")
                .len()
                > 0
        );

        let second = extract_audio_inner(
            None,
            video.to_string_lossy().into_owned(),
            output_directory,
            "MP3".to_string(),
            Some(0),
        )
        .await
        .expect("second extraction must succeed");
        assert!(second.success);
        assert_ne!(first.output_path, second.output_path);
        assert!(second.output_path.ends_with("sample_audio_1.mp3"));

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let symlink_path = directory.join("linked.mp4");
            symlink(&video, &symlink_path).expect("create symbolic link");
            assert_eq!(
                validate_audio_extract_input(&symlink_path.to_string_lossy())
                    .expect_err("symbolic link must be rejected"),
                "audio-extract:invalid-input",
            );
        }
        std::fs::remove_dir_all(&directory).expect("remove test directory");
    }
}

fn is_path_safe(path: &std::path::Path) -> Result<(), String> {
    // Try to canonicalize the path. If it doesn't exist (e.g. a new output file
    // or a not-yet-created subdirectory), walk up ancestors until one exists.
    let canonical = path
        .canonicalize()
        .or_else(|_| {
            let mut ancestor = path.parent();
            while let Some(a) = ancestor {
                if let Ok(c) = a.canonicalize() {
                    return Ok(c);
                }
                ancestor = a.parent();
            }
            Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "No existing ancestor",
            ))
        })
        .map_err(|e| format!("Invalid path: {}", e))?;
    let docs = dirs::document_dir().ok_or("Cannot find Documents folder")?;
    let dl = dirs::download_dir().ok_or("Cannot find Download folder")?;
    let appdata = dirs::data_dir().ok_or("Cannot find AppData folder")?;
    let temp = std::env::temp_dir();
    // Canonicalize all comparison dirs so prefixes match (Windows \\?\ prefix)
    let docs_c = docs.canonicalize().unwrap_or(docs.clone());
    let dl_c = dl.canonicalize().unwrap_or(dl.clone());
    let appdata_c = appdata.canonicalize().unwrap_or(appdata.clone());
    let temp_c = temp.canonicalize().unwrap_or(temp.clone());
    // Also allow the exe's parent directory (install directory) for output files
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(|p| p.to_path_buf()))
        .and_then(|p| p.canonicalize().ok().or(Some(p)));
    // Also allow the install_path from install_config.json (may differ from exe_dir if exe is in a subdirectory)
    let install_dir = {
        let exe = std::env::current_exe().ok();
        exe.and_then(|e| {
            e.parent().and_then(|p| {
                let mut search = p.to_path_buf();
                for _ in 0..4 {
                    let candidate = search.join("install_config.json");
                    if candidate.exists() {
                        if let Ok(content) = std::fs::read_to_string(&candidate) {
                            if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content)
                            {
                                if let Some(ip) = config.get("installPath").and_then(|v| v.as_str())
                                {
                                    let p = std::path::PathBuf::from(ip);
                                    return p.canonicalize().ok().or(Some(p));
                                }
                            }
                        }
                    }
                    match search.parent() {
                        Some(p2) => search = p2.to_path_buf(),
                        None => break,
                    }
                }
                None
            })
        })
    };
    let output_root = configured_output_root();
    let is_allowed = canonical.starts_with(&docs_c)
        || canonical.starts_with(&dl_c)
        || canonical.starts_with(&appdata_c)
        || canonical.starts_with(&temp_c)
        || exe_dir.as_ref().map_or(false, |d| canonical.starts_with(d))
        || install_dir
            .as_ref()
            .map_or(false, |d| canonical.starts_with(d))
        || output_root
            .as_ref()
            .map_or(false, |d| canonical.starts_with(d));
    if is_allowed {
        Ok(())
    } else {
        Err("Path outside allowed directories".to_string())
    }
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    // Reject files larger than 500MB to prevent OOM
    const MAX_FILE_SIZE: u64 = 500 * 1024 * 1024;
    if path.contains('\0') {
        return Err("Invalid path".to_string());
    }
    let metadata =
        std::fs::metadata(&path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!(
            "File too large ({}MB, max 500MB)",
            metadata.len() / 1024 / 1024
        ));
    }
    std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
fn read_file_bytes_limited(path: String, max_bytes: u64) -> Result<Vec<u8>, String> {
    use std::io::Read;

    const ABSOLUTE_MAX_FILE_SIZE: u64 = 500 * 1024 * 1024;
    if path.contains('\0') || max_bytes == 0 || max_bytes > ABSOLUTE_MAX_FILE_SIZE {
        return Err("Invalid file read request".to_string());
    }

    let metadata =
        std::fs::metadata(&path).map_err(|e| format!("Failed to read file metadata: {}", e))?;
    if !metadata.is_file() {
        return Err("Input path must be a file".to_string());
    }
    if metadata.len() > max_bytes {
        return Err(format!(
            "File too large ({}MB)",
            metadata.len() / 1024 / 1024
        ));
    }

    // Read one byte past the limit so a concurrent file replacement cannot bypass the size check.
    let file = std::fs::File::open(&path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut reader = file.take(max_bytes + 1);
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    reader
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    if bytes.len() as u64 > max_bytes {
        return Err(format!(
            "File too large (max {}MB)",
            max_bytes / 1024 / 1024
        ));
    }
    Ok(bytes)
}

#[derive(serde::Serialize)]
struct PreparedIconSourceImage {
    bytes: Vec<u8>,
    width: u32,
    height: u32,
    source_bytes: u64,
}

#[tauri::command]
fn prepare_icon_source_image(path: String) -> Result<PreparedIconSourceImage, String> {
    use image::ImageEncoder;

    const MAX_INPUT_BYTES: u64 = 20 * 1024 * 1024;
    const MAX_INPUT_PIXELS: u64 = 20_000_000;
    if path.contains('\0') {
        return Err("Invalid image path".to_string());
    }
    let source = std::path::PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("Cannot access image file: {}", error))?;
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp") {
        return Err("Only PNG, JPEG, and WebP images can be used for icon generation.".to_string());
    }
    let metadata = std::fs::metadata(&source)
        .map_err(|error| format!("Cannot read image file metadata: {}", error))?;
    if !metadata.is_file() {
        return Err("Input path must be an image file".to_string());
    }
    if metadata.len() == 0 || metadata.len() > MAX_INPUT_BYTES {
        return Err(
            "The image file is empty or exceeds the supported file size limit.".to_string(),
        );
    }

    let image = image::ImageReader::open(&source)
        .map_err(|error| format!("Cannot open image file: {}", error))?
        .with_guessed_format()
        .map_err(|error| format!("Cannot detect image format: {}", error))?
        .decode()
        .map_err(|error| format!("Cannot decode image file: {}", error))?;
    let width = image.width();
    let height = image.height();
    let pixels = u64::from(width).saturating_mul(u64::from(height));
    if width == 0 || height == 0 || pixels > MAX_INPUT_PIXELS {
        return Err("Image dimensions exceed the supported pixel limit.".to_string());
    }

    let rgba = image.to_rgba8();
    let mut bytes = Vec::new();
    image::codecs::png::PngEncoder::new(&mut bytes)
        .write_image(&rgba, width, height, image::ColorType::Rgba8.into())
        .map_err(|error| format!("Cannot prepare image for icon generation: {}", error))?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_INPUT_BYTES {
        return Err("Prepared image exceeds the supported file size limit.".to_string());
    }

    Ok(PreparedIconSourceImage {
        bytes,
        width,
        height,
        source_bytes: metadata.len(),
    })
}

#[tauri::command]
fn write_file_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    use std::fs;
    use std::path::Path;
    let path = Path::new(&path);
    is_path_safe(path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    fs::write(path, bytes).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
fn write_unique_file_bytes(
    directory: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::path::Path;

    if directory.contains('\0') || file_name.contains('\0') {
        return Err("Invalid path".to_string());
    }
    let directory = Path::new(&directory);
    let file_path = Path::new(&file_name);
    if file_path.is_absolute() || file_path.components().count() != 1 {
        return Err("Output file name must not contain a path".to_string());
    }
    is_path_safe(directory)?;
    fs::create_dir_all(directory).map_err(|e| format!("Failed to create directory: {}", e))?;

    let stem = file_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or("Invalid output file name")?;
    let extension = file_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");

    for counter in 0..10_000_u32 {
        let candidate = if counter == 0 {
            file_name.clone()
        } else if extension.is_empty() {
            format!("{}_{}", stem, counter)
        } else {
            format!("{}_{}.{}", stem, counter, extension)
        };
        let output_path = directory.join(candidate);
        let mut output = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output_path)
        {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Failed to create output file: {}", error)),
        };

        if let Err(error) = output.write_all(&bytes).and_then(|_| output.sync_all()) {
            drop(output);
            let _ = fs::remove_file(&output_path);
            return Err(format!("Failed to write output file: {}", error));
        }
        return Ok(output_path.to_string_lossy().into_owned());
    }

    Err("Unable to reserve a unique output file name".to_string())
}

#[derive(serde::Serialize)]
struct PairedFileWriteResult {
    first_path: String,
    second_path: String,
}

#[tauri::command]
fn write_unique_file_pair(
    directory: String,
    first_file_name: String,
    first_bytes: Vec<u8>,
    second_file_name: String,
    second_bytes: Vec<u8>,
) -> Result<PairedFileWriteResult, String> {
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::path::Path;

    const MAX_BYTES_PER_FILE: usize = 10 * 1024 * 1024;
    if directory.contains('\0')
        || first_file_name.contains('\0')
        || second_file_name.contains('\0')
        || first_bytes.len() > MAX_BYTES_PER_FILE
        || second_bytes.len() > MAX_BYTES_PER_FILE
    {
        return Err("Invalid paired output request".to_string());
    }
    let directory = Path::new(&directory);
    let first_path = Path::new(&first_file_name);
    let second_path = Path::new(&second_file_name);
    if first_file_name == second_file_name
        || first_path.is_absolute()
        || second_path.is_absolute()
        || first_path.components().count() != 1
        || second_path.components().count() != 1
    {
        return Err("Output file names must be distinct base names without paths".to_string());
    }
    is_path_safe(directory)?;
    fs::create_dir_all(directory)
        .map_err(|error| format!("Failed to create directory: {}", error))?;

    let first_stem = first_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or("Invalid first output name")?;
    let first_extension = first_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let second_stem = second_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or("Invalid second output name")?;
    let second_extension = second_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");

    for counter in 0..10_000_u32 {
        let suffix = if counter == 0 {
            String::new()
        } else {
            format!("_{}", counter)
        };
        let first_name = if first_extension.is_empty() {
            format!("{}{}", first_stem, suffix)
        } else {
            format!("{}{}.{}", first_stem, suffix, first_extension)
        };
        let second_name = if second_extension.is_empty() {
            format!("{}{}", second_stem, suffix)
        } else {
            format!("{}{}.{}", second_stem, suffix, second_extension)
        };
        let first_output = directory.join(first_name);
        let second_output = directory.join(second_name);
        let mut first = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&first_output)
        {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "Failed to create refined subtitle output: {}",
                    error
                ))
            }
        };
        if let Err(error) = first.write_all(&first_bytes).and_then(|_| first.sync_all()) {
            drop(first);
            let _ = fs::remove_file(&first_output);
            return Err(format!(
                "Failed to write refined subtitle output: {}",
                error
            ));
        }
        drop(first);
        let mut second = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&second_output)
        {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                let _ = fs::remove_file(&first_output);
                continue;
            }
            Err(error) => {
                let _ = fs::remove_file(&first_output);
                return Err(format!("Failed to create refined text output: {}", error));
            }
        };
        if let Err(error) = second
            .write_all(&second_bytes)
            .and_then(|_| second.sync_all())
        {
            drop(second);
            let _ = fs::remove_file(&first_output);
            let _ = fs::remove_file(&second_output);
            return Err(format!("Failed to write refined text output: {}", error));
        }
        return Ok(PairedFileWriteResult {
            first_path: first_output.to_string_lossy().into_owned(),
            second_path: second_output.to_string_lossy().into_owned(),
        });
    }
    Err("Unable to reserve paired output file names".to_string())
}

#[cfg(test)]
mod paired_file_write_tests {
    use super::*;

    fn test_directory() -> std::path::PathBuf {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock must be after epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("toolknit-paired-output-{}", suffix));
        std::fs::create_dir_all(&directory).expect("create test directory");
        directory
    }

    #[test]
    fn paired_write_uses_one_shared_unique_suffix_without_overwriting() {
        let directory = test_directory();
        let directory_string = directory.to_string_lossy().into_owned();

        let first = write_unique_file_pair(
            directory_string.clone(),
            "meeting_refined.srt".to_string(),
            b"first srt".to_vec(),
            "meeting_refined.txt".to_string(),
            b"first txt".to_vec(),
        )
        .expect("first pair should be written");
        let second = write_unique_file_pair(
            directory_string,
            "meeting_refined.srt".to_string(),
            b"second srt".to_vec(),
            "meeting_refined.txt".to_string(),
            b"second txt".to_vec(),
        )
        .expect("second pair should be uniquely written");

        assert!(first.first_path.ends_with("meeting_refined.srt"));
        assert!(first.second_path.ends_with("meeting_refined.txt"));
        assert!(second.first_path.ends_with("meeting_refined_1.srt"));
        assert!(second.second_path.ends_with("meeting_refined_1.txt"));
        assert_eq!(
            std::fs::read_to_string(&first.first_path).expect("read first SRT"),
            "first srt"
        );
        assert_eq!(
            std::fs::read_to_string(&second.second_path).expect("read second TXT"),
            "second txt"
        );

        std::fs::remove_dir_all(&directory).expect("remove test directory");
    }

    #[test]
    fn paired_write_rejects_paths_and_duplicate_file_names() {
        let directory = test_directory();
        let result = write_unique_file_pair(
            directory.to_string_lossy().into_owned(),
            "../unsafe.srt".to_string(),
            vec![],
            "unsafe.txt".to_string(),
            vec![],
        );
        assert!(result.is_err());

        let duplicate = write_unique_file_pair(
            directory.to_string_lossy().into_owned(),
            "same.txt".to_string(),
            vec![],
            "same.txt".to_string(),
            vec![],
        );
        assert!(duplicate.is_err());
        std::fs::remove_dir_all(&directory).expect("remove test directory");
    }
}

fn validate_icon_archive_file_name(file_name: &str) -> Result<(String, String), String> {
    if file_name.contains('\0') {
        return Err("Invalid icon archive file name".to_string());
    }
    let path = std::path::Path::new(file_name);
    if path.is_absolute() || path.components().count() != 1 {
        return Err("Icon archive file name must not contain a path".to_string());
    }
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or("Invalid icon archive file name")?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .ok_or("Icon archive file must use .zip")?;
    if stem.is_empty() || !extension.eq_ignore_ascii_case("zip") {
        return Err("Icon archive file must use .zip".to_string());
    }
    Ok((stem.to_string(), extension.to_string()))
}

fn unique_icon_archive_path(
    directory: &std::path::Path,
    file_name: &str,
    counter: u32,
) -> Result<std::path::PathBuf, String> {
    let (stem, extension) = validate_icon_archive_file_name(file_name)?;
    let candidate = if counter == 0 {
        format!("{}.{}", stem, extension)
    } else {
        format!("{}_{}.{}", stem, counter, extension)
    };
    Ok(directory.join(candidate))
}

#[tauri::command]
fn begin_icon_archive_write(directory: String, file_name: String) -> Result<u64, String> {
    if directory.contains('\0') {
        return Err("Invalid icon archive output directory".to_string());
    }
    validate_icon_archive_file_name(&file_name)?;
    let output_directory = std::path::PathBuf::from(directory);
    is_path_safe(&output_directory)?;
    std::fs::create_dir_all(&output_directory)
        .map_err(|error| format!("Failed to create icon output directory: {}", error))?;
    if !output_directory.is_dir() {
        return Err("Icon archive output path is not a directory".to_string());
    }
    let output_directory = output_directory
        .canonicalize()
        .map_err(|error| format!("Invalid icon output directory: {}", error))?;
    is_path_safe(&output_directory)?;

    for _ in 0..10_000 {
        let session_id = ICON_ARCHIVE_WRITE_ID.fetch_add(1, Ordering::SeqCst);
        let temporary_path = output_directory.join(format!(
            ".toolknit-icon-{}-{}.part",
            std::process::id(),
            session_id
        ));
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary_path)
        {
            Ok(_) => {
                let write = IconArchiveWrite {
                    temporary_path,
                    output_directory,
                    file_name,
                };
                icon_archive_writes()
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .insert(session_id, write);
                return Ok(session_id);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Failed to create icon archive: {}", error)),
        }
    }
    Err("Unable to reserve icon archive output".to_string())
}

#[tauri::command]
fn append_icon_archive_chunk(session_id: u64, bytes: Vec<u8>) -> Result<(), String> {
    use std::io::Write;

    if bytes.is_empty() {
        return Err("Icon archive chunk is empty".to_string());
    }
    let temporary_path = icon_archive_writes()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(&session_id)
        .map(|write| write.temporary_path.clone())
        .ok_or("Icon archive write session is unavailable")?;
    let current_size = std::fs::metadata(&temporary_path)
        .map_err(|error| format!("Cannot inspect icon archive: {}", error))?
        .len();
    let next_size = current_size
        .checked_add(bytes.len() as u64)
        .ok_or("Icon archive is too large")?;
    if next_size > MAX_ICON_ARCHIVE_BYTES {
        return Err("Icon archive exceeds the 32 MB limit".to_string());
    }
    let mut output = std::fs::OpenOptions::new()
        .append(true)
        .open(&temporary_path)
        .map_err(|error| format!("Cannot append icon archive: {}", error))?;
    output
        .write_all(&bytes)
        .map_err(|error| format!("Cannot write icon archive: {}", error))
}

#[tauri::command]
fn finalize_icon_archive_write(session_id: u64) -> Result<String, String> {
    let write = icon_archive_writes()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(&session_id)
        .ok_or("Icon archive write session is unavailable")?;
    let result = (|| {
        let size = std::fs::metadata(&write.temporary_path)
            .map_err(|error| format!("Cannot inspect icon archive: {}", error))?
            .len();
        if size == 0 || size > MAX_ICON_ARCHIVE_BYTES {
            return Err("Icon archive has an invalid size".to_string());
        }
        for counter in 0..10_000_u32 {
            let output_path =
                unique_icon_archive_path(&write.output_directory, &write.file_name, counter)?;
            match std::fs::hard_link(&write.temporary_path, &output_path) {
                Ok(()) => return Ok(cleanup_display_path(&output_path)),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(format!("Cannot publish icon archive: {}", error)),
            }
        }
        Err("Unable to reserve a unique icon archive name".to_string())
    })();
    let _ = std::fs::remove_file(&write.temporary_path);
    result
}

#[tauri::command]
fn discard_icon_archive_write(session_id: u64) -> Result<(), String> {
    let write = icon_archive_writes()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(&session_id)
        .ok_or("Icon archive write session is unavailable")?;
    std::fs::remove_file(&write.temporary_path)
        .map_err(|error| format!("Cannot discard icon archive: {}", error))
}

#[tauri::command]
fn write_file_chunk(path: String, offset: u64, bytes: Vec<u8>) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::{Seek, SeekFrom, Write};
    is_path_safe(std::path::Path::new(&path))?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(offset == 0)
        .open(&path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    if offset > 0 {
        file.seek(SeekFrom::Start(offset))
            .map_err(|e| format!("Failed to seek: {}", e))?;
    }
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write: {}", e))
}

#[tauri::command]
fn exists_path(path: String) -> Result<bool, String> {
    if path.contains('\0') {
        return Err("Invalid path".to_string());
    }
    Ok(std::path::Path::new(&path).exists())
}

#[tauri::command]
fn get_file_size(path: String) -> Result<u64, String> {
    if path.contains('\0') {
        return Err("Invalid path".to_string());
    }
    std::fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| format!("Failed to read file metadata: {}", e))
}

#[cfg(target_os = "windows")]
fn run_windows_powershell_json(script: &str, context: &str) -> Result<serde_json::Value, String> {
    use std::os::windows::process::CommandExt;

    // Windows PowerShell 5.1 can still write redirected stdout using the active
    // ANSI/OEM code page on some machines even after OutputEncoding is set.
    // Capture the script's JSON inside PowerShell, then write explicit UTF-8
    // bytes to stdout so localized device names never become mojibake.
    let wrapped_script = format!(
        r#"
$ErrorActionPreference = 'SilentlyContinue'
try {{
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $OutputEncoding = [Console]::OutputEncoding
}} catch {{}}
$__toolknit_payload = & {{
{script}
}}
if ($null -eq $__toolknit_payload) {{ $__toolknit_payload = '' }}
$__toolknit_text = ($__toolknit_payload | Out-String).Trim()
$__toolknit_bytes = [System.Text.UTF8Encoding]::new($false).GetBytes([string]$__toolknit_text)
$__toolknit_stdout = [Console]::OpenStandardOutput()
$__toolknit_stdout.Write($__toolknit_bytes, 0, $__toolknit_bytes.Length)
"#
    );

    let output = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &wrapped_script,
        ])
        .creation_flags(0x08000000)
        .output()
        .map_err(|error| format!("Cannot start {}: {}", context, error))?;
    if !output.status.success() {
        let details = String::from_utf8_lossy(&output.stderr)
            .trim()
            .replace(['\r', '\n'], " ");
        return Err(if details.is_empty() {
            format!("{} failed", context)
        } else {
            format!(
                "{} failed: {}",
                context,
                details.chars().take(240).collect::<String>()
            )
        });
    }
    let payload = String::from_utf8(output.stdout)
        .unwrap_or_else(|error| String::from_utf8_lossy(&error.into_bytes()).into_owned())
        .trim()
        .to_string();
    if payload.is_empty() {
        return Err(format!("{} returned no data", context));
    }
    serde_json::from_str(&payload)
        .map_err(|error| format!("{} returned invalid data: {}", context, error))
}

#[tauri::command]
async fn get_hardware_overview() -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(collect_hardware_overview)
        .await
        .map_err(|error| format!("Hardware inspection worker failed: {}", error))?
}

#[cfg(target_os = "windows")]
fn collect_hardware_overview() -> Result<serde_json::Value, String> {
    // A single read-only PowerShell/CIM request avoids a chain of WMI calls on
    // the UI thread. The payload deliberately excludes serial numbers, UUIDs,
    // account names, MAC addresses, and any other machine-identifying values.
    const SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
# Windows PowerShell 5.1 otherwise writes non-ASCII JSON using the active
# console code page. The Rust process correctly expects UTF-8 JSON.
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
function Epoch($value) {
  if ($null -eq $value) { return $null }
  try { return ([DateTimeOffset]$value).ToUnixTimeMilliseconds() } catch { return $null }
}
function DeviceType($value) {
  switch ([int]$value) {
    1 { 'desktop' }
    2 { 'laptop' }
    3 { 'workstation' }
    4 { 'server' }
    default { 'other' }
  }
}
$computer = Get-CimInstance Win32_ComputerSystem
$system = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$board = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS | Select-Object -First 1
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object {
  [ordered]@{ name = [string]$_.Name; driver_version = [string]$_.DriverVersion }
})
$disks = @(Get-CimInstance Win32_DiskDrive | ForEach-Object {
  [ordered]@{ model = [string]$_.Model; size_bytes = [Int64]$_.Size }
})
$volumes = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType = 3' | ForEach-Object {
  [ordered]@{ id = [string]$_.DeviceID; size_bytes = [Int64]$_.Size; free_bytes = [Int64]$_.FreeSpace }
})
$secureBoot = 'unavailable'
try { if (Confirm-SecureBootUEFI) { $secureBoot = 'enabled' } else { $secureBoot = 'disabled' } } catch {}
$bootMode = if (Test-Path 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State') { 'uefi' } else { 'legacy_or_unavailable' }
$tpm = Get-Tpm
$batteries = @(Get-CimInstance Win32_Battery)
[ordered]@{
  device = [ordered]@{
    manufacturer = [string]$computer.Manufacturer
    model = [string]$computer.Model
    device_type = DeviceType $computer.PCSystemType
  }
  system = [ordered]@{
    caption = [string]$system.Caption
    version = [string]$system.Version
    build = [string]$system.BuildNumber
    architecture = [string]$system.OSArchitecture
    install_at = Epoch $system.InstallDate
    boot_at = Epoch $system.LastBootUpTime
  }
  core = [ordered]@{
    cpu_name = [string]$cpu.Name
    cpu_cores = [int]$cpu.NumberOfCores
    cpu_threads = [int]$cpu.NumberOfLogicalProcessors
    memory_total_bytes = [Int64]$computer.TotalPhysicalMemory
    memory_available_bytes = [Int64]$system.FreePhysicalMemory * 1024
    gpus = $gpus
    disks = $disks
    volumes = $volumes
  }
  firmware = [ordered]@{
    mainboard = @([string]$board.Manufacturer, [string]$board.Product | Where-Object { $_ } ) -join ' '
    bios_version = [string]$bios.SMBIOSBIOSVersion
    bios_release_at = Epoch $bios.ReleaseDate
    boot_mode = $bootMode
    secure_boot = $secureBoot
    tpm_present = [bool]$tpm.TpmPresent
    tpm_ready = [bool]$tpm.TpmReady
    virtualization_enabled = [bool]$cpu.VirtualizationFirmwareEnabled
  }
  battery = [ordered]@{
    status = if ($batteries.Count -gt 0) { 'present' } else { 'not_detected' }
  }
} | ConvertTo-Json -Depth 6 -Compress
"#;

    run_windows_powershell_json(SCRIPT, "Windows hardware inspection")
}

#[cfg(not(target_os = "windows"))]
fn collect_hardware_overview() -> Result<serde_json::Value, String> {
    Err("Hardware inspection is currently available on Windows only".to_string())
}

#[tauri::command]
async fn get_cpu_memory_info() -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(collect_cpu_memory_info)
        .await
        .map_err(|error| format!("CPU and memory inspection worker failed: {}", error))?
}

#[tauri::command]
async fn get_cpu_memory_live_stats() -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(collect_cpu_memory_live_stats)
        .await
        .map_err(|error| format!("CPU and memory live stats worker failed: {}", error))?
}

#[cfg(target_os = "windows")]
fn collect_cpu_memory_info() -> Result<serde_json::Value, String> {
    // Keep identifiers private: memory serial numbers and physical addresses
    // are intentionally not read or included in this local-only payload.
    const SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$system = Get-CimInstance Win32_OperatingSystem
$memoryArray = Get-CimInstance Win32_PhysicalMemoryArray | Select-Object -First 1
$memoryModules = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
  [ordered]@{
    slot = [string]$_.DeviceLocator
    bank = [string]$_.BankLabel
    manufacturer = [string]$_.Manufacturer
    part_number = [string]$_.PartNumber
    capacity_bytes = [Int64]$_.Capacity
    speed_mhz = [int]$_.Speed
    configured_clock_mhz = [int]$_.ConfiguredClockSpeed
    smbios_memory_type = [int]$_.SMBIOSMemoryType
  }
})
$perfCpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object { $_.Name -eq '_Total' } | Select-Object -First 1
$perfMemory = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory | Select-Object -First 1
$cpuUsage = if ($null -ne $perfCpu -and $null -ne $perfCpu.PercentProcessorTime) { [int]$perfCpu.PercentProcessorTime } else { [int]$cpu.LoadPercentage }
$availableBytes = if ($null -ne $perfMemory -and $null -ne $perfMemory.AvailableBytes) { [Int64]$perfMemory.AvailableBytes } else { [Int64]$system.FreePhysicalMemory * 1024 }
[ordered]@{
  cpu = [ordered]@{
    name = [string]$cpu.Name
    manufacturer = [string]$cpu.Manufacturer
    socket = [string]$cpu.SocketDesignation
    address_width = [int]$cpu.AddressWidth
    cores = [int]$cpu.NumberOfCores
    threads = [int]$cpu.NumberOfLogicalProcessors
    max_clock_mhz = [int]$cpu.MaxClockSpeed
    current_clock_mhz = [int]$cpu.CurrentClockSpeed
    l2_cache_kb = [int]$cpu.L2CacheSize
    l3_cache_kb = [int]$cpu.L3CacheSize
    virtualization_firmware_enabled = [bool]$cpu.VirtualizationFirmwareEnabled
    vm_monitor_extensions = [bool]$cpu.VMMonitorModeExtensions
    slat_extensions = [bool]$cpu.SecondLevelAddressTranslationExtensions
  }
  memory = [ordered]@{
    total_bytes = [Int64]$system.TotalVisibleMemorySize * 1024
    available_bytes = $availableBytes
    slots_reported = [int]$memoryArray.MemoryDevices
    error_correction_code = [int]$memoryArray.MemoryErrorCorrection
    modules = $memoryModules
  }
  current = [ordered]@{
    cpu_usage_percent = $cpuUsage
    memory_available_bytes = $availableBytes
    committed_bytes = if ($null -ne $perfMemory) { [Int64]$perfMemory.CommittedBytes } else { 0 }
    commit_limit_bytes = if ($null -ne $perfMemory) { [Int64]$perfMemory.CommitLimit } else { 0 }
  }
} | ConvertTo-Json -Depth 6 -Compress
"#;

    run_windows_powershell_json(SCRIPT, "CPU and memory inspection")
}

#[cfg(target_os = "windows")]
fn collect_cpu_memory_live_stats() -> Result<serde_json::Value, String> {
    const SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$system = Get-CimInstance Win32_OperatingSystem
$perfCpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object { $_.Name -eq '_Total' } | Select-Object -First 1
$perfMemory = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory | Select-Object -First 1
[ordered]@{
  cpu_usage_percent = if ($null -ne $perfCpu -and $null -ne $perfCpu.PercentProcessorTime) { [int]$perfCpu.PercentProcessorTime } else { [int]$cpu.LoadPercentage }
  memory_available_bytes = if ($null -ne $perfMemory -and $null -ne $perfMemory.AvailableBytes) { [Int64]$perfMemory.AvailableBytes } else { [Int64]$system.FreePhysicalMemory * 1024 }
  committed_bytes = if ($null -ne $perfMemory) { [Int64]$perfMemory.CommittedBytes } else { 0 }
  commit_limit_bytes = if ($null -ne $perfMemory) { [Int64]$perfMemory.CommitLimit } else { 0 }
} | ConvertTo-Json -Compress
"#;

    run_windows_powershell_json(SCRIPT, "CPU and memory live stats")
}

#[cfg(not(target_os = "windows"))]
fn collect_cpu_memory_info() -> Result<serde_json::Value, String> {
    Err("CPU and memory inspection is currently available on Windows only".to_string())
}

#[cfg(not(target_os = "windows"))]
fn collect_cpu_memory_live_stats() -> Result<serde_json::Value, String> {
    Err("CPU and memory inspection is currently available on Windows only".to_string())
}

#[derive(serde::Serialize)]
struct DxgiAdapterInfo {
    description: String,
    vendor_id: u32,
    device_id: u32,
    dedicated_video_memory: u64,
    shared_system_memory: u64,
    flags: u32,
}

#[derive(serde::Serialize)]
struct ActiveDisplayConfiguration {
    adapter_name: String,
    device_name: String,
    monitor_key: String,
    width: u32,
    height: u32,
    refresh_hz: u32,
}

#[tauri::command]
async fn get_gpu_display_info() -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(collect_gpu_display_info)
        .await
        .map_err(|error| format!("GPU and display inspection worker failed: {}", error))?
}

#[cfg(target_os = "windows")]
fn collect_gpu_display_info() -> Result<serde_json::Value, String> {
    // WMI supplies display EDID and driver metadata. DXGI and GDI below are
    // intentionally used for data WMI cannot represent correctly, especially
    // dedicated memory on modern GPUs and per-display refresh rates.
    const SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
function DecodeWmiText($values) {
  if ($null -eq $values) { return '' }
  return (($values | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) -join '').Trim()
}
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object {
  [ordered]@{
    name = [string]$_.Name
    video_processor = [string]$_.VideoProcessor
    driver_version = [string]$_.DriverVersion
    driver_date = if ($_.DriverDate) { ([DateTime]$_.DriverDate).ToString('yyyy-MM-dd') } else { '' }
  }
})
$basicByInstance = @{}
Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorBasicDisplayParams | Where-Object { $_.Active } | ForEach-Object { $basicByInstance[$_.InstanceName] = $_ }
$connectionByInstance = @{}
Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorConnectionParams | Where-Object { $_.Active } | ForEach-Object { $connectionByInstance[$_.InstanceName] = $_ }
$monitors = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID | Where-Object { $_.Active } | ForEach-Object {
  $basic = $basicByInstance[$_.InstanceName]
  $connection = $connectionByInstance[$_.InstanceName]
  $displayKey = if ([string]$_.InstanceName -match 'DISPLAY\\([^\\]+)') { $Matches[1] } else { '' }
  [ordered]@{
    display_key = $displayKey
    manufacturer = DecodeWmiText $_.ManufacturerName
    model = DecodeWmiText $_.UserFriendlyName
    product_code = DecodeWmiText $_.ProductCodeID
    width_cm = if ($basic) { [int]$basic.MaxHorizontalImageSize } else { 0 }
    height_cm = if ($basic) { [int]$basic.MaxVerticalImageSize } else { 0 }
    connection_code = if ($connection) { [int]$connection.VideoOutputTechnology } else { -1 }
  }
})
[ordered]@{ gpus = $gpus; monitors = $monitors } | ConvertTo-Json -Depth 5 -Compress
"#;

    let mut value = run_windows_powershell_json(SCRIPT, "GPU and display inspection")?;
    let object = value
        .as_object_mut()
        .ok_or("GPU and display inspection returned an invalid payload")?;
    object.insert(
        "dxgi_adapters".to_string(),
        serde_json::to_value(enumerate_dxgi_adapters()).map_err(|error| error.to_string())?,
    );
    object.insert(
        "display_configurations".to_string(),
        serde_json::to_value(enumerate_active_displays()).map_err(|error| error.to_string())?,
    );
    Ok(value)
}

#[cfg(target_os = "windows")]
fn utf16z_to_string(value: &[u16]) -> String {
    let end = value
        .iter()
        .position(|character| *character == 0)
        .unwrap_or(value.len());
    String::from_utf16_lossy(&value[..end]).trim().to_string()
}

#[cfg(target_os = "windows")]
fn windows_display_match_key(value: &str) -> String {
    let uppercase = value.to_ascii_uppercase();
    for prefix in ["MONITOR\\", "DISPLAY\\", "MONITOR#", "DISPLAY#"] {
        if let Some(start) = uppercase.find(prefix) {
            let rest = &value[start + prefix.len()..];
            let end = rest
                .find(|character| character == '\\' || character == '#')
                .unwrap_or(rest.len());
            return rest[..end].trim().to_string();
        }
    }
    String::new()
}

#[cfg(target_os = "windows")]
fn enumerate_dxgi_adapters() -> Vec<DxgiAdapterInfo> {
    use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_DESC1};

    let factory: IDXGIFactory1 = match unsafe { CreateDXGIFactory1() } {
        Ok(factory) => factory,
        Err(error) => {
            log::warn!("DXGI adapter enumeration is unavailable: {}", error);
            return Vec::new();
        }
    };
    let mut adapters = Vec::new();
    for index in 0..32_u32 {
        let adapter = match unsafe { factory.EnumAdapters1(index) } {
            Ok(adapter) => adapter,
            Err(_) => break,
        };
        let mut description = DXGI_ADAPTER_DESC1::default();
        if unsafe { adapter.GetDesc1(&mut description) }.is_err() {
            continue;
        }
        adapters.push(DxgiAdapterInfo {
            description: utf16z_to_string(&description.Description),
            vendor_id: description.VendorId,
            device_id: description.DeviceId,
            dedicated_video_memory: description.DedicatedVideoMemory as u64,
            shared_system_memory: description.SharedSystemMemory as u64,
            flags: description.Flags,
        });
    }
    adapters
}

#[cfg(target_os = "windows")]
fn enumerate_active_displays() -> Vec<ActiveDisplayConfiguration> {
    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayDevicesW, EnumDisplaySettingsW, DEVMODEW, DISPLAY_DEVICEW,
        DISPLAY_DEVICE_ATTACHED_TO_DESKTOP, ENUM_CURRENT_SETTINGS,
    };

    let mut displays = Vec::new();
    for index in 0..32_u32 {
        let mut adapter = DISPLAY_DEVICEW::default();
        adapter.cb = std::mem::size_of::<DISPLAY_DEVICEW>() as u32;
        if !unsafe { EnumDisplayDevicesW(None, index, &mut adapter, 0) }.as_bool() {
            break;
        }
        if adapter.StateFlags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP == 0 {
            continue;
        }
        let mut mode = DEVMODEW::default();
        mode.dmSize = std::mem::size_of::<DEVMODEW>() as u16;
        if !unsafe {
            EnumDisplaySettingsW(
                PCWSTR(adapter.DeviceName.as_ptr()),
                ENUM_CURRENT_SETTINGS,
                &mut mode,
            )
        }
        .as_bool()
        {
            continue;
        }
        let mut monitor = DISPLAY_DEVICEW::default();
        monitor.cb = std::mem::size_of::<DISPLAY_DEVICEW>() as u32;
        let has_monitor =
            unsafe { EnumDisplayDevicesW(PCWSTR(adapter.DeviceName.as_ptr()), 0, &mut monitor, 0) }
                .as_bool();
        displays.push(ActiveDisplayConfiguration {
            adapter_name: utf16z_to_string(&adapter.DeviceString),
            device_name: utf16z_to_string(&adapter.DeviceName),
            monitor_key: if has_monitor {
                windows_display_match_key(&utf16z_to_string(&monitor.DeviceID))
            } else {
                String::new()
            },
            width: mode.dmPelsWidth,
            height: mode.dmPelsHeight,
            refresh_hz: mode.dmDisplayFrequency,
        });
    }
    displays
}

#[cfg(not(target_os = "windows"))]
fn collect_gpu_display_info() -> Result<serde_json::Value, String> {
    Err("GPU and display inspection is currently available on Windows only".to_string())
}

#[tauri::command]
async fn get_mainboard_firmware_info() -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(collect_mainboard_firmware_info)
        .await
        .map_err(|error| format!("Mainboard and firmware inspection worker failed: {}", error))?
}

#[cfg(target_os = "windows")]
fn collect_mainboard_firmware_info() -> Result<serde_json::Value, String> {
    // This inventory intentionally leaves out board serial numbers, UUIDs,
    // PnP instance paths, and any other machine-identifying values. Windows
    // exposes PCI device names and status without needing those identifiers.
    const SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
function Epoch($value) {
  if ($null -eq $value) { return $null }
  try { return ([DateTimeOffset]$value).ToUnixTimeMilliseconds() } catch { return $null }
}
$board = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS | Select-Object -First 1
$computer = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$enclosure = Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1
$secureBoot = 'unavailable'
try { if (Confirm-SecureBootUEFI) { $secureBoot = 'enabled' } else { $secureBoot = 'disabled' } } catch {}
$bootMode = if (Test-Path 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State') { 'uefi' } else { 'legacy_or_unavailable' }
$tpm = Get-Tpm
$rawPci = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPDeviceID -like 'PCI\*' } | Sort-Object PNPClass, Name)
$pciDevices = @($rawPci | Group-Object { "$($_.PNPClass)`u001f$($_.Name)`u001f$($_.Manufacturer)`u001f$($_.Status)`u001f$($_.ConfigManagerErrorCode)" } | ForEach-Object {
  $sample = $_.Group | Select-Object -First 1
  [ordered]@{
    name = [string]$sample.Name
    manufacturer = [string]$sample.Manufacturer
    pnp_class = [string]$sample.PNPClass
    status = [string]$sample.Status
    problem_code = [int]$sample.ConfigManagerErrorCode
    count = [int]$_.Count
  }
} | Select-Object -First 40)
[ordered]@{
  board = [ordered]@{
    manufacturer = [string]$board.Manufacturer
    product = [string]$board.Product
    version = [string]$board.Version
    status = [string]$board.Status
  }
  firmware = [ordered]@{
    manufacturer = [string]$bios.Manufacturer
    bios_version = [string]$bios.SMBIOSBIOSVersion
    release_at = Epoch $bios.ReleaseDate
    smbios_major = [int]$bios.SMBIOSMajorVersion
    smbios_minor = [int]$bios.SMBIOSMinorVersion
    boot_mode = $bootMode
  }
  security = [ordered]@{
    secure_boot = $secureBoot
    tpm_present = [bool]$tpm.TpmPresent
    tpm_ready = [bool]$tpm.TpmReady
    tpm_manufacturer = ([string]$tpm.ManufacturerIdTxt).Trim([char]0)
    virtualization_enabled = [bool]$cpu.VirtualizationFirmwareEnabled
  }
  chassis = [ordered]@{
    types = @($enclosure.ChassisTypes | ForEach-Object { [int]$_ })
    manufacturer = [string]$computer.Manufacturer
    model = [string]$computer.Model
  }
  pci_devices = $pciDevices
} | ConvertTo-Json -Depth 6 -Compress
"#;

    run_windows_powershell_json(SCRIPT, "Mainboard and firmware inspection")
}

#[cfg(not(target_os = "windows"))]
fn collect_mainboard_firmware_info() -> Result<serde_json::Value, String> {
    Err("Mainboard and firmware inspection is currently available on Windows only".to_string())
}

#[tauri::command]
async fn get_storage_health_info() -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(collect_storage_health_info)
        .await
        .map_err(|error| format!("Storage and health inspection worker failed: {}", error))?
}

#[cfg(target_os = "windows")]
fn collect_storage_health_info() -> Result<serde_json::Value, String> {
    // Storage serials and volume labels are deliberately excluded. The page
    // needs only non-identifying capacity, health, and reliability data.
    const SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
function MaybeInt($value) {
  if ($null -eq $value) { return $null }
  return [Int64]$value
}
$physicalDisks = @(Get-PhysicalDisk)
$physicalById = @{}
foreach ($physical in $physicalDisks) { $physicalById[[string]$physical.DeviceId] = $physical }
$reliabilityById = @{}
if ($physicalDisks.Count -gt 0) {
  foreach ($physical in $physicalDisks) {
    @(Get-StorageReliabilityCounter -PhysicalDisk $physical) | ForEach-Object {
      $reliabilityById[[string]$_.DeviceId] = $_
    }
  }
}
$disks = @(Get-Disk | ForEach-Object {
  $disk = $_
  $physical = $physicalById[[string]$disk.Number]
  if ($null -eq $physical) {
    $physical = $physicalDisks | Where-Object { $_.FriendlyName -eq $disk.FriendlyName } | Select-Object -First 1
  }
  $reliability = if ($physical) { $reliabilityById[[string]$physical.DeviceId] } else { $reliabilityById[[string]$disk.Number] }
  [ordered]@{
    number = [int]$disk.Number
    friendly_name = if ($physical) { [string]$physical.FriendlyName } else { [string]$disk.FriendlyName }
    media_type = if ($physical) { [string]$physical.MediaType } else { '' }
    bus_type = if ($physical) { [string]$physical.BusType } else { [string]$disk.BusType }
    size_bytes = [Int64]$disk.Size
    firmware_version = if ($physical) { [string]$physical.FirmwareVersion } else { '' }
    partition_style = [string]$disk.PartitionStyle
    health_status = if ($physical -and $physical.HealthStatus) { [string]$physical.HealthStatus } else { [string]$disk.HealthStatus }
    operational_status = if ($physical -and $physical.OperationalStatus) { @($physical.OperationalStatus) -join ', ' } else { @($disk.OperationalStatus) -join ', ' }
    is_system = [bool]$disk.IsSystem
    is_boot = [bool]$disk.IsBoot
    is_offline = [bool]$disk.IsOffline
    reliability = [ordered]@{
      temperature_c = if ($reliability -and $null -ne $reliability.Temperature) { MaybeInt $reliability.Temperature } else { $null }
      wear_percent = if ($reliability -and $null -ne $reliability.Wear) { MaybeInt $reliability.Wear } else { $null }
      power_on_hours = if ($reliability -and $null -ne $reliability.PowerOnHours) { MaybeInt $reliability.PowerOnHours } else { $null }
      read_errors_total = if ($reliability -and $null -ne $reliability.ReadErrorsTotal) { MaybeInt $reliability.ReadErrorsTotal } else { $null }
      write_errors_total = if ($reliability -and $null -ne $reliability.WriteErrorsTotal) { MaybeInt $reliability.WriteErrorsTotal } else { $null }
    }
  }
})
$volumes = @(Get-Volume | Where-Object { $_.DriveLetter -and $_.DriveType -eq 'Fixed' } | Sort-Object DriveLetter | ForEach-Object {
  [ordered]@{
    drive_letter = [string]$_.DriveLetter
    file_system = [string]$_.FileSystem
    size_bytes = [Int64]$_.Size
    free_bytes = [Int64]$_.SizeRemaining
    health_status = [string]$_.HealthStatus
  }
})
[ordered]@{ disks = $disks; volumes = $volumes } | ConvertTo-Json -Depth 6 -Compress
"#;

    run_windows_powershell_json(SCRIPT, "Storage and health inspection")
}

#[cfg(not(target_os = "windows"))]
fn collect_storage_health_info() -> Result<serde_json::Value, String> {
    Err("Storage and health inspection is currently available on Windows only".to_string())
}

#[tauri::command]
async fn get_network_devices_info() -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(collect_network_devices_info)
        .await
        .map_err(|error| format!("Network and device inspection worker failed: {}", error))?
}

#[cfg(target_os = "windows")]
fn collect_network_devices_info() -> Result<serde_json::Value, String> {
    // Deliberately exclude addresses and identifiers: IP, MAC, Bluetooth
    // address, device instance path, and serial values do not help this page.
    const SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
function GroupDevices($items) {
  return @($items | Group-Object { "$($_.name)`u001f$($_.manufacturer)`u001f$($_.status)" } | ForEach-Object {
    $sample = $_.Group | Select-Object -First 1
    [ordered]@{
      name = [string]$sample.name
      manufacturer = [string]$sample.manufacturer
      status = [string]$sample.status
      count = [int]$_.Count
    }
  } | Select-Object -First 40)
}
$networkAdapters = @(Get-NetAdapter -IncludeHidden | Where-Object { $_.Status -ne 'Not Present' } | ForEach-Object {
  [ordered]@{
    name = [string]$_.Name
    description = [string]$_.InterfaceDescription
    status = [string]$_.Status
    link_speed = [string]$_.LinkSpeed
    physical = [bool]$_.HardwareInterface
  }
})
$bluetoothRaw = @(Get-CimInstance Win32_PnPEntity | Where-Object {
  $_.PNPClass -eq 'Bluetooth' -and $_.Present -and $_.Name -notmatch '(?i)(service|profile|enumerator|rfcomm|服务|配置文件|枚举器)'
} | ForEach-Object { [ordered]@{ name = [string]$_.Name; manufacturer = [string]$_.Manufacturer; status = [string]$_.Status } })
$usbRaw = @(Get-CimInstance Win32_PnPEntity | Where-Object {
  $_.PNPClass -eq 'USB' -and $_.Present
} | ForEach-Object { [ordered]@{ name = [string]$_.Name; manufacturer = [string]$_.Manufacturer; status = [string]$_.Status } })
$cameraRaw = @(Get-CimInstance Win32_PnPEntity | Where-Object {
  $_.PNPClass -in @('Camera', 'Image') -and $_.Present
} | ForEach-Object { [ordered]@{ name = [string]$_.Name; manufacturer = [string]$_.Manufacturer; status = [string]$_.Status } })
$audioRaw = @(Get-CimInstance Win32_SoundDevice | ForEach-Object {
  [ordered]@{ name = [string]$_.Name; manufacturer = [string]$_.Manufacturer; status = [string]$_.Status }
})
[ordered]@{
  network_adapters = $networkAdapters
  bluetooth_devices = GroupDevices $bluetoothRaw
  audio_devices = GroupDevices $audioRaw
  usb_devices = GroupDevices $usbRaw
  cameras = GroupDevices $cameraRaw
} | ConvertTo-Json -Depth 6 -Compress
"#;

    run_windows_powershell_json(SCRIPT, "Network and device inspection")
}

#[cfg(not(target_os = "windows"))]
fn collect_network_devices_info() -> Result<serde_json::Value, String> {
    Err("Network and device inspection is currently available on Windows only".to_string())
}

#[tauri::command]
async fn get_power_sensors_info() -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(collect_power_sensors_info)
        .await
        .map_err(|error| format!("Power and sensor inspection worker failed: {}", error))?
}

#[cfg(target_os = "windows")]
fn collect_power_sensors_info() -> Result<serde_json::Value, String> {
    // Battery serial numbers, power-plan GUIDs, and sensor instance paths are
    // deliberately omitted. This page only needs human-readable read-only data.
    const SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
function MaybeInt($value) {
  if ($null -eq $value) { return $null }
  return [Int64]$value
}
function MaybeFloat($value) {
  if ($null -eq $value) { return $null }
  return [double]$value
}
function CelsiusFromAcpi($value) {
  if ($null -eq $value -or [double]$value -le 0) { return $null }
  return [math]::Round(([double]$value / 10.0) - 273.15, 1)
}
function BatteryStatusName($value) {
  switch ([int]$value) {
    1 { 'other' }
    2 { 'unknown' }
    3 { 'fully_charged' }
    4 { 'low' }
    5 { 'critical' }
    6 { 'charging' }
    7 { 'charging_high' }
    8 { 'charging_low' }
    9 { 'charging_critical' }
    10 { 'undefined' }
    11 { 'partially_charged' }
    default { 'unknown' }
  }
}
$activePlan = Get-CimInstance -Namespace root\cimv2\power -ClassName Win32_PowerPlan | Where-Object { $_.IsActive } | Select-Object -First 1
$batteryStatic = @(Get-CimInstance -Namespace root\wmi -ClassName BatteryStaticData)
$batteryFull = @(Get-CimInstance -Namespace root\wmi -ClassName BatteryFullChargedCapacity)
$batteries = @(Get-CimInstance Win32_Battery)
$batteryItems = @()
for ($i = 0; $i -lt $batteries.Count; $i++) {
  $battery = $batteries[$i]
  $static = if ($i -lt $batteryStatic.Count) { $batteryStatic[$i] } else { $null }
  $full = if ($i -lt $batteryFull.Count) { $batteryFull[$i] } else { $null }
  $designCapacity = if ($static -and $null -ne $static.DesignedCapacity) { MaybeInt $static.DesignedCapacity } else { $null }
  $fullCapacity = if ($full -and $null -ne $full.FullChargedCapacity) { MaybeInt $full.FullChargedCapacity } else { $null }
  $health = if ($designCapacity -and $designCapacity -gt 0 -and $fullCapacity -and $fullCapacity -gt 0) { [math]::Round(($fullCapacity / $designCapacity) * 100, 0) } else { $null }
  $batteryItems += [ordered]@{
    name = [string]$battery.Name
    status = BatteryStatusName $battery.BatteryStatus
    status_code = MaybeInt $battery.BatteryStatus
    charge_percent = MaybeInt $battery.EstimatedChargeRemaining
    estimated_run_time_min = if ($battery.EstimatedRunTime -and [int]$battery.EstimatedRunTime -lt 71582788) { MaybeInt $battery.EstimatedRunTime } else { $null }
    design_capacity_mwh = $designCapacity
    full_charge_capacity_mwh = $fullCapacity
    health_percent = $health
  }
}
$thermalZones = @(Get-CimInstance -Namespace root\wmi -ClassName MSAcpi_ThermalZoneTemperature | ForEach-Object -Begin { $zoneIndex = 0 } -Process {
  $zoneIndex += 1
  [ordered]@{
    name = "ACPI Thermal Zone $zoneIndex"
    source = 'acpi'
    current_c = CelsiusFromAcpi $_.CurrentTemperature
    critical_c = CelsiusFromAcpi $_.CriticalTripPoint
    passive_c = CelsiusFromAcpi $_.PassiveTripPoint
  }
})
$fans = @(Get-CimInstance Win32_Fan | ForEach-Object {
  [ordered]@{
    name = [string]$_.Name
    status = [string]$_.Status
    desired_speed_rpm = MaybeInt $_.DesiredSpeed
    active_cooling = if ($null -ne $_.ActiveCooling) { [bool]$_.ActiveCooling } else { $null }
  }
})
[ordered]@{
  power_plan = [ordered]@{
    name = if ($activePlan) { [string]$activePlan.ElementName } else { '' }
    caption = if ($activePlan) { [string]$activePlan.Caption } else { '' }
    active = [bool]($activePlan -and $activePlan.IsActive)
  }
  batteries = $batteryItems
  thermal_zones = $thermalZones
  fans = $fans
} | ConvertTo-Json -Depth 6 -Compress
"#;

    run_windows_powershell_json(SCRIPT, "Power and sensor inspection")
}

#[cfg(not(target_os = "windows"))]
fn collect_power_sensors_info() -> Result<serde_json::Value, String> {
    Err("Power and sensor inspection is currently available on Windows only".to_string())
}

#[tauri::command]
async fn scan_large_files(
    root_path: String,
    min_size_mb: Option<u64>,
    mode: Option<String>,
) -> Result<LargeFileScanResult, String> {
    tokio::task::spawn_blocking(move || collect_large_files(root_path, min_size_mb, mode))
        .await
        .map_err(|error| format!("Large file scan worker failed: {}", error))?
}

fn collect_large_files(
    root_path: String,
    min_size_mb: Option<u64>,
    mode: Option<String>,
) -> Result<LargeFileScanResult, String> {
    let root = canonical_scan_root(&root_path)?;
    let min_size_mb = min_size_mb.unwrap_or(50).clamp(10, 102_400);
    let min_size_bytes = min_size_mb.saturating_mul(1024 * 1024);
    let mode = normalize_large_file_mode(mode.as_deref());
    let mut scanned_files = 0_u64;
    let mut skipped_dirs = 0_u64;
    let mut candidates = Vec::new();
    let mut stack = vec![root.clone()];
    const MAX_SCAN_FILES: u64 = 250_000;
    const MAX_RESULTS: usize = 1200;

    while let Some(directory) = stack.pop() {
        if should_skip_cleanup_dir(&directory, &root) {
            skipped_dirs += 1;
            continue;
        }
        let entries = match std::fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(_) => {
                skipped_dirs += 1;
                continue;
            }
        };
        for entry in entries.flatten() {
            if scanned_files >= MAX_SCAN_FILES {
                break;
            }
            let path = entry.path();
            let metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };
            if metadata.is_dir() {
                stack.push(path);
                continue;
            }
            if !metadata.is_file() {
                continue;
            }
            scanned_files += 1;
            let size_bytes = metadata.len();
            if size_bytes < min_size_bytes {
                continue;
            }
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            let category = cleanup_file_category(&extension);
            if category == "other" || !cleanup_mode_allows(&mode, category) {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                continue;
            }
            let modified_at = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .and_then(|duration| i64::try_from(duration.as_millis()).ok());
            let (risk, local_reason) = cleanup_local_risk(&path, category, size_bytes);
            candidates.push(LargeFileCandidate {
                id: format!("lf-{}", candidates.len() + 1),
                path: cleanup_display_path(&path),
                name,
                extension,
                category: category.to_string(),
                size_bytes,
                modified_at,
                folder_hint: cleanup_folder_hint(&path, &root),
                risk,
                local_reason,
            });
            if candidates.len() >= MAX_RESULTS {
                break;
            }
        }
        if scanned_files >= MAX_SCAN_FILES || candidates.len() >= MAX_RESULTS {
            break;
        }
    }

    candidates.sort_by(|a, b| {
        b.size_bytes
            .cmp(&a.size_bytes)
            .then_with(|| a.name.cmp(&b.name))
    });
    let drive_space = cleanup_drive_space_from_path(&cleanup_display_path(&root))
        .ok()
        .flatten();
    Ok(LargeFileScanResult {
        root_path: cleanup_display_path(&root),
        min_size_bytes,
        mode,
        scanned_files,
        skipped_dirs,
        drive_space,
        candidates,
    })
}

#[tauri::command]
fn get_cleanup_drive_space(root_path: String) -> Result<Option<CleanupDriveSpace>, String> {
    cleanup_drive_space_from_path(&root_path)
}

#[cfg(target_os = "windows")]
fn cleanup_drive_space_from_path(root_path: &str) -> Result<Option<CleanupDriveSpace>, String> {
    use std::os::windows::process::CommandExt;

    if root_path.contains('\0') {
        return Err("Invalid drive path".to_string());
    }
    let Some(drive) = cleanup_drive_root_letter_from_input(root_path) else {
        return Ok(None);
    };
    let script = format!(
        r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='{}:'" | Select-Object -First 1
if ($null -ne $disk) {{
  [ordered]@{{ drive = '{}:\'; free_bytes = [Int64]$disk.FreeSpace; total_bytes = [Int64]$disk.Size }} | ConvertTo-Json -Compress
}}
"#,
        drive, drive
    );
    let output = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .creation_flags(0x08000000)
        .output()
        .map_err(|error| format!("Cannot read drive space: {}", error))?;
    if !output.status.success() {
        let details = String::from_utf8_lossy(&output.stderr)
            .trim()
            .replace(['\r', '\n'], " ");
        return Err(if details.is_empty() {
            "Cannot read drive space".to_string()
        } else {
            format!(
                "Cannot read drive space: {}",
                details.chars().take(240).collect::<String>()
            )
        });
    }
    let payload = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if payload.is_empty() {
        return Ok(None);
    }
    serde_json::from_str::<CleanupDriveSpace>(&payload)
        .map(Some)
        .map_err(|error| format!("Drive space returned invalid data: {}", error))
}

#[cfg(not(target_os = "windows"))]
fn cleanup_drive_space_from_path(_root_path: &str) -> Result<Option<CleanupDriveSpace>, String> {
    Ok(None)
}

#[cfg(target_os = "windows")]
fn cleanup_drive_root_letter_from_input(root_path: &str) -> Option<char> {
    let trimmed = root_path.trim();
    let without_verbatim = trimmed.strip_prefix(r"\\?\").unwrap_or(trimmed);
    let bytes = without_verbatim.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
        let rest = &without_verbatim[2..];
        if rest.is_empty() || rest.chars().all(|ch| ch == '\\' || ch == '/') {
            return Some((bytes[0] as char).to_ascii_uppercase());
        }
    }
    cleanup_drive_root_letter(std::path::Path::new(root_path))
}

fn canonical_scan_root(root_path: &str) -> Result<std::path::PathBuf, String> {
    if root_path.contains('\0') {
        return Err("Invalid scan folder".to_string());
    }
    let root = std::path::PathBuf::from(root_path)
        .canonicalize()
        .map_err(|error| format!("Cannot access scan folder: {}", error))?;
    if !root.is_dir() {
        return Err("Scan target must be a folder".to_string());
    }
    if is_broad_or_protected_cleanup_root(&root) {
        return Err("System drive root is blocked. Please choose a user folder such as Downloads, Desktop, Videos, or a project export folder.".to_string());
    }
    Ok(root)
}

fn normalize_large_file_mode(mode: Option<&str>) -> String {
    match mode.unwrap_or("video").to_ascii_lowercase().as_str() {
        "all" | "video" | "archives" | "installers" | "documents" | "images" | "audio"
        | "models" => mode.unwrap_or("video").to_ascii_lowercase(),
        _ => "video".to_string(),
    }
}

fn cleanup_file_category(extension: &str) -> &'static str {
    match extension {
        "mp4" | "mov" | "mkv" | "avi" | "webm" | "flv" | "m4v" | "wmv" | "ts" | "mpeg" | "mpg" => {
            "video"
        }
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "iso" => "archives",
        "exe" | "msi" | "msix" | "appx" => "installers",
        "pdf" | "ppt" | "pptx" | "doc" | "docx" | "xls" | "xlsx" | "csv" => "documents",
        "psd" | "ai" | "fig" | "raw" | "arw" | "cr2" | "nef" | "tif" | "tiff" | "png" | "jpg"
        | "jpeg" | "webp" | "bmp" => "images",
        "wav" | "flac" | "mp3" | "aac" | "m4a" | "ogg" | "wma" | "alac" => "audio",
        "gguf" | "safetensors" | "pth" | "pt" | "onnx" | "bin" | "ckpt" | "model" => "models",
        _ => "other",
    }
}

fn cleanup_mode_allows(mode: &str, category: &str) -> bool {
    mode == "all" || mode == category
}

fn is_broad_or_protected_cleanup_root(path: &std::path::Path) -> bool {
    let text = path.to_string_lossy().to_ascii_lowercase();
    #[cfg(target_os = "windows")]
    {
        if let Some(drive) = cleanup_drive_root_letter(path) {
            return drive == 'C';
        }
    }
    let mut normal_components = 0_usize;
    let mut has_root_or_prefix = false;
    for component in path.components() {
        match component {
            std::path::Component::Normal(_) => normal_components += 1,
            std::path::Component::Prefix(_) | std::path::Component::RootDir => {
                has_root_or_prefix = true
            }
            _ => {}
        }
    }
    if (has_root_or_prefix && normal_components == 0) || text == r"\" || text == "/" {
        return true;
    }
    protected_cleanup_dir_names(path).iter().any(|name| {
        matches!(
            name.as_str(),
            "windows"
                | "program files"
                | "program files (x86)"
                | "programdata"
                | "$recycle.bin"
                | "system volume information"
        )
    })
}

#[cfg(target_os = "windows")]
fn cleanup_drive_root_letter(path: &std::path::Path) -> Option<char> {
    let mut components = path.components();
    let drive = match components.next() {
        Some(std::path::Component::Prefix(prefix)) => match prefix.kind() {
            std::path::Prefix::Disk(letter) | std::path::Prefix::VerbatimDisk(letter) => {
                Some((letter as char).to_ascii_uppercase())
            }
            _ => None,
        },
        _ => None,
    }?;
    if !matches!(components.next(), Some(std::path::Component::RootDir)) {
        return None;
    }
    if components.next().is_some() {
        return None;
    }
    Some(drive)
}

fn cleanup_display_path(path: &std::path::Path) -> String {
    let text = path.to_string_lossy().into_owned();
    #[cfg(target_os = "windows")]
    {
        if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{}", rest);
        }
        if let Some(rest) = text.strip_prefix(r"\\?\") {
            return rest.to_string();
        }
    }
    text
}

fn protected_cleanup_dir_names(path: &std::path::Path) -> Vec<String> {
    path.components()
        .filter_map(|component| match component {
            std::path::Component::Normal(value) => {
                Some(value.to_string_lossy().to_ascii_lowercase())
            }
            _ => None,
        })
        .collect()
}

fn should_skip_cleanup_dir(path: &std::path::Path, root: &std::path::Path) -> bool {
    if path != root && is_broad_or_protected_cleanup_root(path) {
        return true;
    }
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(
        name.as_str(),
        ".git"
            | "node_modules"
            | "target"
            | "dist"
            | "build"
            | ".venv"
            | "venv"
            | "__pycache__"
            | ".cache"
            | "cache"
            | "tmp"
            | "temp"
    )
}

fn cleanup_folder_hint(path: &std::path::Path, root: &std::path::Path) -> String {
    let parent = path.parent().unwrap_or(root);
    let relative = parent.strip_prefix(root).unwrap_or(parent);
    let hint = relative.to_string_lossy().trim().to_string();
    if hint.is_empty() || hint == "." {
        "selected folder".to_string()
    } else {
        hint
    }
}

fn cleanup_local_risk(path: &std::path::Path, category: &str, size_bytes: u64) -> (String, String) {
    let text = path.to_string_lossy().to_ascii_lowercase();
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if text.contains("\\wechat") || text.contains("\\xwechat") || text.contains("\\wxid_") {
        return (
            "high".to_string(),
            "聊天文件目录，默认不建议自动删除".to_string(),
        );
    }
    if text.contains("\\projects\\")
        || text.contains("\\source\\")
        || text.contains("\\repo")
        || text.contains("\\src\\")
    {
        return (
            "high".to_string(),
            "疑似项目或源码目录，需要人工确认".to_string(),
        );
    }
    if matches!(category, "models") {
        return (
            "high".to_string(),
            "模型或开发资源通常可重新下载但体积大，删除前需要确认".to_string(),
        );
    }
    if matches!(category, "installers" | "archives")
        && (text.contains("\\download") || text.contains("\\downloads") || text.contains("\\下载"))
    {
        return (
            "low".to_string(),
            "下载目录中的安装包或压缩包，通常适合清理".to_string(),
        );
    }
    if category == "video"
        && (file_name.contains("录屏")
            || file_name.contains("record")
            || file_name.contains("capture")
            || file_name.contains("temp"))
    {
        return ("low".to_string(), "疑似录屏、导出或临时视频".to_string());
    }
    if size_bytes >= 1024 * 1024 * 1024 {
        return (
            "medium".to_string(),
            "体积超过 1GB，建议优先人工确认用途".to_string(),
        );
    }
    (
        "medium".to_string(),
        "大文件候选项，需要结合用途确认".to_string(),
    )
}

#[tauri::command]
async fn move_files_to_recycle_bin(paths: Vec<String>) -> Result<RecycleBinMoveResult, String> {
    tokio::task::spawn_blocking(move || move_files_to_recycle_bin_blocking(paths))
        .await
        .map_err(|error| format!("Recycle bin worker failed: {}", error))?
}

#[cfg(target_os = "windows")]
fn move_files_to_recycle_bin_blocking(paths: Vec<String>) -> Result<RecycleBinMoveResult, String> {
    let mut items = Vec::new();
    let mut moved = 0_usize;
    let mut failed = 0_usize;
    let mut freed_bytes = 0_u64;

    for path in paths.into_iter().take(200) {
        if path.contains('\0') {
            failed += 1;
            items.push(RecycleBinMoveItem {
                path,
                ok: false,
                error: Some("Invalid file path".to_string()),
            });
            continue;
        }
        let canonical = match std::path::PathBuf::from(&path).canonicalize() {
            Ok(path) => path,
            Err(error) => {
                failed += 1;
                items.push(RecycleBinMoveItem {
                    path,
                    ok: false,
                    error: Some(format!("Cannot access file: {}", error)),
                });
                continue;
            }
        };
        let display_path = cleanup_display_path(&canonical);
        if !canonical.is_file() || is_broad_or_protected_cleanup_root(&canonical) {
            failed += 1;
            items.push(RecycleBinMoveItem {
                path: display_path,
                ok: false,
                error: Some(if canonical.is_file() {
                    "Protected file path is not allowed".to_string()
                } else {
                    "Target is not a regular file".to_string()
                }),
            });
            continue;
        }
        let size = std::fs::metadata(&canonical)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        match move_single_file_to_recycle_bin(&canonical) {
            Ok(()) if !canonical.exists() => {
                moved += 1;
                freed_bytes = freed_bytes.saturating_add(size);
                items.push(RecycleBinMoveItem {
                    path: display_path,
                    ok: true,
                    error: None,
                });
            }
            Ok(()) => {
                failed += 1;
                items.push(RecycleBinMoveItem {
                    path: display_path,
                    ok: false,
                    error: Some("Windows reported success, but the file still exists. It may be in use or blocked by permissions.".to_string()),
                });
            }
            Err(error) => {
                failed += 1;
                items.push(RecycleBinMoveItem {
                    path: display_path,
                    ok: false,
                    error: Some(error),
                });
            }
        }
    }

    Ok(RecycleBinMoveResult {
        requested: items.len(),
        moved,
        failed,
        freed_bytes,
        items,
    })
}

#[cfg(target_os = "windows")]
fn move_single_file_to_recycle_bin(path: &std::path::Path) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::{
        SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FO_DELETE,
        SHFILEOPSTRUCTW,
    };

    // SHFileOperationW expects a double-null-terminated UTF-16 path list.
    // Use the display path instead of the canonical \\?\ form because the
    // legacy Shell operation is more reliable with normal absolute paths.
    let display_path = cleanup_display_path(path);
    let mut from: Vec<u16> = display_path.encode_utf16().collect();
    from.push(0);
    from.push(0);

    let mut operation = SHFILEOPSTRUCTW::default();
    operation.wFunc = FO_DELETE;
    operation.pFrom = PCWSTR(from.as_ptr());
    operation.fFlags =
        (FOF_ALLOWUNDO.0 | FOF_NOCONFIRMATION.0 | FOF_NOERRORUI.0 | FOF_SILENT.0) as u16;

    let result = unsafe { SHFileOperationW(&mut operation) };
    if result != 0 {
        return Err(format!(
            "Windows Recycle Bin API failed with code {}",
            result
        ));
    }
    if operation.fAnyOperationsAborted.as_bool() {
        return Err("Recycle bin operation was cancelled or blocked by Windows".to_string());
    }
    Ok(())
}

#[cfg(target_os = "windows")]
#[allow(dead_code)]
fn move_files_to_recycle_bin_blocking_powershell_fallback(
    paths: Vec<String>,
) -> Result<RecycleBinMoveResult, String> {
    use std::io::Write;
    use std::os::windows::process::CommandExt;

    let mut entries = Vec::new();
    let mut preflight_items = Vec::new();
    for path in paths.into_iter().take(200) {
        if path.contains('\0') {
            preflight_items.push(RecycleBinMoveItem {
                path,
                ok: false,
                error: Some("Invalid file path".to_string()),
            });
            continue;
        }
        let canonical = match std::path::PathBuf::from(&path).canonicalize() {
            Ok(path) => path,
            Err(error) => {
                preflight_items.push(RecycleBinMoveItem {
                    path,
                    ok: false,
                    error: Some(format!("Cannot access file: {}", error)),
                });
                continue;
            }
        };
        if !canonical.is_file() || is_broad_or_protected_cleanup_root(&canonical) {
            preflight_items.push(RecycleBinMoveItem {
                path: cleanup_display_path(&canonical),
                ok: false,
                error: Some(if canonical.is_file() {
                    "Protected file path is not allowed".to_string()
                } else {
                    "Target is not a regular file".to_string()
                }),
            });
            continue;
        }
        let size = std::fs::metadata(&canonical)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        entries.push(serde_json::json!({
            "path": cleanup_display_path(&canonical),
            "size": size
        }));
    }
    if entries.is_empty() {
        return Ok(RecycleBinMoveResult {
            requested: preflight_items.len(),
            moved: 0,
            failed: preflight_items.len(),
            freed_bytes: 0,
            items: preflight_items,
        });
    }
    let payload = serde_json::to_string(&entries).map_err(|error| error.to_string())?;
    const SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$items = ConvertFrom-Json ([Console]::In.ReadToEnd())
Add-Type -AssemblyName Microsoft.VisualBasic
$ui = [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs
$recycle = [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
$result = @()
foreach ($item in @($items)) {
  $path = [string]$item.path
  $ok = $false
  $err = $null
    try {
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($path, $ui, $recycle)
      $ok = -not (Test-Path -LiteralPath $path -PathType Leaf)
      if (-not $ok -and -not $err) {
        $err = 'Windows did not move the file to the Recycle Bin. The file may be in use, protected, or blocked by permissions.'
      }
    } else {
      $err = 'File no longer exists'
    }
  } catch {
    $err = $_.Exception.Message
  }
  $result += [ordered]@{ path = $path; ok = [bool]$ok; error = $err; size = [Int64]$item.size }
}
$result | ConvertTo-Json -Depth 4 -Compress
"#;
    let mut child = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            SCRIPT,
        ])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|error| format!("Cannot start recycle bin operation: {}", error))?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(payload.as_bytes())
            .map_err(|error| format!("Cannot send recycle bin payload: {}", error))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| format!("Recycle bin operation failed: {}", error))?;
    if !output.status.success() {
        let details = String::from_utf8_lossy(&output.stderr)
            .trim()
            .replace(['\r', '\n'], " ");
        return Err(if details.is_empty() {
            "Recycle bin operation failed".to_string()
        } else {
            format!(
                "Recycle bin operation failed: {}",
                details.chars().take(240).collect::<String>()
            )
        });
    }
    let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|error| format!("Recycle bin operation returned invalid data: {}", error))?;
    let rows = match parsed {
        serde_json::Value::Array(rows) => rows,
        serde_json::Value::Object(_) => vec![parsed],
        _ => Vec::new(),
    };
    let mut moved = 0_usize;
    let mut failed = preflight_items.len();
    let mut freed_bytes = 0_u64;
    let mut items = preflight_items;
    for row in rows {
        let path = row
            .get("path")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        let ok = row
            .get("ok")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);
        let size = row
            .get("size")
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
        let error = row
            .get("error")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string());
        if ok {
            moved += 1;
            freed_bytes = freed_bytes.saturating_add(size);
        } else {
            failed += 1;
        }
        items.push(RecycleBinMoveItem { path, ok, error });
    }
    Ok(RecycleBinMoveResult {
        requested: items.len(),
        moved,
        failed,
        freed_bytes,
        items,
    })
}

#[cfg(not(target_os = "windows"))]
fn move_files_to_recycle_bin_blocking(_paths: Vec<String>) -> Result<RecycleBinMoveResult, String> {
    Err("Recycle bin cleanup is currently available on Windows only".to_string())
}

#[cfg(test)]
mod cleanup_large_file_tests {
    use super::*;
    use std::io::Write;

    const MB: u64 = 1024 * 1024;

    fn cleanup_test_dir(label: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "toolknit-cleanup-{}-{}-{}",
            label,
            std::process::id(),
            nanos
        ));
        std::fs::create_dir_all(&dir).expect("create cleanup test dir");
        dir
    }

    fn make_sparse_file(path: &std::path::Path, size: u64) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create file parent");
        }
        let mut file = std::fs::File::create(path).expect("create sparse file");
        file.write_all(b"toolknit").expect("seed sparse file");
        file.set_len(size).expect("resize sparse file");
    }

    #[test]
    fn cleanup_scan_filters_mode_and_skips_dependency_dirs() {
        let dir = cleanup_test_dir("mode-skip");
        make_sparse_file(&dir.join("screen-record.mp4"), 11 * MB);
        make_sparse_file(&dir.join("installer.zip"), 12 * MB);
        make_sparse_file(&dir.join("node_modules").join("cached-video.mp4"), 12 * MB);

        let result = collect_large_files(
            dir.to_string_lossy().into_owned(),
            Some(10),
            Some("video".to_string()),
        )
        .expect("scan video mode");

        assert_eq!(result.candidates.len(), 1);
        assert_eq!(result.candidates[0].name, "screen-record.mp4");
        assert_eq!(result.candidates[0].category, "video");
        assert!(result.skipped_dirs >= 1);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn cleanup_scan_all_keeps_supported_large_files_only() {
        let dir = cleanup_test_dir("all-supported");
        make_sparse_file(&dir.join("backup.iso"), 11 * MB);
        make_sparse_file(&dir.join("notes.tmp"), 12 * MB);
        make_sparse_file(&dir.join("report.pdf"), 13 * MB);

        let result = collect_large_files(
            dir.to_string_lossy().into_owned(),
            Some(10),
            Some("all".to_string()),
        )
        .expect("scan all mode");
        let names: Vec<_> = result
            .candidates
            .iter()
            .map(|item| item.name.as_str())
            .collect();

        assert!(names.contains(&"backup.iso"));
        assert!(names.contains(&"report.pdf"));
        assert!(!names.contains(&"notes.tmp"));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn cleanup_scan_rejects_system_drive_root_only() {
        #[cfg(target_os = "windows")]
        {
            assert!(is_broad_or_protected_cleanup_root(std::path::Path::new(
                "C:\\"
            )));
            assert!(!is_broad_or_protected_cleanup_root(std::path::Path::new(
                "D:\\"
            )));
            let error =
                match collect_large_files("C:\\".to_string(), Some(10), Some("all".to_string())) {
                    Ok(_) => panic!("system drive root should be rejected"),
                    Err(error) => error,
                };
            assert!(error.contains("System drive root is blocked"));
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn cleanup_recycle_bin_moves_temp_file() {
        let dir = cleanup_test_dir("recycle");
        let file_path = dir.join("delete-me.tmp");
        make_sparse_file(&file_path, 1024);

        let result =
            move_files_to_recycle_bin_blocking(vec![file_path.to_string_lossy().into_owned()])
                .expect("move temp file to recycle bin");

        assert_eq!(result.requested, 1);
        assert_eq!(result.moved, 1);
        assert_eq!(result.failed, 0);
        assert!(!file_path.exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn cleanup_recycle_bin_moves_unicode_video_file() {
        let dir = cleanup_test_dir("recycle-unicode");
        let file_path = dir.join("error [レッドゾーン] (1080p_60fps_H264-128kbit_AAC).mp4");
        make_sparse_file(&file_path, 1024);

        let result =
            move_files_to_recycle_bin_blocking(vec![file_path.to_string_lossy().into_owned()])
                .expect("move unicode video file to recycle bin");

        assert_eq!(result.requested, 1);
        assert_eq!(
            result.moved,
            1,
            "items: {}",
            serde_json::to_string(&result.items).unwrap()
        );
        assert_eq!(result.failed, 0);
        assert!(!file_path.exists());
        let _ = std::fs::remove_dir_all(dir);
    }
}

#[tauri::command]
fn reveal_in_folder(path: String) -> Result<(), String> {
    // Legacy frontend builds used this command name for output actions. Keep
    // the command available for compatibility, but enforce the v1.3 rule that
    // an "open folder" action opens a directory only and never selects or opens
    // the output file itself.
    open_path(path)
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    if path.contains('\0') {
        return Err("Invalid path".to_string());
    }
    let requested = std::path::PathBuf::from(path);
    let target = match std::fs::metadata(&requested) {
        Ok(metadata) if metadata.is_file() => requested
            .parent()
            .map(|parent| parent.to_path_buf())
            .unwrap_or_else(|| std::path::PathBuf::from(".")),
        _ => requested,
    };
    let target = target.to_string_lossy().into_owned();
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer")
            .arg(&target)
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_recycle_bin() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer")
            .arg("shell:RecycleBinFolder")
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Opening the Recycle Bin is currently available on Windows only.".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_url,
            get_documents_dir,
            get_download_dir,
            get_install_lang,
            get_install_config,
            get_output_root,
            get_default_output_root,
            set_output_root,
            import_custom_background,
            clear_custom_background,
            log_custom_background_event,
            get_custom_background_media_url,
            check_transcription_engine,
            list_transcription_models,
            set_current_transcription_model,
            delete_transcription_model,
            download_transcription_model,
            transcribe_media,
            convert_audio_batch,
            cancel_convert,
            open_path,
            open_recycle_bin,
            reveal_in_folder,
            read_file_bytes,
            read_file_bytes_limited,
            prepare_icon_source_image,
            write_file_bytes,
            write_unique_file_bytes,
            write_unique_file_pair,
            write_file_chunk,
            begin_icon_archive_write,
            append_icon_archive_chunk,
            finalize_icon_archive_write,
            discard_icon_archive_write,
            exists_path,
            get_file_size,
            get_hardware_overview,
            get_cpu_memory_info,
            get_cpu_memory_live_stats,
            get_gpu_display_info,
            get_mainboard_firmware_info,
            get_storage_health_info,
            get_network_devices_info,
            get_power_sensors_info,
            scan_large_files,
            get_cleanup_drive_space,
            move_files_to_recycle_bin,
            decrypt_pdf,
            compress_pdf,
            trim_audio,
            probe_video,
            render_video_preview_frame,
            render_video_preview_clip,
            extract_audio,
            extract_video_frame,
            extract_video_gif,
            check_ffmpeg,
            get_ffmpeg_runtime_status,
            download_ffmpeg_runtime,
            delete_ffmpeg_runtime,
            cancel_dependency_downloads,
            convert_image_batch,
            compress_image_batch,
            inspect_image_stitch_inputs,
            create_image_stitch_pdf_session,
            write_image_stitch_pdf_page,
            discard_image_stitch_pdf_session,
            stitch_images,
            create_pdf_to_image_session,
            read_pdf_to_image_source,
            write_pdf_to_image_page,
            write_pdf_to_image_page_json,
            discard_pdf_to_image_session,
            cancel_pdf_to_image,
            export_pdf_to_images,
            convert_video_batch,
            set_tray_lang,
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main_window(app);
        }))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            cleanup_image_stitch_pdf_sessions();
            cleanup_pdf_to_image_sessions();
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            // 系统托盘
            let lang = read_initial_lang();
            let menu = build_tray_menu(app.handle(), &lang)?;

            let _tray = tauri::tray::TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        show_main_window(app);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button,
                        button_state,
                        ..
                    } = event
                    {
                        if button == tauri::tray::MouseButton::Left
                            && button_state == tauri::tray::MouseButtonState::Up
                        {
                            show_main_window(tray.app_handle());
                        }
                    }
                })
                .build(app)?;

            // 同步置顶状态到托盘菜单（可选）
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_always_on_top(false);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
