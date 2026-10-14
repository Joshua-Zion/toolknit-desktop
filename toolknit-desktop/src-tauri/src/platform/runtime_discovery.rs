use std::path::{Path, PathBuf};

pub(crate) fn explicit_candidates(value: &str, executable: &str) -> Vec<PathBuf> {
    let value = value.trim().trim_matches('"');
    if value.is_empty() || value.contains('\0') {
        return Vec::new();
    }
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Vec::new();
    }
    if path.is_dir() {
        [
            path.join(executable),
            path.join("bin").join(executable),
            path.join("program").join(executable),
        ]
        .into()
    } else {
        vec![path]
    }
}

pub(crate) fn path_directories() -> Vec<PathBuf> {
    let mut paths: Vec<_> = std::env::var_os("PATH")
        .map(|v| std::env::split_paths(&v).collect())
        .unwrap_or_default();
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        for (root, key) in [
            (HKEY_CURRENT_USER, "Environment"),
            (
                HKEY_LOCAL_MACHINE,
                "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
            ),
        ] {
            if let Some(value) = registry_string(root, key, "Path") {
                paths.extend(std::env::split_paths(&value));
            }
        }
    }
    paths.retain(|p| p.is_absolute());
    paths
}

#[cfg(target_os = "windows")]
fn registry_string(
    root: windows::Win32::System::Registry::HKEY,
    key: &str,
    value: &str,
) -> Option<String> {
    use windows::{
        core::PCWSTR,
        Win32::System::Registry::{RegGetValueW, RRF_RT_REG_EXPAND_SZ, RRF_RT_REG_SZ},
    };
    let key: Vec<_> = key.encode_utf16().chain(Some(0)).collect();
    let value: Vec<_> = value.encode_utf16().chain(Some(0)).collect();
    let mut data = [0u16; 32768];
    let mut bytes = (data.len() * 2) as u32;
    let result = unsafe {
        RegGetValueW(
            root,
            PCWSTR(key.as_ptr()),
            PCWSTR(value.as_ptr()),
            RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ,
            None,
            Some(data.as_mut_ptr().cast()),
            Some(&mut bytes),
        )
    };
    if result.0 != 0 || bytes < 2 || bytes % 2 != 0 || bytes as usize > data.len() * 2 {
        return None;
    }
    String::from_utf16(&data[..bytes as usize / 2 - 1]).ok()
}

pub(crate) fn registered_executables(executable: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
            for prefix in ["SOFTWARE", "SOFTWARE\\WOW6432Node"] {
                let key = format!(
                    "{prefix}\\Microsoft\\Windows\\CurrentVersion\\App Paths\\{executable}"
                );
                if let Some(value) = registry_string(root, &key, "") {
                    let candidates = explicit_candidates(&value, executable);
                    if executable == "soffice.exe" {
                        paths.extend(candidates.iter().map(|p| p.with_file_name("soffice.com")));
                    }
                    paths.extend(candidates);
                }
                if executable == "soffice.exe" {
                    let key = format!("{prefix}\\LibreOffice\\UNO\\InstallPath");
                    if let Some(value) = registry_string(root, &key, "") {
                        paths.extend(explicit_candidates(&value, "soffice.com"));
                    }
                }
            }
        }
    }
    paths
}

// Only enumerate known package-manager roots and matching packages, never disks.
pub(crate) fn package_candidates(root: &Path, prefix: &str, relative: &str) -> Vec<PathBuf> {
    std::fs::read_dir(root)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .to_ascii_lowercase()
                .starts_with(prefix)
        })
        .take(32)
        .map(|entry| entry.path().join(relative))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_paths_handle_quotes_and_directories_without_relative_commands() {
        let root = std::env::temp_dir();
        let paths = explicit_candidates(&format!("  \"{}\"  ", root.display()), "ffmpeg.exe");
        assert!(paths.contains(&root.join("bin/ffmpeg.exe")));
        for value in ["ffmpeg -version", "", "relative/ffmpeg.exe", "C:\0oops"] {
            assert!(explicit_candidates(value, "ffmpeg.exe").is_empty());
        }
    }
}
