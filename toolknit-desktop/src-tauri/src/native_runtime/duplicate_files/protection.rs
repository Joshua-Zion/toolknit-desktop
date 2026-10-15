use std::path::{Path, PathBuf};

pub(super) fn contains(root: &Path, candidate: &Path) -> bool {
    let mut parts = candidate.components();
    root.components().all(|part| {
        parts.next().is_some_and(|next| {
            if cfg!(target_os = "windows") {
                part.as_os_str().to_string_lossy().to_lowercase()
                    == next.as_os_str().to_string_lossy().to_lowercase()
            } else {
                part == next
            }
        })
    })
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;
    #[test]
    fn duplicate_files_install_protection_is_case_insensitive_and_component_bounded() {
        let root = Path::new(r"D:\Apps\Example");
        assert!(contains(root, Path::new(r"d:\apps\EXAMPLE\data")));
        assert!(!contains(root, Path::new(r"D:\Apps\ExampleCopy\data")));
        assert!(!contains(root, Path::new(r"D:\Apps")));
    }
}

// Read only explicit installation locations; never infer a whole drive from an executable path.
#[cfg(target_os = "windows")]
pub(super) fn installed_directories() -> Vec<PathBuf> {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::System::Registry::*;
    struct Key(HKEY);
    impl Drop for Key {
        fn drop(&mut self) {
            unsafe {
                let _ = RegCloseKey(self.0);
            }
        }
    }
    let mut roots = Vec::new();
    let value: Vec<u16> = "InstallLocation".encode_utf16().chain([0]).collect();
    for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            let subkey: Vec<u16> = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall"
                .encode_utf16()
                .chain([0])
                .collect();
            let mut handle = HKEY::default();
            if unsafe {
                RegOpenKeyExW(
                    hive,
                    PCWSTR(subkey.as_ptr()),
                    0,
                    KEY_READ | view,
                    &mut handle,
                )
            }
            .0 != 0
            {
                continue;
            }
            let key = Key(handle);
            for index in 0..8192 {
                let mut name = [0u16; 256];
                let mut length = name.len() as u32;
                let status = unsafe {
                    RegEnumKeyExW(
                        key.0,
                        index,
                        PWSTR(name.as_mut_ptr()),
                        &mut length,
                        None,
                        PWSTR::null(),
                        None,
                        None,
                    )
                }
                .0;
                if status == 259 {
                    break;
                }
                if status != 0 {
                    continue;
                }
                name[length as usize] = 0;
                let mut location = [0u16; 4096];
                let mut bytes = (location.len() * 2) as u32;
                if unsafe {
                    RegGetValueW(
                        key.0,
                        PCWSTR(name.as_ptr()),
                        PCWSTR(value.as_ptr()),
                        RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ,
                        None,
                        Some(location.as_mut_ptr().cast()),
                        Some(&mut bytes),
                    )
                }
                .0 != 0
                {
                    continue;
                }
                let end = location
                    .iter()
                    .position(|v| *v == 0)
                    .unwrap_or(location.len());
                let location = String::from_utf16_lossy(&location[..end]);
                let path = PathBuf::from(location.trim().trim_matches('"'));
                if path.is_absolute() && path.is_dir() {
                    if let Ok(path) = path.canonicalize() {
                        if path.parent().is_some()
                            && super::cleanup_guard::reject_links(&path).is_ok()
                        {
                            roots.push(path);
                        }
                    }
                }
            }
        }
    }
    roots.sort();
    roots.dedup();
    roots
}

#[cfg(not(target_os = "windows"))]
pub(super) fn installed_directories() -> Vec<PathBuf> {
    Vec::new()
}
