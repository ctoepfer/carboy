// Thin Rust side (ADR 0003): file I/O for native export/import and a test
// report hook. No domain logic: hashing and validation happen in the
// TypeScript core inside the webview.
use rusqlite::{types::ValueRef, Connection};
use serde_json::{Map, Value};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{Manager, State};

/// The Recipe Library's one connection (SqlDriver in `@carboy/recipe-library`).
/// PRAGMAs and transactions are per connection, so this is never pooled. It
/// passes SQL through and holds no domain logic.
#[derive(Default)]
struct LibraryConnection(Mutex<Option<Connection>>);

fn sql_params(params: &[Value]) -> Result<Vec<rusqlite::types::Value>, String> {
    params
        .iter()
        .map(|p| match p {
            Value::Null => Ok(rusqlite::types::Value::Null),
            Value::String(s) => Ok(rusqlite::types::Value::Text(s.clone())),
            Value::Number(n) => n
                .as_i64()
                .map(rusqlite::types::Value::Integer)
                .or_else(|| n.as_f64().map(rusqlite::types::Value::Real))
                .ok_or_else(|| "unsupported number".to_string()),
            _ => Err("a parameter is a string, a number, or null".to_string()),
        })
        .collect()
}

fn sql_column(v: ValueRef) -> Result<Value, String> {
    Ok(match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(r) => Value::from(r),
        ValueRef::Text(t) => Value::from(std::str::from_utf8(t).map_err(|e| e.to_string())?),
        ValueRef::Blob(_) => return Err("blob columns aren't used".to_string()),
    })
}

/// Opens the library file in the app's config directory, or a fresh connection
/// to it. Reports whether this is an Apple platform, which needs `fullfsync`.
/// `async` here and below: a sync command runs on the main thread, and an
/// fsync there would freeze the window.
#[tauri::command(async)]
fn library_open(app: tauri::AppHandle, state: State<LibraryConnection>, name: String) -> Result<Value, String> {
    let dir = test_dir().map_or_else(|| app.path().app_config_dir().map_err(|e| e.to_string()), Ok)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(dir.join(safe_name(&name)?)).map_err(|e| e.to_string())?;
    *state.0.lock().map_err(|e| e.to_string())? = Some(conn);
    Ok(serde_json::json!({ "apple": cfg!(target_vendor = "apple") }))
}

fn with_connection<T>(state: &State<LibraryConnection>, f: impl FnOnce(&Connection) -> Result<T, rusqlite::Error>) -> Result<T, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("the library isn't open")?;
    f(conn).map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn library_run(state: State<LibraryConnection>, sql: String, params: Vec<Value>) -> Result<(), String> {
    let values = sql_params(&params)?;
    with_connection(&state, |c| {
        // Some PRAGMAs return a row, so step through instead of execute().
        let mut stmt = c.prepare(&sql)?;
        let mut rows = stmt.query(rusqlite::params_from_iter(values))?;
        while rows.next()?.is_some() {}
        Ok(())
    })
}

#[tauri::command(async)]
fn library_all(state: State<LibraryConnection>, sql: String, params: Vec<Value>) -> Result<Vec<Map<String, Value>>, String> {
    let values = sql_params(&params)?;
    let mut column_error = None;
    let rows = with_connection(&state, |c| {
        let mut stmt = c.prepare(&sql)?;
        let names: Vec<String> = stmt.column_names().iter().map(|n| n.to_string()).collect();
        let mut rows = stmt.query(rusqlite::params_from_iter(values))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            let mut object = Map::new();
            for (i, name) in names.iter().enumerate() {
                match sql_column(row.get_ref(i)?) {
                    Ok(v) => {
                        object.insert(name.clone(), v);
                    }
                    Err(e) => column_error = Some(e),
                }
            }
            out.push(object);
        }
        Ok(out)
    })?;
    match column_error {
        Some(e) => Err(e),
        None => Ok(rows),
    }
}

/// $SPIKE_DATA_DIR: where a test run keeps everything, on every OS. macOS and
/// Windows ignore the XDG variables, so nothing else isolates a run from the
/// machine's normal spike data.
fn test_dir() -> Option<PathBuf> {
    std::env::var_os("SPIKE_DATA_DIR").map(PathBuf::from)
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = test_dir().map_or_else(|| app.path().app_data_dir().map_err(|e| e.to_string()), Ok)?;
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
fn report(app: tauri::AppHandle, json: String, keep_open: Option<bool>) -> Result<(), String> {
    if let Ok(path) = std::env::var("SPIKE_REPORT") {
        fs::write(path, json).map_err(|e| e.to_string())?;
    }
    // keep_open: a stall report leaves the stalled process running, so the
    // recovery harness can sample and hold it before killing it.
    if std::env::var("SPIKE_EXIT").as_deref() == Ok("1") && keep_open != Some(true) {
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
        .manage(LibraryConnection::default())
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
            // The webview's own profile (cache, storage; WebView2's EBWebView)
            // goes under $SPIKE_DATA_DIR too, or a test run writes into the
            // normal app folder. WebView2 and WebKitGTK honour this; WKWebView
            // ignores it (found by the Windows platform check of 5db261f).
            #[cfg(desktop)]
            let builder = match test_dir() {
                Some(dir) => builder.data_directory(dir.join("webview")),
                None => builder,
            };
            builder.build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![library_open, library_run, library_all, export_native, import_native, report, auto_mode, log, nav_test, spike_env])
        .run(tauri::generate_context!())
        .expect("error while running spike shell");
}
