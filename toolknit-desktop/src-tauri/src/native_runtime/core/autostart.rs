use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[derive(Clone, Copy, serde::Serialize)]
pub(crate) struct AutostartStatus {
    supported: bool,
    enabled: bool,
}

#[derive(Default)]
pub(crate) struct AutostartState {
    menu: Mutex<Option<tauri::menu::CheckMenuItem<tauri::Wry>>>,
}

fn startup_command(executable: &std::path::Path) -> Result<String, String> {
    let path = executable.to_str().ok_or("Unsupported executable path")?;
    if !executable.is_absolute() || path.chars().any(|c| c == '"' || c.is_control()) {
        return Err("Invalid executable path".into());
    }
    Ok(format!("\"{path}\" --autostart"))
}

pub(crate) fn is_autostart_launch(args: impl IntoIterator<Item = String>) -> bool {
    args.into_iter().skip(1).any(|arg| arg == "--autostart")
}

#[cfg(target_os = "windows")]
mod registry {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::*;

    const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    const VALUE_NAME: &str = "ToolKnitDesktop";
    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(Some(0)).collect()
    }
    struct Key(HKEY);
    impl Drop for Key {
        fn drop(&mut self) {
            unsafe {
                let _ = RegCloseKey(self.0);
            }
        }
    }
    fn failure(code: u32) -> String {
        format!("Windows startup setting failed ({code})")
    }

    pub(super) fn read() -> Result<Option<String>, String> {
        read_at(RUN_KEY, VALUE_NAME)
    }
    fn read_at(subkey: &str, name: &str) -> Result<Option<String>, String> {
        let name = wide(name);
        let subkey = wide(subkey);
        let mut handle = HKEY::default();
        let opened = unsafe {
            RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey.as_ptr()),
                0,
                KEY_QUERY_VALUE,
                &mut handle,
            )
        };
        if opened.0 == 2 {
            return Ok(None);
        }
        if opened.0 != 0 {
            return Err(failure(opened.0));
        }
        let key = Key(handle);
        // Bound the registry value; malformed or oversized commands are never enabled.
        let mut data = vec![0u16; 32768];
        let mut bytes = (data.len() * 2) as u32;
        let mut kind = REG_VALUE_TYPE::default();
        let result = unsafe {
            RegQueryValueExW(
                key.0,
                PCWSTR(name.as_ptr()),
                None,
                Some(&mut kind),
                Some(data.as_mut_ptr().cast()),
                Some(&mut bytes),
            )
        };
        if result.0 == 2 {
            return Ok(None);
        }
        if result.0 != 0 {
            return Err(failure(result.0));
        }
        if kind != REG_SZ || bytes % 2 != 0 || bytes < 2 {
            return Ok(None);
        }
        data.truncate(bytes as usize / 2);
        if data.pop() != Some(0) || data.contains(&0) {
            return Ok(None);
        }
        Ok(String::from_utf16(&data).ok())
    }

    pub(super) fn write(command: Option<&str>) -> Result<(), String> {
        write_at(RUN_KEY, VALUE_NAME, command)
    }
    fn write_at(subkey: &str, name: &str, command: Option<&str>) -> Result<(), String> {
        let subkey = wide(subkey);
        let name = wide(name);
        let mut handle = HKEY::default();
        let result = unsafe {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey.as_ptr()),
                0,
                PCWSTR::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_SET_VALUE,
                None,
                &mut handle,
                None,
            )
        };
        if result.0 != 0 {
            return Err(failure(result.0));
        }
        let key = Key(handle);
        let result = if let Some(command) = command {
            let bytes: Vec<u8> = wide(command)
                .into_iter()
                .flat_map(u16::to_le_bytes)
                .collect();
            unsafe { RegSetValueExW(key.0, PCWSTR(name.as_ptr()), 0, REG_SZ, Some(&bytes)) }
        } else {
            unsafe { RegDeleteValueW(key.0, PCWSTR(name.as_ptr())) }
        };
        if result.0 == 0 || (command.is_none() && result.0 == 2) {
            Ok(())
        } else {
            Err(failure(result.0))
        }
    }

    #[test]
    fn startup_registry_roundtrip_uses_isolated_key() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let subkey = format!(
            "Software\\ToolKnit\\Tests\\Startup-{}-{unique}",
            std::process::id()
        );
        struct Cleanup(Vec<u16>);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                unsafe {
                    let _ = RegDeleteTreeW(HKEY_CURRENT_USER, PCWSTR(self.0.as_ptr()));
                }
            }
        }
        let _cleanup = Cleanup(wide(&subkey));
        assert_eq!(read_at(&subkey, VALUE_NAME).unwrap(), None);
        let command = "\"C:\\Program Files\\ToolKnit\\app.exe\" --autostart";
        write_at(&subkey, VALUE_NAME, Some(command)).unwrap();
        assert_eq!(
            read_at(&subkey, VALUE_NAME).unwrap().as_deref(),
            Some(command)
        );
        assert_ne!(
            read_at(&subkey, VALUE_NAME).unwrap().as_deref(),
            Some("\"C:\\Moved\\app.exe\" --autostart")
        );
        write_at(&subkey, "OtherApplication", Some("untouched")).unwrap();
        write_at(&subkey, VALUE_NAME, None).unwrap();
        write_at(&subkey, VALUE_NAME, None).unwrap();
        assert_eq!(read_at(&subkey, VALUE_NAME).unwrap(), None);
        assert_eq!(
            read_at(&subkey, "OtherApplication").unwrap().as_deref(),
            Some("untouched")
        );
    }
}

fn status() -> Result<AutostartStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let exe = std::env::current_exe().map_err(|_| "Cannot locate application")?;
        let expected = startup_command(&exe)?;
        Ok(AutostartStatus {
            supported: true,
            enabled: registry::read()?.as_deref() == Some(expected.as_str()),
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(AutostartStatus {
            supported: false,
            enabled: false,
        })
    }
}

pub(crate) fn register_autostart_tray(
    app: &tauri::AppHandle,
    item: tauri::menu::CheckMenuItem<tauri::Wry>,
) -> Result<(), String> {
    let state = app.state::<AutostartState>();
    let mut menu = state
        .menu
        .lock()
        .map_err(|_| "Startup setting unavailable")?;
    let value = status()?;
    item.set_checked(value.enabled)
        .map_err(|_| "Cannot update startup menu")?;
    item.set_enabled(value.supported)
        .map_err(|_| "Cannot update startup menu")?;
    *menu = Some(item);
    Ok(())
}

#[tauri::command]
pub(crate) fn get_autostart(app: tauri::AppHandle) -> Result<AutostartStatus, String> {
    let state = app.state::<AutostartState>();
    let menu = state
        .menu
        .lock()
        .map_err(|_| "Startup setting unavailable")?;
    let value = status()?;
    if let Some(item) = menu.as_ref() {
        let _ = item.set_checked(value.enabled);
    }
    Ok(value)
}

#[tauri::command]
pub(crate) fn set_autostart(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<AutostartStatus, String> {
    let state = app.state::<AutostartState>();
    // Serialize settings and tray mutations so neither can display a stale state.
    let menu = state
        .menu
        .lock()
        .map_err(|_| "Startup setting unavailable")?;
    #[cfg(target_os = "windows")]
    {
        let exe = std::env::current_exe().map_err(|_| "Cannot locate application")?;
        if !exe.is_file() {
            return Err("Application executable missing".into());
        }
        let command = startup_command(&exe)?;
        registry::write(if enabled { Some(&command) } else { None })?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
        return Err("Windows desktop only".into());
    }
    #[cfg(target_os = "windows")]
    {
        let value = status()?;
        if value.enabled != enabled {
            return Err("Startup setting was not applied".into());
        }
        if let Some(item) = menu.as_ref() {
            let _ = item.set_checked(value.enabled);
        }
        let _ = app.emit("toolknit-autostart-changed", value);
        Ok(value)
    }
}

pub(crate) fn toggle_autostart_tray(app: &tauri::AppHandle) {
    let result =
        get_autostart(app.clone()).and_then(|current| set_autostart(app.clone(), !current.enabled));
    if result.is_err() {
        let _ = app.emit("toolknit-autostart-error", ());
        log::warn!("Unable to update Windows startup setting");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn startup_argument_requires_exact_flag() {
        assert!(is_autostart_launch(vec![
            "app.exe".into(),
            "--autostart".into()
        ]));
        assert!(!is_autostart_launch(vec![
            "app.exe".into(),
            "--autostart=false".into()
        ]));
        assert!(!is_autostart_launch(vec!["--autostart".into()]));
    }
    #[test]
    fn startup_command_quotes_spaces_and_rejects_injection() {
        let path = std::env::temp_dir().join("ToolKnit test").join("app.exe");
        assert_eq!(
            startup_command(&path).unwrap(),
            format!("\"{}\" --autostart", path.to_str().unwrap())
        );
        for path in ["relative.exe", "C:\\app\" --other.exe", "C:\\app\n.exe"] {
            assert!(startup_command(std::path::Path::new(path)).is_err());
        }
    }
}
