//! System (C-drive) cleanup backend.
//!
//! Design invariants, mirroring the approved 2.0 cleanup plan:
//! - Scan and execute are strictly separated; scan never writes.
//! - Only whitelisted cache / temporary / system-space locations are touched.
//! - Symlinks, junctions and other reparse points are never followed.
//! - Locked or inaccessible items are skipped, never force-unlocked.
//! - Permanent deletion is the explicit user-confirmed behavior.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const REPARSE_POINT_ATTRIBUTE: u32 = 0x400;

#[derive(Clone, Serialize)]
pub struct SystemCleanupTierSummary {
    pub rule_id: String,
    pub bytes: u64,
    pub count: u64,
}

#[derive(Clone, Serialize)]
pub struct SystemCleanupTier {
    pub tier: String,
    pub bytes: u64,
    pub count: u64,
    pub summaries: Vec<SystemCleanupTierSummary>,
}

#[derive(Clone, Serialize)]
pub struct SystemCleanupScan {
    pub system_drive: String,
    pub is_admin: bool,
    pub tiers: Vec<SystemCleanupTier>,
}

#[derive(Clone, Serialize)]
pub struct SystemCleanupRunItem {
    pub rule_id: String,
    pub path: String,
    pub ok: bool,
    pub freed_bytes: u64,
    pub error: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct SystemCleanupRunResult {
    pub tier: String,
    pub total_bytes: u64,
    pub freed_bytes: u64,
    pub failed_count: u64,
    pub items: Vec<SystemCleanupRunItem>,
}

struct PathRule {
    id: &'static str,
    roots: Vec<PathBuf>,
    age_secs: Option<u64>,
}

fn system_drive() -> String {
    std::env::var("SystemDrive")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "C:".to_string())
}

fn env_dir(name: &str) -> Option<PathBuf> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
}

fn system_root() -> PathBuf {
    env_dir("SystemRoot")
        .or_else(|| env_dir("WINDIR"))
        .unwrap_or_else(|| PathBuf::from("C:\\Windows"))
}

#[cfg(target_os = "windows")]
fn is_reparse_point(meta: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    meta.file_attributes() & REPARSE_POINT_ATTRIBUTE != 0
}

#[cfg(not(target_os = "windows"))]
fn is_reparse_point(meta: &std::fs::Metadata) -> bool {
    meta.file_type().is_symlink()
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn browser_cache_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let Some(local) = env_dir("LOCALAPPDATA") else {
        return dirs;
    };
    let browsers: [(&str, &str); 2] = [("Google", "Chrome"), ("Microsoft", "Edge")];
    for (vendor, name) in browsers {
        let user_data = local.join(vendor).join(name).join("User Data");
        let Ok(entries) = std::fs::read_dir(&user_data) else {
            continue;
        };
        for entry in entries.flatten() {
            let profile = entry.path();
            for cache in ["Cache", "Code Cache", "GPUCache", "ShaderCache"] {
                let candidate = profile.join(cache);
                if candidate.is_dir() {
                    dirs.push(candidate);
                }
            }
        }
    }
    dirs
}

fn shader_cache_dirs() -> Vec<PathBuf> {
    let Some(local) = env_dir("LOCALAPPDATA") else {
        return Vec::new();
    };
    [
        "NVIDIA\\DXCache",
        "NVIDIA\\GLCache",
        "AMD\\DxCache",
        "AMD\\GLCache",
        "D3DSCache",
        "Microsoft\\DirectXShaderCache",
    ]
    .iter()
    .map(|sub| local.join(sub))
    .filter(|path| path.is_dir())
    .collect()
}

fn thumbnail_cache_files() -> Vec<PathBuf> {
    let Some(local) = env_dir("LOCALAPPDATA") else {
        return Vec::new();
    };
    let explorer = local.join("Microsoft").join("Windows").join("Explorer");
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&explorer) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy().to_ascii_lowercase();
            if name.starts_with("thumbcache_") || name.starts_with("iconcache_") {
                files.push(entry.path());
            }
        }
    }
    files
}

fn delivery_optimization_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let root = system_root();
    dirs.push(
        root.join("ServiceProfiles")
            .join("NetworkService")
            .join("AppData")
            .join("Local")
            .join("Microsoft")
            .join("Windows")
            .join("DeliveryOptimization")
            .join("Cache"),
    );
    if let Some(program_data) = env_dir("ProgramData") {
        dirs.push(
            program_data
                .join("Microsoft")
                .join("Windows")
                .join("DeliveryOptimization")
                .join("Cache"),
        );
    }
    dirs
}

fn developer_cache_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(local) = env_dir("LOCALAPPDATA") {
        dirs.push(local.join("npm-cache"));
        dirs.push(local.join("pip").join("cache"));
        dirs.push(local.join("pnpm-cache"));
        dirs.push(local.join("yarn").join("Cache"));
    }
    dirs
}

fn collect_low_rules() -> Vec<PathRule> {
    let mut rules = Vec::new();
    rules.push(PathRule {
        id: "user_temp",
        roots: vec![std::env::temp_dir()],
        age_secs: Some(3 * 86_400),
    });
    rules.push(PathRule {
        id: "windows_temp",
        roots: vec![system_root().join("Temp")],
        age_secs: Some(7 * 86_400),
    });
    rules.push(PathRule {
        id: "browser_cache",
        roots: browser_cache_dirs(),
        age_secs: None,
    });
    rules.push(PathRule {
        id: "thumbnail_cache",
        roots: thumbnail_cache_files(),
        age_secs: None,
    });
    rules.push(PathRule {
        id: "shader_cache",
        roots: shader_cache_dirs(),
        age_secs: None,
    });
    if let Some(local) = env_dir("LOCALAPPDATA") {
        rules.push(PathRule {
            id: "wer_reports",
            roots: vec![local
                .join("Microsoft")
                .join("Windows")
                .join("WER")],
            age_secs: Some(7 * 86_400),
        });
        rules.push(PathRule {
            id: "inet_cache",
            roots: vec![local
                .join("Microsoft")
                .join("Windows")
                .join("INetCache")],
            age_secs: Some(7 * 86_400),
        });
    }
    rules
}

fn collect_medium_rules() -> Vec<PathRule> {
    let root = system_root();
    let mut rules = vec![
        PathRule {
            id: "windows_update_cache",
            roots: vec![root.join("SoftwareDistribution").join("Download")],
            age_secs: None,
        },
        PathRule {
            id: "delivery_optimization",
            roots: delivery_optimization_dirs(),
            age_secs: None,
        },
        PathRule {
            id: "windows_logs",
            roots: vec![root.join("Logs").join("CBS"), root.join("Logs").join("DISM")],
            age_secs: Some(7 * 86_400),
        },
    ];
    rules.push(PathRule {
        id: "developer_cache",
        roots: developer_cache_dirs(),
        age_secs: None,
    });
    rules
}

/// Walk every eligible file under the rule roots and invoke `on_file` for each.
/// Reparse points and symlinks are never followed. Returns aggregate (bytes, count).
fn walk_rule<F>(rule: &PathRule, on_file: &mut F) -> (u64, u64)
where
    F: FnMut(&Path, u64),
{
    let now = now_secs();
    let mut total_bytes = 0u64;
    let mut total_count = 0u64;
    for root in &rule.roots {
        let (bytes, count) = walk_path(root, rule.age_secs, now, on_file, 0);
        total_bytes = total_bytes.saturating_add(bytes);
        total_count = total_count.saturating_add(count);
    }
    (total_bytes, total_count)
}

fn walk_path<F>(
    dir: &Path,
    age_secs: Option<u64>,
    now: u64,
    on_file: &mut F,
    depth: u32,
) -> (u64, u64)
where
    F: FnMut(&Path, u64),
{
    if depth > 24 {
        return (0, 0);
    }
    let mut bytes = 0u64;
    let mut count = 0u64;
    let Ok(entries) = std::fs::read_dir(dir) else {
        return (0, 0);
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if is_reparse_point(&meta) {
            continue;
        }
        if meta.is_dir() {
            let (child_bytes, child_count) = walk_path(&path, age_secs, now, on_file, depth + 1);
            bytes = bytes.saturating_add(child_bytes);
            count = count.saturating_add(child_count);
        } else if meta.is_file() {
            if let Some(age) = age_secs {
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                    .map(|duration| duration.as_secs())
                    .unwrap_or(0);
                if now.saturating_sub(modified) < age {
                    continue;
                }
            }
            let size = meta.len();
            on_file(&path, size);
            bytes = bytes.saturating_add(size);
            count = count.saturating_add(1);
        }
    }
    (bytes, count)
}

fn scan_path_tier(tier: &str, rules: &[PathRule]) -> SystemCleanupTier {
    let mut summaries = Vec::new();
    let mut total_bytes = 0u64;
    let mut total_count = 0u64;
    for rule in rules {
        let mut rule_bytes = 0u64;
        let mut rule_count = 0u64;
        {
            let mut on_file = |_path: &Path, size: u64| {
                rule_bytes = rule_bytes.saturating_add(size);
                rule_count = rule_count.saturating_add(1);
            };
            walk_rule(rule, &mut on_file);
        }
        summaries.push(SystemCleanupTierSummary {
            rule_id: rule.id.to_string(),
            bytes: rule_bytes,
            count: rule_count,
        });
        total_bytes = total_bytes.saturating_add(rule_bytes);
        total_count = total_count.saturating_add(rule_count);
    }
    SystemCleanupTier {
        tier: tier.to_string(),
        bytes: total_bytes,
        count: total_count,
        summaries,
    }
}

fn run_path_tier(tier: &str, rules: &[PathRule]) -> SystemCleanupRunResult {
    let mut items: Vec<SystemCleanupRunItem> = Vec::new();
    let mut freed_bytes = 0u64;
    let mut total_bytes = 0u64;
    let mut failed_count = 0u64;

    for rule in rules {
        let mut on_file = |path: &Path, size: u64| {
            total_bytes = total_bytes.saturating_add(size);
            match std::fs::remove_file(path) {
                Ok(()) => {
                    freed_bytes = freed_bytes.saturating_add(size);
                    items.push(SystemCleanupRunItem {
                        rule_id: rule.id.to_string(),
                        path: path.to_string_lossy().to_string(),
                        ok: true,
                        freed_bytes: size,
                        error: None,
                    });
                }
                Err(error) => {
                    failed_count = failed_count.saturating_add(1);
                    if items.len() < 500 {
                        items.push(SystemCleanupRunItem {
                            rule_id: rule.id.to_string(),
                            path: path.to_string_lossy().to_string(),
                            ok: false,
                            freed_bytes: 0,
                            error: Some(error.to_string()),
                        });
                    }
                }
            }
        };
        walk_rule(rule, &mut on_file);
    }

    SystemCleanupRunResult {
        tier: tier.to_string(),
        total_bytes,
        freed_bytes,
        failed_count,
        items,
    }
}

#[cfg(target_os = "windows")]
fn run_powershell_stdout(script: &str) -> Result<String, String> {
    use std::os::windows::process::CommandExt;

    let output = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .creation_flags(0x08000000)
        .output()
        .map_err(|error| format!("Cannot run PowerShell: {}", error))?;
    if !output.status.success() {
        let details = String::from_utf8_lossy(&output.stderr)
            .trim()
            .replace(['\r', '\n'], " ");
        return Err(if details.is_empty() {
            "PowerShell command failed".to_string()
        } else {
            details.chars().take(240).collect::<String>()
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(not(target_os = "windows"))]
fn run_powershell_stdout(_script: &str) -> Result<String, String> {
    Err("System cleanup is available on Windows only".to_string())
}

fn run_powershell_number(script: &str) -> u64 {
    run_powershell_stdout(script)
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0)
}

fn is_admin() -> bool {
    const SCRIPT: &str = r#"[bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"#;
    run_powershell_stdout(SCRIPT)
        .map(|value| value.trim().eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn hibernation_size_bytes() -> u64 {
    const SCRIPT: &str = r#"$ErrorActionPreference='SilentlyContinue'; $f=Get-Item -LiteralPath "$env:SystemDrive\hiberfil.sys" -Force -ErrorAction SilentlyContinue; if($null -ne $f){[Int64]$f.Length}else{0}"#;
    run_powershell_number(SCRIPT)
}

fn restore_points_size_bytes() -> u64 {
    const SCRIPT: &str = r#"$ErrorActionPreference='SilentlyContinue'; $sum=0; $s=Get-CimInstance Win32_ShadowStorage -ErrorAction SilentlyContinue; foreach($x in @($s)){ $sum += [Int64]$x.UsedSpace }; $sum"#;
    run_powershell_number(SCRIPT)
}

fn recycle_bin_size_bytes() -> u64 {
    const SCRIPT: &str = r#"$ErrorActionPreference='SilentlyContinue'; $sum=0; $drives=Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"; foreach($d in @($drives)){ $rb=Join-Path $d.DeviceID '$Recycle.Bin'; if(Test-Path -LiteralPath $rb){ $items=Get-ChildItem -LiteralPath $rb -Recurse -Force -File -ErrorAction SilentlyContinue; foreach($i in @($items)){ $sum += [Int64]$i.Length } } }; $sum"#;
    run_powershell_number(SCRIPT)
}

fn scan_high_tier() -> SystemCleanupTier {
    let summaries = vec![
        SystemCleanupTierSummary {
            rule_id: "hibernation".to_string(),
            bytes: hibernation_size_bytes(),
            count: 0,
        },
        SystemCleanupTierSummary {
            rule_id: "restore_points".to_string(),
            bytes: restore_points_size_bytes(),
            count: 0,
        },
        SystemCleanupTierSummary {
            rule_id: "recycle_bin".to_string(),
            bytes: recycle_bin_size_bytes(),
            count: 0,
        },
    ];
    let bytes = summaries.iter().map(|summary| summary.bytes).sum();
    SystemCleanupTier {
        tier: "high".to_string(),
        bytes,
        count: summaries.len() as u64,
        summaries,
    }
}

fn run_hibernation() -> Result<u64, String> {
    let before = hibernation_size_bytes();
    run_powershell_stdout("powercfg /h off")?;
    Ok(before)
}

fn run_restore_points() -> Result<u64, String> {
    let before = restore_points_size_bytes();
    let drive = system_drive();
    let script = format!("vssadmin delete shadows /for={} /all /quiet", drive);
    run_powershell_stdout(&script)?;
    Ok(before)
}

fn run_recycle_bin() -> Result<u64, String> {
    let before = recycle_bin_size_bytes();
    run_powershell_stdout("Clear-RecycleBin -Force -ErrorAction SilentlyContinue")?;
    Ok(before)
}

fn run_high_tier() -> SystemCleanupRunResult {
    let mut freed_bytes = 0u64;
    let mut total_bytes = 0u64;
    let mut items: Vec<SystemCleanupRunItem> = Vec::new();
    let mut failed_count = 0u64;

    for (rule_id, action) in [
        ("hibernation", run_hibernation as fn() -> Result<u64, String>),
        ("restore_points", run_restore_points),
        ("recycle_bin", run_recycle_bin),
    ] {
        let before = match rule_id {
            "hibernation" => hibernation_size_bytes(),
            "restore_points" => restore_points_size_bytes(),
            _ => recycle_bin_size_bytes(),
        };
        total_bytes = total_bytes.saturating_add(before);
        match action() {
            Ok(amount) => {
                freed_bytes = freed_bytes.saturating_add(amount);
                items.push(SystemCleanupRunItem {
                    rule_id: rule_id.to_string(),
                    path: rule_id.to_string(),
                    ok: true,
                    freed_bytes: amount,
                    error: None,
                });
            }
            Err(error) => {
                failed_count = failed_count.saturating_add(1);
                items.push(SystemCleanupRunItem {
                    rule_id: rule_id.to_string(),
                    path: rule_id.to_string(),
                    ok: false,
                    freed_bytes: 0,
                    error: Some(error),
                });
            }
        }
    }

    SystemCleanupRunResult {
        tier: "high".to_string(),
        total_bytes,
        freed_bytes,
        failed_count,
        items,
    }
}

fn normalize_tier(tier: &str) -> Result<&'static str, String> {
    match tier.trim().to_ascii_lowercase().as_str() {
        "low" => Ok("low"),
        "medium" | "med" => Ok("medium"),
        "high" => Ok("high"),
        _ => Err("Unknown cleanup tier".to_string()),
    }
}

#[tauri::command]
pub fn system_cleanup_is_admin() -> bool {
    is_admin()
}

#[tauri::command]
pub fn system_cleanup_relaunch_as_admin(app: tauri::AppHandle) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let path = exe.to_string_lossy().replace('\'', "''");
    let script = format!("Start-Process -FilePath '{}' -Verb RunAs", path);
    run_powershell_stdout(&script)?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub async fn system_cleanup_scan() -> Result<SystemCleanupScan, String> {
    tokio::task::spawn_blocking(move || {
        let low = scan_path_tier("low", &collect_low_rules());
        let medium = scan_path_tier("medium", &collect_medium_rules());
        let high = scan_high_tier();
        Ok(SystemCleanupScan {
            system_drive: system_drive(),
            is_admin: is_admin(),
            tiers: vec![low, medium, high],
        })
    })
    .await
    .map_err(|error| format!("System cleanup scan worker failed: {}", error))?
}

#[tauri::command]
pub async fn system_cleanup_run(tier: String) -> Result<SystemCleanupRunResult, String> {
    tokio::task::spawn_blocking(move || {
        let normalized = normalize_tier(&tier)?;
        match normalized {
            "low" => Ok(run_path_tier("low", &collect_low_rules())),
            "medium" => Ok(run_path_tier("medium", &collect_medium_rules())),
            "high" => Ok(run_high_tier()),
            _ => Err("Unknown cleanup tier".to_string()),
        }
    })
    .await
    .map_err(|error| format!("System cleanup worker failed: {}", error))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_rule_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("toolknit-system-cleanup-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        dir
    }

    #[test]
    fn walk_rule_sums_regular_files_and_skips_directories() {
        let root = temp_rule_dir().join("walk");
        let nested = root.join("sub");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(root.join("a.txt"), b"12345").unwrap();
        std::fs::write(nested.join("b.bin"), b"1234567890").unwrap();

        let rule = PathRule {
            id: "test",
            roots: vec![root.clone()],
            age_secs: None,
        };
        let mut seen = 0u64;
        let (bytes, count) = walk_rule(&rule, &mut |_path, size| seen += size);
        assert_eq!(bytes, 15);
        assert_eq!(count, 2);
        assert_eq!(seen, 15);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn normalize_tier_accepts_expected_values() {
        assert_eq!(normalize_tier("low").unwrap(), "low");
        assert_eq!(normalize_tier("MEDIUM").unwrap(), "medium");
        assert_eq!(normalize_tier("high").unwrap(), "high");
        assert!(normalize_tier("bogus").is_err());
    }
}
