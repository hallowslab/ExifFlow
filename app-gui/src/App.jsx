import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Server,
  Settings,
  FolderTree,
  HardDrive,
  Play,
  Square,
  Terminal,
  Activity,
  Copy,
  Trash2
} from 'lucide-react';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('ftp');
  const [ftpStatus, setFtpStatus] = useState('offline');
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logLimit, setLogLimit] = useState(20);
  const [isPowerUser, setIsPowerUser] = useState(false);
  const [progress, setProgress] = useState({ total: 0, processed: 0, errors: 0 });

  // FTP Config
  const [ftpConfig, setFtpConfig] = useState({
    address: '0.0.0.0',
    port: 21212,
    directory: 'C:/ExifFlow/Uploads',
    username: 'user',
    password: '',
    enable_ftps: true
  });
  const [serverInfo, setServerInfo] = useState({ address: '', generatedPassword: '' });

  // Organize Config
  const [orgConfig, setOrgConfig] = useState({
    source: 'C:/ExifFlow/Uploads',
    destination: 'C:/ExifFlow/Organized',
    dryRun: false,
    useCopy: true // Safe by default
  });

  // Backup Config
  const [backupConfig, setBackupConfig] = useState({
    source: 'C:/ExifFlow/Organized',
    destination: 'D:/Backups/ExifFlow',
    dedupe: 'size_time'
  });

  useEffect(() => {
    // Listen for progress updates from backend
    const unlistenOrg = listen('org-progress', (event) => {
      setProgress(event.payload);
      addLog(`Processed: ${event.payload.processed}/${event.payload.total} (Errors: ${event.payload.errors})`);
    });

    // Listen for FTP events
    const unlistenFtp = listen('ftp-event', (event) => {
      addLog(event.payload.message);
    });

    // Get initial server address
    invoke('get_server_info').then(res => {
      setServerInfo(prev => ({ ...prev, address: res.address }));
    }).catch(() => { });

    return () => {
      unlistenOrg.then((fn) => fn());
      unlistenFtp.then((fn) => fn());
    };
  }, []);

  const addLog = (msg) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, logLimit));
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const copyLogs = () => {
    const text = logs.join('\n');
    navigator.clipboard.writeText(text);
    addLog("Logs copied to clipboard");
  };

  const handleStartFtp = async () => {
    try {
      const res = await invoke('start_ftp_server', { config: ftpConfig });
      setFtpStatus('online');
      setServerInfo({ address: res.address, generatedPassword: res.password || '' });
      addLog(res.message);
    } catch (err) {
      addLog(`Error: ${err}`);
    }
  };

  const handleStopFtp = async () => {
    try {
      const res = await invoke('stop_ftp_server');
      setFtpStatus('offline');
      addLog(res);
    } catch (err) {
      addLog(`Error: ${err}`);
    }
  };

  const handleRunOrganize = async () => {
    if (isOrganizing) return;

    setIsOrganizing(true);
    setProgress({ total: 0, processed: 0, errors: 0 });

    try {
      addLog("Starting file organization...");
      const res = await invoke('run_organization', {
        config: {
          source: orgConfig.source,
          destination: orgConfig.destination,
          dry_run: orgConfig.dryRun,
          use_copy: orgConfig.useCopy
        }
      });
      addLog(res);
    } catch (err) {
      addLog(`Error: ${err}`);
    } finally {
      setIsOrganizing(false);
    }
  };

  const handleStopOrganize = async () => {
    try {
      addLog("Sending stop signal...");
      const res = await invoke('stop_organization');
      addLog(res);
    } catch (err) {
      addLog(`Error: ${err}`);
    }
  };

  const handleRunBackup = async () => {
    try {
      addLog("Starting backup...");
      const res = await invoke('run_backup', {
        source: backupConfig.source,
        destination: backupConfig.destination,
        dedupe: backupConfig.dedupe
      });
      addLog(res);
    } catch (err) {
      addLog(`Error: ${err}`);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'ftp':
        return (
          <div className="panel animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <h2>FTP Server Control</h2>
              <div className={`status-badge ${ftpStatus === 'online' ? 'status-online' : 'status-offline'}`}>
                <Activity size={14} /> {ftpStatus.toUpperCase()}
              </div>
            </div>

            {isPowerUser && (
              <div className="grid-2 animate-fade-in">
                <div className="form-group">
                  <label>Listen Address</label>
                  <input value={ftpConfig.address} onChange={e => setFtpConfig({ ...ftpConfig, address: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Port</label>
                  <input type="number" value={ftpConfig.port} onChange={e => setFtpConfig({ ...ftpConfig, port: parseInt(e.target.value) })} />
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Storage Directory</label>
              <input value={ftpConfig.directory} onChange={e => setFtpConfig({ ...ftpConfig, directory: e.target.value })} />
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Username</label>
                <input value={ftpConfig.username} onChange={e => setFtpConfig({ ...ftpConfig, username: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Password (Auto-gen if empty)</label>
                <input type="password" value={ftpConfig.password} onChange={e => setFtpConfig({ ...ftpConfig, password: e.target.value })} placeholder="******" />
              </div>
            </div>

            {isPowerUser && (
              <div className="form-group animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={ftpConfig.enable_ftps} onChange={e => setFtpConfig({ ...ftpConfig, enable_ftps: e.target.checked })} />
                <label style={{ marginBottom: 0 }}>Enable FTPS (SSL/TLS Encryption)</label>
              </div>
            )}

            {ftpStatus === 'online' && (
              <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(0, 255, 255, 0.05)', borderRadius: '8px', border: '1px solid var(--accent-cyan)' }}>
                <h4 style={{ color: 'var(--accent-cyan)', margin: '0 0 8px 0' }}>Connection Info</h4>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  <div>Address: <strong>{serverInfo.address}</strong></div>
                  <div>Port: <strong>{ftpConfig.port}</strong></div>
                  {serverInfo.generatedPassword && (
                    <div style={{ marginTop: '4px', color: 'var(--accent-cyan)' }}>
                      Access Password: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>{serverInfo.generatedPassword}</code>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
              {ftpStatus === 'offline' ? (
                <button className="btn btn-primary" onClick={handleStartFtp}>
                  <Play size={18} /> START SERVER
                </button>
              ) : (
                <button className="btn btn-stop" onClick={handleStopFtp}>
                  <Square size={18} /> STOP SERVER
                </button>
              )}
            </div>
          </div>
        );
      case 'organize':
        return (
          <div className="panel">
            <h2>Media Organizer</h2>
            <div className="form-group">
              <label>Source Directory</label>
              <input value={orgConfig.source} onChange={e => setOrgConfig({ ...orgConfig, source: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Destination Directory</label>
              <input value={orgConfig.destination} onChange={e => setOrgConfig({ ...orgConfig, destination: e.target.value })} />
            </div>
            <div className={`grid-${isPowerUser ? '2' : '1'}`}>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={orgConfig.useCopy} onChange={e => setOrgConfig({ ...orgConfig, useCopy: e.target.checked })} />
                <label style={{ marginBottom: 0 }}>Copy instead of move</label>
              </div>
              {isPowerUser && (
                <div className="form-group animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={orgConfig.dryRun} onChange={e => setOrgConfig({ ...orgConfig, dryRun: e.target.checked })} />
                  <label style={{ marginBottom: 0 }}>Dry Run (Preview)</label>
                </div>
              )}
            </div>

            {progress.total > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <label>Progress: {progress.processed} / {progress.total}</label>
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--accent-cyan)', width: `${(progress.processed / progress.total) * 100}%`, transition: 'width 0.3s' }}></div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className={`btn btn-primary ${isOrganizing ? 'btn-disabled' : ''}`}
                onClick={handleRunOrganize}
                disabled={isOrganizing}
                style={{ flex: 1 }}
              >
                {isOrganizing ? (
                  <>
                    <Activity className="animate-spin" size={18} /> PROCESSING...
                  </>
                ) : (
                  <>
                    <Play size={18} /> RUN ORGANIZATION
                  </>
                )}
              </button>

              {isOrganizing && (
                <button className="btn btn-stop" onClick={handleStopOrganize}>
                  <Square size={18} /> STOP
                </button>
              )}
            </div>
          </div>
        );
      case 'backup':
        return (
          <div className="panel">
            <h2>Backup & Mirror</h2>
            <div className="form-group">
              <label>Source directory (To backup)</label>
              <input value={backupConfig.source} onChange={e => setBackupConfig({ ...backupConfig, source: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Backup Destination</label>
              <input value={backupConfig.destination} onChange={e => setBackupConfig({ ...backupConfig, destination: e.target.value })} />
            </div>
            {isPowerUser && (
              <div className="form-group animate-fade-in">
                <label>Deduplication Method</label>
                <select value={backupConfig.dedupe} onChange={e => setBackupConfig({ ...backupConfig, dedupe: e.target.value })}>
                  <option value="size_time">Size & Modified Time (Fast)</option>
                  <option value="hash">File Hash (Secure)</option>
                </select>
              </div>
            )}
            <button className="btn btn-primary" onClick={handleRunBackup}>
              <HardDrive size={18} /> RUN BACKUP
            </button>
          </div>
        );
      case 'settings':
        return (
          <div className="panel">
            <h2>General Settings</h2>
            <div className="form-group">
              <label>ExifTool Path (Optional)</label>
              <input placeholder="Default: system path" />
            </div>
            <div className="form-group">
              <label>Theme</label>
              <div className="status-badge status-online">High-Tech Dark (Active)</div>
            </div>
            <div className="form-group">
              <label>Default Organization Method</label>
              <select
                value={orgConfig.useCopy ? 'copy' : 'move'}
                onChange={e => setOrgConfig({ ...orgConfig, useCopy: e.target.value === 'copy' })}
              >
                <option value="copy">Copy (Safe/Default)</option>
                <option value="move">Move (Destructive)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Activity Log Limit (Lines)</label>
              <input
                type="number"
                value={logLimit}
                onChange={e => setLogLimit(Math.min(500, Math.max(1, parseInt(e.target.value) || 1)))}
              />
            </div>
            <div className="form-group" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '20px', marginTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <label style={{ marginBottom: '4px' }}>Power User Mode</label>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Shows all settings for FTP, Organizer, and Backup.</p>
                </div>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={isPowerUser}
                  onChange={e => setIsPowerUser(e.target.checked)}
                />
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginTop: '24px' }}>SAVE SETTINGS</button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="sidebar">
        <div className="logo-area">
          <HardDrive color="var(--accent-cyan)" />
          <h1>ExifFlow</h1>
        </div>

        <div className={`nav-item ${activeTab === 'ftp' ? 'active' : ''}`} onClick={() => setActiveTab('ftp')}>
          <Server size={20} /> FTP Upload
        </div>
        <div className={`nav-item ${activeTab === 'organize' ? 'active' : ''}`} onClick={() => setActiveTab('organize')}>
          <FolderTree size={20} /> Organizer
        </div>
        <div className={`nav-item ${activeTab === 'backup' ? 'active' : ''}`} onClick={() => setActiveTab('backup')}>
          <HardDrive size={20} /> Backup
        </div>
        <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          <Settings size={20} /> Settings
        </div>

        <div style={{ marginTop: 'auto', padding: '20px 0', borderTop: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            <Activity size={12} /> System Ready
          </div>
        </div>
      </div>

      <main className="content">
        {renderContent()}

        <div className="log-area">
          <div className="log-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
              <Terminal size={14} /> ACTIVITY LOG
            </div>
            <div className="log-controls">
              <button className="icon-btn" title="Copy Logs" onClick={copyLogs}>
                <Copy size={14} />
              </button>
              <button className="icon-btn" title="Clear Logs" onClick={clearLogs}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <div className="log-content">
            {logs.map((log, i) => (
              <div key={i} className="log-entry">{log}</div>
            ))}
            {logs.length === 0 && <div style={{ color: '#333' }}>No activity recorded...</div>}
          </div>
        </div>
      </main>
    </>
  );
}

export default App;
