use rftps::{config::Args as FtpArgs, FtpEvent, FtpServer};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Emitter, State};
use timekeeper::{stats::Stats, Organizer};
use tokio::sync::{oneshot, Mutex};

mod backup;
use backup::{BackupManager, DeduplicationMethod};

// App State
struct AppState {
    ftp_stop_tx: Mutex<Option<oneshot::Sender<()>>>,
    organizer_running: Mutex<bool>,
    organizer_terminate: Mutex<Option<Arc<std::sync::atomic::AtomicBool>>>,
}

#[derive(Serialize, Deserialize, Clone)]
struct FtpConfig {
    address: String,
    port: u16,
    directory: String,
    username: String,
    password: Option<String>,
    enable_ftps: Option<bool>,
}

#[derive(Serialize)]
struct StartFtpResponse {
    message: String,
    password: Option<String>,
    address: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct OrganizeConfig {
    source: String,
    destination: String,
    dry_run: bool,
    use_copy: bool,
    exiftool_path: Option<String>,
}

// Commands
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
async fn start_ftp_server(
    window: tauri::Window,
    state: State<'_, AppState>,
    mut config: FtpConfig,
) -> Result<StartFtpResponse, String> {
    let mut stop_tx_lock = state.ftp_stop_tx.lock().await;
    if stop_tx_lock.is_some() {
        return Err("FTP server is already running".into());
    }

    // Generate password if missing or empty
    let mut generated_password = None;
    if config.password.as_ref().map_or(true, |p| p.is_empty()) {
        let p = rftps::utils::generate_random_string(10);
        config.password = Some(p.clone());
        generated_password = Some(p);
    }

    let args = FtpArgs {
        address: config.address.clone(),
        port: config.port,
        directory: config.directory.clone(),
        username: config.username.clone(),
        password: config.password.clone(),
        enable_ftps: config.enable_ftps,
        cert_pem: None,
        key_pem: None,
    };

    let server = FtpServer::new(args).map_err(|e| e.to_string())?;
    let (_, _, actual_password) = server.config();

    // Resolve local address for display
    let local_socket =
        rftps::resolve_local_ip().unwrap_or_else(|_| "0.0.0.0:21212".parse().unwrap());
    let display_address = local_socket.ip().to_string();

    let message = format!(
        "FTP server started on {} | Port: {} | User: {}",
        display_address, config.port, config.username
    );

    let (tx, rx) = oneshot::channel();
    *stop_tx_lock = Some(tx);

    let (event_tx, mut event_rx) = tokio::sync::mpsc::unbounded_channel();
    let server = server.with_event_tx(event_tx);

    let window_handle = window.clone();
    tokio::spawn(async move {
        while let Some(event) = event_rx.recv().await {
            let msg = match &event {
                FtpEvent::LoggedIn { username } => format!("User {} logged in", username),
                FtpEvent::LoggedOut { username } => format!("User {} logged out", username),
                FtpEvent::FileUpload { username, path } => {
                    format!("User {} uploaded file {}", username, path)
                }
                FtpEvent::FileDownload { username, path } => {
                    format!("User {} downloaded file {}", username, path)
                }
                FtpEvent::DirCreated { username, path } => {
                    format!("User {} created directory {}", username, path)
                }
                FtpEvent::DirRemoved { username, path } => {
                    format!("User {} removed directory {}", username, path)
                }
                FtpEvent::Renamed {
                    username,
                    from,
                    to,
                } => format!("User {} renamed {} to {}", username, from, to),
                FtpEvent::Deleted { username, path } => {
                    format!("User {} deleted {}", username, path)
                }
            };
            let _ = window_handle.emit("ftp-event", serde_json::json!({ "message": msg }));
        }
    });

    tokio::spawn(async move {
        if let Err(e) = server.run(rx).await {
            eprintln!("FTP server error: {}", e);
        }
    });

    Ok(StartFtpResponse {
        message,
        password: generated_password,
        address: display_address,
    })
}

#[tauri::command]
async fn get_server_info() -> Result<StartFtpResponse, String> {
    let local_socket = rftps::resolve_local_ip().map_err(|e| e.to_string())?;
    Ok(StartFtpResponse {
        message: "Server address resolved".into(),
        password: None,
        address: local_socket.ip().to_string(),
    })
}

#[tauri::command]
async fn stop_ftp_server(state: State<'_, AppState>) -> Result<String, String> {
    let mut stop_tx_lock = state.ftp_stop_tx.lock().await;
    if let Some(tx) = stop_tx_lock.take() {
        let _ = tx.send(());
        Ok("FTP server stopped".into())
    } else {
        Err("FTP server is not running".into())
    }
}

#[tauri::command]
async fn stop_organization(state: State<'_, AppState>) -> Result<String, String> {
    let terminate_lock = state.organizer_terminate.lock().await;
    if let Some(flag) = terminate_lock.as_ref() {
        flag.store(true, std::sync::atomic::Ordering::SeqCst);
        Ok("Organization stop signal sent".into())
    } else {
        Err("No organization process found to stop".into())
    }
}

#[tauri::command]
async fn run_organization(
    window: tauri::Window,
    state: State<'_, AppState>,
    config: OrganizeConfig,
) -> Result<String, String> {
    let mut running = state.organizer_running.lock().await;
    if *running {
        return Err("Organization is already in progress".into());
    }
    *running = true;
    drop(running);

    let source = std::path::PathBuf::from(config.source);
    let destination = std::path::PathBuf::from(config.destination);
    let mut organizer = Organizer::new(source, destination, config.dry_run).with_copy(config.use_copy);

    if let Some(p) = config.exiftool_path {
        organizer = organizer.with_exiftool(std::path::PathBuf::from(p));
    }

    let stats = Arc::new(Stats::new());
    let terminate_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
    
    // Store terminate flag for stop command
    *state.organizer_terminate.lock().await = Some(Arc::clone(&terminate_flag));
    
    let (done_tx, mut done_rx) = tokio::sync::oneshot::channel::<()>();

    // Spawn progress monitor
    let timer_stats = Arc::clone(&stats);
    let timer_window = window.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = tokio::time::sleep(tokio::time::Duration::from_millis(500)) => {
                    let total = timer_stats.total.load(std::sync::atomic::Ordering::SeqCst);
                    let processed = timer_stats.processed.load(std::sync::atomic::Ordering::SeqCst);
                    let errors = timer_stats.errors.load(std::sync::atomic::Ordering::SeqCst);

                    let _ = timer_window.emit(
                        "org-progress",
                        serde_json::json!({
                            "total": total,
                            "processed": processed,
                            "errors": errors
                        }),
                    );
                }
                _ = &mut done_rx => break,
            }
        }
    });

    // Run in a blocking task
    let result = tokio::task::spawn_blocking(move || {
        organizer
            .run(stats, terminate_flag)
            .map_err(|e| e.to_string())
    })
    .await;

    // Ensure flag is reset and monitor is stopped
    *state.organizer_running.lock().await = false;
    *state.organizer_terminate.lock().await = None;
    let _ = done_tx.send(());

    let result = result.map_err(|e| e.to_string())?;

    match result {
        Ok(_) => Ok("Organization complete".into()),
        Err(e) => Err(e),
    }
}

#[tauri::command]
async fn run_backup(source: String, destination: String, dedupe: String) -> Result<String, String> {
    let method = match dedupe.as_str() {
        "hash" => DeduplicationMethod::Hash,
        _ => DeduplicationMethod::SizeAndTime,
    };

    let manager = BackupManager::new(method);
    let src_path = std::path::PathBuf::from(source);
    let dest_path = std::path::PathBuf::from(destination);

    tokio::task::spawn_blocking(move || manager.backup(&src_path, &dest_path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    Ok("Backup complete".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            ftp_stop_tx: Mutex::new(None),
            organizer_running: Mutex::new(false),
            organizer_terminate: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            start_ftp_server,
            stop_ftp_server,
            get_server_info,
            run_organization,
            stop_organization,
            run_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
