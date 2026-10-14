// Thin Rust side (ADR 0003): file I/O for native export/import and a test
// report hook. No domain logic: hashing and validation happen in the
// TypeScript core inside the webview.
use std::{fs, path::PathBuf};
use tauri::Manager;

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn safe_name(name: &str) -> Result<&str, String> {
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.') {
        return Err("invalid file name".into());
    }
    Ok(name)
}

#[tauri::command]
fn export_native(app: tauri::AppHandle, name: String, text: String) -> Result<String, String> {
    let path = data_dir(&app)?.join(safe_name(&name)?);
    fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn import_native(app: tauri::AppHandle, name: String) -> Result<String, String> {
    fs::read_to_string(data_dir(&app)?.join(safe_name(&name)?)).map_err(|e| e.to_string())
}

/// Writes the webview's results to $SPIKE_REPORT and exits if $SPIKE_EXIT=1.
#[tauri::command]
fn report(app: tauri::AppHandle, json: String) -> Result<(), String> {
    if let Ok(path) = std::env::var("SPIKE_REPORT") {
        fs::write(path, json).map_err(|e| e.to_string())?;
    }
    if std::env::var("SPIKE_EXIT").as_deref() == Ok("1") {
        app.exit(0);
    }
    Ok(())
}

/// $SPIKE_NAV: a nav label for the checks page to click once its checks finish (navigation test).
#[tauri::command]
fn nav_test() -> Option<String> {
    std::env::var("SPIKE_NAV").ok()
}

/// Any SPIKE_* environment variable, for spike pages (e.g. SPIKE_STRESS).
#[tauri::command]
fn spike_env(name: String) -> Option<String> {
    if !name.starts_with("SPIKE_") {
        return None;
    }
    std::env::var(name).ok()
}

/// Webview errors and progress, printed to stderr for automated runs.
#[tauri::command]
fn log(message: String) {
    eprintln!("[webview] {message}");
}

/// True when $SPIKE_AUTO=1: the page runs its measurements and reports.
#[tauri::command]
fn auto_mode() -> bool {
    std::env::var("SPIKE_AUTO").as_deref() == Ok("1")
}

/// App entry point for desktop (`main.rs`) and mobile (Tauri's mobile entry).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // The window opens directly on $SPIKE_START (a page path such as
            // "graph-react/index.html"), so automated runs never navigate in-page.
            let start = std::env::var("SPIKE_START").unwrap_or_else(|_| "recipe.html".into());
            let builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App(start.into()));
            // Window size, title, and visibility exist on desktop only.
            #[cfg(desktop)]
            let builder = builder
                .title("Phase 1 shell spike")
                .inner_size(1100.0, 760.0)
                // SPIKE_HIDDEN=1: automated runs without a window on the desktop.
                .visible(std::env::var("SPIKE_HIDDEN").as_deref() != Ok("1"));
            builder.build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![export_native, import_native, report, auto_mode, log, nav_test, spike_env])
        .run(tauri::generate_context!())
        .expect("error while running spike shell");
}
