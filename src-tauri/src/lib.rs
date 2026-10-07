use base64::Engine as _;
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

/** Largest file we are willing to hand to the web layer (audio samples, thumbs). */
const MAX_FILE_BYTES: u64 = 512 * 1024 * 1024;

/// Folders the user granted through the native picker this session. The web layer can ask
/// for the dialog but can never register a root itself, so a compromised renderer cannot
/// turn `external_write` into an arbitrary-file-write primitive.
#[derive(Default)]
struct TrustedRoots(Mutex<HashSet<PathBuf>>);

fn data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("no app data dir: {e}"))?;
  std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
  Ok(dir)
}

/**
 * Absolute path with links resolved: canonicalizes the deepest existing ancestor and
 * re-appends the missing tail. `Path::starts_with` is purely lexical, so a trusted path
 * like `C:/music/sets/../..` or a junction inside the folder would otherwise slip past a
 * prefix check and let a write land anywhere on disk.
 */
fn real_path(p: &Path) -> PathBuf {
  let mut base = p.to_path_buf();
  let mut rest: Vec<std::ffi::OsString> = Vec::new();
  while let Some(parent) = base.parent().map(Path::to_path_buf) {
    if let Some(name) = base.file_name() {
      rest.push(name.to_os_string());
    }
    if parent.exists() {
      if let Ok(canon) = parent.canonicalize() {
        let mut out = canon;
        for part in rest.iter().rev() {
          out.push(part);
        }
        return out;
      }
      break;
    }
    base = parent;
  }
  p.to_path_buf()
}

/// Reject anything that escapes the given root: no absolute rel paths, no `..`, no prefixes.
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

fn b64_encode(bytes: &[u8]) -> String {
  base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Decodes base64 and enforces the size cap before anything touches the disk.
fn b64_decode(text: &str) -> Result<Vec<u8>, String> {
  let bytes = base64::engine::general_purpose::STANDARD
    .decode(text.as_bytes())
    .map_err(|_| "payload is not valid base64".to_string())?;
  check_len(bytes.len() as u64)?;
  Ok(bytes)
}

fn check_len(len: u64) -> Result<(), String> {
  if len > MAX_FILE_BYTES {
    return Err(format!("file too large: {len} bytes"));
  }
  Ok(())
}

/// Reads metadata for a file, mapping "missing" to None and enforcing the size cap.
fn file_meta(full: &Path) -> Result<Option<std::fs::Metadata>, String> {
  match std::fs::metadata(full) {
    Ok(m) => {
      check_len(m.len())?;
      Ok(Some(m))
    }
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

/** Resolve a path that must live under a folder the user picked in this session. */
fn resolve_trusted(app: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
  let requested = Path::new(path);
  if requested
    .components()
    .any(|c| matches!(c, Component::ParentDir))
  {
    return Err("parent directory segments are not allowed".to_string());
  }
  let real = real_path(requested);
  let roots = app.state::<TrustedRoots>();
  let allowed = roots
    .0
    .lock()
    .map_err(|_| "trusted-root lock poisoned".to_string())?;
  for root in allowed.iter() {
    if real.starts_with(root) {
      return Ok(real);
    }
  }
  Err("folder is not trusted: pick it with Open/Save as first".to_string())
}

/* ---- app data (sandboxed) ---- */

#[tauri::command]
fn app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
  Ok(data_root(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn read_text(app: tauri::AppHandle, path: String) -> Result<Option<String>, String> {
  let full = resolve(&app, &path)?;
  if file_meta(&full)?.is_none() {
    return Ok(None);
  }
  match std::fs::read_to_string(&full) {
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

/// Binary payloads travel as base64: a JSON array of bytes for a 10 MB WAV would mean tens
/// of millions of numbers to serialize, and base64 keeps the IPC payload small and lossless.
#[tauri::command]
fn read_binary(app: tauri::AppHandle, path: String) -> Result<Option<String>, String> {
  let full = resolve(&app, &path)?;
  if file_meta(&full)?.is_none() {
    return Ok(None);
  }
  match std::fs::read(&full) {
    Ok(b) => Ok(Some(b64_encode(&b))),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
fn write_binary(app: tauri::AppHandle, path: String, contents: String) -> Result<(), String> {
  let bytes = b64_decode(&contents)?;
  let full = resolve(&app, &path)?;
  if let Some(parent) = full.parent() {
    std::fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
  }
  std::fs::write(&full, bytes).map_err(|e| e.to_string())
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

/* ---- native folder picker: the only way to grant access outside app data ---- */

/// Opens the native folder picker and remembers the choice as a trusted root.
/// Returns the chosen absolute path, or null when the user cancels.
#[tauri::command]
async fn pick_folder(app: tauri::AppHandle, start_dir: Option<String>) -> Result<Option<String>, String> {
  let mut builder = app.dialog().file().set_title("Select a FlipDAW project folder");
  if let Some(dir) = start_dir.as_deref().filter(|d| !d.is_empty()) {
    let path = PathBuf::from(dir);
    if path.is_dir() {
      builder = builder.set_directory(path);
    }
  }

  let (tx, rx) = std::sync::mpsc::channel();
  builder.pick_folder(move |picked| {
    let _ = tx.send(picked);
  });

  let picked = rx
    .recv()
    .map_err(|_| "folder dialog failed".to_string())?
    .map(|p| p.into_path())
    .transpose()
    .map_err(|e| e.to_string())?;

  match picked {
    Some(dir) => {
      let canonical = dir.canonicalize().unwrap_or(dir);
      let roots = app.state::<TrustedRoots>();
      if let Ok(mut set) = roots.0.lock() {
        set.insert(canonical.clone());
      }
      Ok(Some(canonical.to_string_lossy().to_string()))
    }
    None => Ok(None),
  }
}

#[tauri::command]
fn external_read(app: tauri::AppHandle, path: String) -> Result<Option<String>, String> {
  let full = resolve_trusted(&app, &path)?;
  if file_meta(&full)?.is_none() {
    return Ok(None);
  }
  match std::fs::read(&full) {
    Ok(b) => Ok(Some(b64_encode(&b))),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
fn external_write(app: tauri::AppHandle, path: String, contents: String) -> Result<(), String> {
  let bytes = b64_decode(&contents)?;
  let full = resolve_trusted(&app, &path)?;
  if let Some(parent) = full.parent() {
    std::fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
  }
  std::fs::write(&full, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn external_exists(app: tauri::AppHandle, path: String) -> Result<bool, String> {
  Ok(resolve_trusted(&app, &path)?.is_file())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_dialog::init())
    .manage(TrustedRoots::default())
    .invoke_handler(tauri::generate_handler![
      app_data_dir,
      read_text,
      write_text,
      read_binary,
      write_binary,
      exists,
      list_projects,
      pick_folder,
      external_read,
      external_write,
      external_exists
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn safe_join_keeps_relative_paths_inside_the_root() {
    let root = Path::new("C:/appdata");
    assert_eq!(
      safe_join(root, "projects/demo/project.json").unwrap(),
      PathBuf::from("C:/appdata/projects/demo/project.json")
    );
    assert_eq!(safe_join(root, "./a/b.txt").unwrap(), PathBuf::from("C:/appdata/a/b.txt"));
    assert_eq!(safe_join(root, "").unwrap(), PathBuf::from("C:/appdata"));
  }

  #[test]
  fn safe_join_rejects_traversal_and_absolute_paths() {
    let root = Path::new("C:/appdata");
    assert!(safe_join(root, "../../Windows/System32/drivers/etc/hosts").is_err());
    assert!(safe_join(root, "a/../../b").is_err());
    assert!(safe_join(root, r"C:\Windows\System32\config").is_err());
    assert!(safe_join(root, r"\\server\share\file").is_err());
    assert!(safe_join(root, r"a\..\..\b").is_err());
  }

#[test]
  fn trusted_roots_gate_external_access() {
    // At runtime the root is canonicalized when the user picks the folder; mirror that here.
    let root = real_path(Path::new("C:/music/sets"));
    let state = TrustedRoots::default();
    state.0.lock().unwrap().insert(root.clone());
    let allowed: HashSet<PathBuf> = state.0.lock().unwrap().clone();
    let check = |p: &Path| {
      if p.components().any(|c| matches!(c, Component::ParentDir)) {
        return false;
      }
      let real = real_path(p);
      allowed.iter().any(|r| real.starts_with(r))
    };

    assert!(check(Path::new("C:/music/sets/project.json")));
    assert!(check(Path::new("C:/music/sets/nested/samples/a.wav")));
    // sibling folder with a shared prefix must not pass
    assert!(!check(Path::new("C:/music/sets-backup/project.json")));
    assert!(!check(Path::new("C:/Windows/System32/config/SAM")));
    // `..` must never escape a trusted root (Path::starts_with is lexical only)
    assert!(!check(Path::new("C:/music/sets/../../../Windows/notes")));
    assert!(!check(Path::new("C:/music/sets/..\\..\\Windows\\notes")));
  }

  #[test]
  fn real_path_collapses_parent_segments() {
    let p = real_path(Path::new("C:/music/sets/../../Windows/notes.txt"));
    let parts: Vec<String> = p
      .components()
      .map(|c| c.as_os_str().to_string_lossy().to_string())
      .collect();
    assert!(
      !parts.iter().any(|c| c == "sets"),
      "parent segments should be resolved away, got {parts:?}"
    );
    assert_eq!(parts.last().map(String::as_str), Some("notes.txt"));
  }

  #[test]
  fn file_size_cap_is_enforced() {
    assert!(check_len(1024).is_ok());
    assert!(check_len(MAX_FILE_BYTES).is_ok());
    assert!(check_len(MAX_FILE_BYTES + 1).is_err());
  }

  #[test]
  fn base64_payloads_round_trip_and_are_validated() {
    let bytes: Vec<u8> = (0..=255u8).collect();
    let text = b64_encode(&bytes);
    assert_eq!(b64_decode(&text).unwrap(), bytes);
    assert!(b64_decode("not base64!!").is_err());
    // oversized payloads are rejected before any disk write
    let huge = "A".repeat((MAX_FILE_BYTES as usize / 3 + 16) * 4);
    assert!(b64_decode(&huge).is_err());
  }
}
