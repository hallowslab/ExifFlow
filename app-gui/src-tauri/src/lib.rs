use rftps::{config::Args as FtpArgs, FtpServer};
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
    relay_url: Option<String>,
    relay_device_name: Option<String>,
    relay_device_key: Option<String>,
    relay_messages: Option<bool>,
}

#[derive(Serialize)]
struct StartFtpResponse {
    message: String,
    password: Option<String>,
    address: String,
    relay_device_key: Option<String>,
}

#[derive(Serialize)]
struct RegisterRelayResponse {
    status: String,
    message: Option<String>,
    device_key: String,
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
        config: None,
    };

    let server = FtpServer::new(args).map_err(|e| e.to_string())?;
    let (_, _, actual_password) = server.config();

    let bus = rftps::event::EventBus::new();

    // Wire relay replication if configured
    let mut generated_relay_key = None;
    let mut server = server.with_event_bus(bus.clone());
    if let Some(ref url) = config.relay_url {
        let url = url.trim();
        if url.is_empty() {
            return Err("relay url is empty".into());
        }
        let device_key = match config.relay_device_key.clone() {
            Some(k) if !k.trim().is_empty() => k.trim().to_string(),
            _ => {
                let k = rftps::background::relay::generate_device_key();
                generated_relay_key = Some(k.clone());
                k
            }
        };
        let device_name = config
            .relay_device_name
            .clone()
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| "exifflow".into());
        let relay_cfg = rftps::background::RelayConfig {
            url: url.into(),
            device_key,
            device_name,
            approval_timeout_secs: 1800,
            ca_cert: None,
            danger_disable_cert_verify: false,
            relay_messages: config.relay_messages.unwrap_or(true),
        };
        let bg_config = rftps::background::BackgroundJobConfig {
            enabled: true,
            relay: Some(relay_cfg),
            ..Default::default()
        };
        server = server.with_background_config(bg_config);
    }

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

    let (_, mut event_rx) = bus.subscribe();

    let window_handle = window.clone();
    tokio::spawn(async move {
        while let Some(event) = event_rx.recv().await {
            match &event {
                rftps::event::FtpEvent::RelayStatus { status, message } => {
                    let _ = window_handle.emit(
                        "relay-status",
                        serde_json::json!({ "status": status, "message": message }),
                    );
                }
                other => {
                    let msg = match other {
                        rftps::event::FtpEvent::LoggedIn { username } => {
                            format!("User {} logged in", username)
                        }
                        rftps::event::FtpEvent::LoggedOut { username } => {
                            format!("User {} logged out", username)
                        }
                        rftps::event::FtpEvent::FileUploaded { username, path, .. } => {
                            format!("User {} uploaded file {}", username, path)
                        }
                        rftps::event::FtpEvent::FileDownloaded { username, path } => {
                            format!("User {} downloaded file {}", username, path)
                        }
                        rftps::event::FtpEvent::DirCreated { username, path } => {
                            format!("User {} created directory {}", username, path)
                        }
                        rftps::event::FtpEvent::DirRemoved { username, path } => {
                            format!("User {} removed directory {}", username, path)
                        }
                        rftps::event::FtpEvent::Renamed { username, from, to } => {
                            format!("User {} renamed {} to {}", username, from, to)
                        }
                        rftps::event::FtpEvent::Deleted { username, path } => {
                            format!("User {} deleted {}", username, path)
                        }
                        rftps::event::FtpEvent::RelayStatus { .. } => unreachable!(),
                    };
                    let _ = window_handle.emit("ftp-event", serde_json::json!({ "message": msg }));
                }
            }
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
        relay_device_key: generated_relay_key,
    })
}

#[tauri::command]
async fn register_relay_device(
    relay_url: String,
    device_name: String,
    device_key: Option<String>,
) -> Result<RegisterRelayResponse, String> {
    let url = relay_url.trim();
    if url.is_empty() {
        return Err("relay url is empty".into());
    }
    let key = match device_key {
        Some(k) if !k.trim().is_empty() => k.trim().to_string(),
        _ => rftps::background::relay::generate_device_key(),
    };
    let name = if device_name.trim().is_empty() {
        "exifflow".to_string()
    } else {
        device_name.trim().to_string()
    };
    let config = rftps::background::RelayConfig {
        url: url.into(),
        device_key: key.clone(),
        device_name: name,
        approval_timeout_secs: 30,
        ca_cert: None,
        danger_disable_cert_verify: false,
        relay_messages: true,
    };
    let client = rftps::background::relay::RelayClient::new(&config).map_err(|e| e.to_string())?;
    client.register().await.map_err(|e| e.to_string())?;

    match client.wait_for_approval().await {
        Ok(()) => {
            let token = client.authenticate().await.map_err(|e| e.to_string())?;
            client
                .fetch_credentials(&token)
                .await
                .map_err(|e| e.to_string())?;
            Ok(RegisterRelayResponse {
                status: "active".into(),
                message: Some("device approved, credentials armed".into()),
                device_key: key,
            })
        }
        Err(e) if matches!(e, rftps::background::relay::RelayError::PendingApproval) => {
            Ok(RegisterRelayResponse {
                status: "pending".into(),
                message: Some("device registered — approve it in the relay dashboard".into()),
                device_key: key,
            })
        }
        Err(e) => Ok(RegisterRelayResponse {
            status: "rejected".into(),
            message: Some(e.to_string()),
            device_key: key,
        }),
    }
}

#[tauri::command]
async fn get_server_info() -> Result<StartFtpResponse, String> {    let local_socket = rftps::resolve_local_ip().map_err(|e| e.to_string())?;
    Ok(StartFtpResponse {
        message: "Server address resolved".into(),
        password: None,
        address: local_socket.ip().to_string(),
        relay_device_key: None,
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
            register_relay_device,
            run_organization,
            stop_organization,
            run_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
