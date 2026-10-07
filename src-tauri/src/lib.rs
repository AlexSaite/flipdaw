use std::path::{Component, Path, PathBuf};

use tauri::Manager;

/// Root of all app-owned storage: AppData\Roaming\dev.flipdaw.app
fn data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("no app data dir: {e}"))?;
  std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
  Ok(dir)
}

/// Reject anything that escapes the given root: no absolute rel paths, no `..`, no
/// Windows prefix/reparse tricks. Every fs command is scoped to the app data root.
fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
  let rel_path = Path::new(rel);
  if rel_path.is_absolute() {
    return Err(format!("absolute path not allowed: {rel}"));
  }
  let mut out = root.to_path_buf();
  for c in rel_path.components() {
    match c {
      Component::Normal(part) => out.push(part),
      Component::CurDir => {}
      _ => return Err(format!("path escapes the sandbox: {rel}")),
    }
  }
  if !out.starts_with(root) {
    return Err(format!("path escapes the sandbox: {rel}"));
  }
  Ok(out)
}

fn resolve(app: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
  let root = data_root(app)?;
  safe_join(&root, path)
}

#[tauri::command]
fn app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
  Ok(data_root(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn read_text(app: tauri::AppHandle, path: String) -> Result<Option<String>, String> {
  match std::fs::read_to_string(resolve(&app, &path)?) {
    Ok(s) => Ok(Some(s)),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
fn write_text(app: tauri::AppHandle, path: String, contents: String) -> Result<(), String> {
  let full = resolve(&app, &path)?;
  if let Some(parent) = full.parent() {
    std::fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
  }
  std::fs::write(&full, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_binary(app: tauri::AppHandle, path: String) -> Result<Option<Vec<u8>>, String> {
  match std::fs::read(resolve(&app, &path)?) {
    Ok(b) => Ok(Some(b)),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
fn write_binary(app: tauri::AppHandle, path: String, contents: Vec<u8>) -> Result<(), String> {
  let full = resolve(&app, &path)?;
  if let Some(parent) = full.parent() {
    std::fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
  }
  std::fs::write(&full, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn exists(app: tauri::AppHandle, path: String) -> Result<bool, String> {
  Ok(resolve(&app, &path)?.is_file())
}

/// Sub-folder names directly under `path` that look like projects (contain project.json).
#[tauri::command]
fn list_projects(app: tauri::AppHandle, path: String) -> Result<Vec<String>, String> {
  let dir = resolve(&app, &path)?;
  if !dir.is_dir() {
    return Ok(Vec::new());
  }
  let mut names = Vec::new();
  let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
  for entry in entries.flatten() {
    if !entry.path().is_dir() {
      continue;
    }
    if entry.path().join("project.json").is_file() {
      if let Some(name) = entry.file_name().to_str() {
        names.push(name.to_string());
      }
    }
  }
  names.sort();
  Ok(names)
}

/* ---- Outside the sandbox: folders the user picked in the native dialog ---- */

#[tauri::command]
fn external_read(path: String) -> Result<Option<Vec<u8>>, String> {
  match std::fs::read(&path) {
    Ok(b) => Ok(Some(b)),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
fn external_write(path: String, contents: Vec<u8>) -> Result<(), String> {
  let full = Path::new(&path);
  if let Some(parent) = full.parent() {
    std::fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
  }
  std::fs::write(full, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn external_exists(path: String) -> Result<bool, String> {
  Ok(Path::new(&path).is_file())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      app_data_dir,
      read_text,
      write_text,
      read_binary,
      write_binary,
      exists,
      list_projects,
      external_read,
      external_write,
      external_exists
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
