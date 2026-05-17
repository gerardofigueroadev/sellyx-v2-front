// Evita que la ventana de PowerShell parpadee al ejecutar comandos.
// 0x08000000 = CREATE_NO_WINDOW (winbase.h).
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Lista las impresoras instaladas en Windows via PowerShell
#[tauri::command]
fn list_printers() -> Vec<String> {
    let mut cmd = std::process::Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-Command",
        "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress",
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output();

    match out {
        Ok(o) => {
            let raw = String::from_utf8_lossy(&o.stdout);
            let trimmed = raw.trim();
            // PowerShell devuelve un array JSON o un string simple si solo hay 1
            if trimmed.starts_with('[') {
                serde_json::from_str::<Vec<String>>(trimmed).unwrap_or_default()
            } else if trimmed.starts_with('"') {
                serde_json::from_str::<String>(trimmed)
                    .map(|s| vec![s])
                    .unwrap_or_default()
            } else if !trimmed.is_empty() {
                vec![trimmed.to_string()]
            } else {
                vec![]
            }
        }
        Err(_) => vec![],
    }
}

/// Establece la impresora predeterminada de Windows para que window.print() la use sin popup
#[tauri::command]
fn set_default_printer(name: String) -> bool {
    let script = format!(
        "(New-Object -ComObject WScript.Network).SetDefaultPrinter('{}')",
        name.replace('\'', "''")
    );
    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-Command", &script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.status().map(|s| s.success()).unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .invoke_handler(tauri::generate_handler![list_printers, set_default_printer])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
