import React, { useState, useEffect, useRef } from 'react';
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
import SettingsGroup from './components/Accordion';
import './App.css';

const SETTINGS_STORAGE_KEY = 'exifflow.settings.v1';

const DEFAULT_APP_SETTINGS = {
  ftp: {
    uploadPath: 'C:/ExifFlow/Uploads',
    user: 'user',
    brokerUrl: '',
    brokerDeviceName: '',
    brokerDeviceKey: '',
    brokerMessages: false,
    brokerCertPath: '',
    immutableNaming: false
  },
  organize: {
    source: 'C:/ExifFlow/Uploads',
    destination: 'C:/ExifFlow/Organized',
    method: 'copy',
    locale: 'system'
  },
  backup: {
    source: 'C:/ExifFlow/Organized',
    destination: 'D:/Backups/ExifFlow'
  },
  tool: {
    exiftoolPath: ''
  },
  system: {
    logLimit: 50,
    powerUserMode: false
  }
};

function App() {
  const [activeTab, setActiveTab] = useState('ftp');
  const [ftpStatus, setFtpStatus] = useState('offline');
  const [brokerStatus, setBrokerStatus] = useState('idle');
  const [brokerSupported, setBrokerSupported] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logLimit, setLogLimit] = useState(DEFAULT_APP_SETTINGS.system.logLimit);
  const [isPowerUser, setIsPowerUser] = useState(DEFAULT_APP_SETTINGS.system.powerUserMode);
  const [appSettings, setAppSettings] = useState(DEFAULT_APP_SETTINGS);
  const [progress, setProgress] = useState({ total: 0, processed: 0, errors: 0 });
  const brokerMessagesRef = useRef(DEFAULT_APP_SETTINGS.ftp.brokerMessages);

  // FTP Config
  const [ftpConfig, setFtpConfig] = useState({
    address: '0.0.0.0',
    port: 21212,
    directory: DEFAULT_APP_SETTINGS.ftp.uploadPath,
    username: DEFAULT_APP_SETTINGS.ftp.user,
    password: '',
    enable_ftps: true,
    brokerUrl: DEFAULT_APP_SETTINGS.ftp.brokerUrl,
    brokerDeviceName: DEFAULT_APP_SETTINGS.ftp.brokerDeviceName,
    brokerDeviceKey: DEFAULT_APP_SETTINGS.ftp.brokerDeviceKey,
    brokerCertPath: DEFAULT_APP_SETTINGS.ftp.brokerCertPath,
    immutableNaming: DEFAULT_APP_SETTINGS.ftp.immutableNaming
  });
  const [serverInfo, setServerInfo] = useState({ address: '', generatedPassword: '' });

  // Organize Config
  const [orgConfig, setOrgConfig] = useState({
    source: DEFAULT_APP_SETTINGS.organize.source,
    destination: DEFAULT_APP_SETTINGS.organize.destination,
    dryRun: false,
    useCopy: DEFAULT_APP_SETTINGS.organize.method === 'copy', // Safe by default
    locale: DEFAULT_APP_SETTINGS.organize.locale
  });

  // Backup Config
  const [backupConfig, setBackupConfig] = useState({
    source: DEFAULT_APP_SETTINGS.backup.source,
    destination: DEFAULT_APP_SETTINGS.backup.destination,
    dedupe: 'size_time'
  });

  const applySettingsToConfigs = (settings) => {
    setFtpConfig((prev) => ({
      ...prev,
      directory: settings.ftp.uploadPath,
      username: settings.ftp.user,
      brokerUrl: settings.ftp.brokerUrl,
      brokerDeviceName: settings.ftp.brokerDeviceName,
      brokerDeviceKey: settings.ftp.brokerDeviceKey,
      brokerCertPath: settings.ftp.brokerCertPath,
      immutableNaming: settings.ftp.immutableNaming
    }));
    setOrgConfig((prev) => ({
      ...prev,
      source: settings.organize.source,
      destination: settings.organize.destination,
      useCopy: settings.organize.method === 'copy',
      locale: settings.organize.locale || 'system'
    }));
    setBackupConfig((prev) => ({
      ...prev,
      source: settings.backup.source,
      destination: settings.backup.destination
    }));
    setLogLimit(settings.system.logLimit);
    setIsPowerUser(settings.system.powerUserMode);
  };

  useEffect(() => {
    try {
      const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (storedSettings) {
        const parsed = JSON.parse(storedSettings);
        const mergedSettings = {
          ftp: { ...DEFAULT_APP_SETTINGS.ftp, ...(parsed.ftp || {}) },
          organize: { ...DEFAULT_APP_SETTINGS.organize, ...(parsed.organize || {}) },
          backup: { ...DEFAULT_APP_SETTINGS.backup, ...(parsed.backup || {}) },
          tool: { ...DEFAULT_APP_SETTINGS.tool, ...(parsed.tool || {}) },
          system: { ...DEFAULT_APP_SETTINGS.system, ...(parsed.system || {}) }
        };
        setAppSettings(mergedSettings);
        applySettingsToConfigs(mergedSettings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }

    // Listen for progress updates from backend
    const unlistenOrg = listen('org-progress', (event) => {
      setProgress(event.payload);
      addLog(`Processed: ${event.payload.processed}/${event.payload.total} (Errors: ${event.payload.errors})`);
    });

    // Listen for FTP events
    const unlistenFtp = listen('ftp-event', (event) => {
      addLog(event.payload.message);
    });

    // Listen for broker status events
    const unlistenBroker = listen('broker-status', (event) => {
      const { status, message } = event.payload;
      setBrokerStatus(status);
      if (brokerMessagesRef.current) {
        addLog(`Broker: ${message || status}`);
      }
    });

    // Listen for replication results (shown only when printing is on)
    const unlistenReplication = listen('replication', (event) => {
      if (!brokerMessagesRef.current) return;
      const { path, ok, error } = event.payload;
      if (ok) {
        addLog(`Broker: replicated ${path}`);
      } else {
        addLog(`Broker: replication failed ${path}: ${error}`);
      }
    });

    // Get initial server address + capability flags
    invoke('get_server_info').then(res => {
      setServerInfo(prev => ({ ...prev, address: res.address }));
      setBrokerSupported(res.broker_supported !== false);
    }).catch(() => { });

    return () => {
      unlistenOrg.then((fn) => fn());
      unlistenFtp.then((fn) => fn());
      unlistenBroker.then((fn) => fn());
      unlistenReplication.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    brokerMessagesRef.current = appSettings.ftp.brokerMessages;
  }, [appSettings.ftp.brokerMessages]);

  const updateAppSettings = (section, field, value) => {
    setAppSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleSaveSettings = () => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(appSettings));
      applySettingsToConfigs(appSettings);
      addLog('Settings saved and applied');
    } catch (error) {
      addLog(`Failed to save settings: ${error}`);
    }
  };

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
      const res = await invoke('start_ftp_server', {
        config: {
          ...ftpConfig,
          broker_url: appSettings.ftp.brokerUrl || null,
          broker_device_name: appSettings.ftp.brokerDeviceName,
          broker_device_key: appSettings.ftp.brokerDeviceKey,
          broker_messages: appSettings.ftp.brokerMessages,
          broker_cert_path: appSettings.ftp.brokerCertPath || null,
          immutable_naming: appSettings.ftp.immutableNaming
        }
      });
      setFtpStatus('online');
      setServerInfo({ address: res.address, generatedPassword: res.password || '' });
      if (res.broker_device_key) {
        setFtpConfig((prev) => ({ ...prev, brokerDeviceKey: res.broker_device_key }));
        setAppSettings((prev) => ({
          ...prev,
          ftp: { ...prev.ftp, brokerDeviceKey: res.broker_device_key }
        }));
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
          ...appSettings,
          ftp: { ...appSettings.ftp, brokerDeviceKey: res.broker_device_key }
        }));
        addLog(`Generated broker device key: ${res.broker_device_key.slice(0, 12)}...`);
      }
      addLog(res.message);
    } catch (err) {
      addLog(`Error: ${err}`);
    }
  };

  const handleRegisterBroker = async () => {
    if (isRegistering) return;

    setIsRegistering(true);
    setBrokerStatus('registering');
    try {
      const res = await invoke('register_broker_device', {
        brokerUrl: appSettings.ftp.brokerUrl,
        deviceName: appSettings.ftp.brokerDeviceName,
        deviceKey: appSettings.ftp.brokerDeviceKey || null,
        brokerCertPath: appSettings.ftp.brokerCertPath || null,
        immutableNaming: appSettings.ftp.immutableNaming
      });
      if (res.device_key && res.device_key !== appSettings.ftp.brokerDeviceKey) {
        updateAppSettings('ftp', 'brokerDeviceKey', res.device_key);
        setFtpConfig((prev) => ({ ...prev, brokerDeviceKey: res.device_key }));
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
          ...appSettings,
          ftp: { ...appSettings.ftp, brokerDeviceKey: res.device_key }
        }));
        addLog(`Generated broker device key: ${res.device_key.slice(0, 12)}...`);
      }
      setBrokerStatus(res.status);
      addLog(`Broker: ${res.message || res.status}`);
    } catch (err) {
      setBrokerStatus('error');
      addLog(`Error: ${err}`);
    } finally {
      setIsRegistering(false);
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
          use_copy: orgConfig.useCopy,
          locale: orgConfig.locale || 'system'
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
              <div className="form-group animate-fade-in">
                <label>Listen Address</label>
                <input value={ftpConfig.address} onChange={e => setFtpConfig({ ...ftpConfig, address: e.target.value })} />
              </div>
            )}

            <div className="grid-2">
              <div className="form-group">
                <label>Port</label>
                <input type="number" value={ftpConfig.port} onChange={e => setFtpConfig({ ...ftpConfig, port: parseInt(e.target.value) })} />
              </div>
              <div className="form-group">
                <label>Storage Directory</label>
                <input value={ftpConfig.directory} onChange={e => setFtpConfig({ ...ftpConfig, directory: e.target.value })} />
              </div>
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

            <SettingsGroup title="FTP Settings">
              <div className="form-group">
                <label>Default Upload Path</label>
                <input
                  value={appSettings.ftp.uploadPath}
                  onChange={(e) => updateAppSettings('ftp', 'uploadPath', e.target.value)}
                  placeholder="Default: C:/ExifFlow/Uploads"
                />
              </div>

              <div className="form-group">
                <label>Default User</label>
                <input
                  value={appSettings.ftp.user}
                  onChange={(e) => updateAppSettings('ftp', 'user', e.target.value)}
                  placeholder="user"
                />
              </div>
            </SettingsGroup>

            {brokerSupported && (
            <SettingsGroup title="Broker Settings">
              <div className="form-group">
                <label>Broker URL</label>
                <input
                  value={appSettings.ftp.brokerUrl}
                  onChange={(e) => updateAppSettings('ftp', 'brokerUrl', e.target.value)}
                  placeholder="e.g. http://127.0.0.1:8700"
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Device Name</label>
                  <input
                    value={appSettings.ftp.brokerDeviceName}
                    onChange={(e) => updateAppSettings('ftp', 'brokerDeviceName', e.target.value)}
                    placeholder="e.g. studio-pc"
                  />
                </div>
                <div className="form-group">
                  <label>Device Key (auto-generated if empty)</label>
                  <input
                    value={appSettings.ftp.brokerDeviceKey}
                    onChange={(e) => updateAppSettings('ftp', 'brokerDeviceKey', e.target.value)}
                    placeholder="hex seed from `rftps broker keygen`"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Broker Certificate Path (optional - uses bundled cert if empty)</label>
                <input
                  value={appSettings.ftp.brokerCertPath}
                  onChange={(e) => updateAppSettings('ftp', 'brokerCertPath', e.target.value)}
                  placeholder="e.g. C:/ExifFlow/cert.pem"
                />
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={appSettings.ftp.immutableNaming}
                    onChange={(e) => updateAppSettings('ftp', 'immutableNaming', e.target.checked)}
                  />
                  <span>Immutable naming (prepend UUID to filenames to prevent overwrites)</span>
                </label>
              </div>

              <div style={{ marginTop: '4px' }}>
                <button
                  className={`btn btn-primary ${isRegistering ? 'btn-disabled' : ''}`}
                  onClick={handleRegisterBroker}
                  disabled={isRegistering}
                >
                  {isRegistering ? (
                    <>
                      <Activity className="animate-spin" size={18} /> REGISTERING...
                    </>
                  ) : (
                    <>
                      <Play size={18} /> REGISTER DEVICE
                    </>
                  )}
                </button>
                {brokerStatus !== 'idle' && (
                  <div className={`status-badge ${brokerStatus === 'approved' || brokerStatus === 'active' ? 'status-online' : brokerStatus === 'rejected' || brokerStatus === 'error' ? 'status-offline' : ''}`} style={{ marginTop: '10px' }}>
                    <Activity size={14} /> BROKER: {brokerStatus.toUpperCase()}
                  </div>
                )}
              </div>

              <p className="hint" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '12px' }}>
                Registers the device at the broker and waits (up to 30s) for approval.
              </p>

              { isPowerUser && (
                  <div className="form-group" style={{ marginTop: '14px' }}>
                    <label>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={appSettings.ftp.brokerMessages}
                        onChange={(e) => updateAppSettings('ftp', 'brokerMessages', e.target.checked)}
                      />
                      <text style={{ marginLeft: '8px' }}>Print broker messages</text>
                    </label>
                    <p className="hint" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '6px' }}>
                      Prints broker status and per-file replication results (success or failure) to the log console. Off = no broker messages.
                    </p>
                  </div>
              )}
            </SettingsGroup>
            )}

            <SettingsGroup title="Organizer Settings">
              <div className="form-group">
                <label>Default Organized Source</label>
                <input
                  value={appSettings.organize.source}
                  onChange={(e) => updateAppSettings('organize', 'source', e.target.value)}
                  placeholder="Default: C:/ExifFlow/Uploads"
                />
              </div>

              <div className="form-group">
                <label>Default Organized Destination</label>
                <input
                  value={appSettings.organize.destination}
                  onChange={(e) => updateAppSettings('organize', 'destination', e.target.value)}
                  placeholder="Default: C:/ExifFlow/Organized"
                />
              </div>

              <div className="form-group">
                <label>Default Organization Method</label>
                <select
                  value={appSettings.organize.method}
                  onChange={(e) =>
                    updateAppSettings('organize', 'method', e.target.value)
                  }
                >
                  <option value="copy">Copy (Safe/Default)</option>
                  <option value="move">Move (Destructive)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Month Language</label>
                <select
                  value={appSettings.organize.locale || 'system'}
                  onChange={(e) =>
                    updateAppSettings('organize', 'locale', e.target.value)
                  }
                >
                  <option value="system">System</option>
                  <option value="en">English</option>
                  <option value="pt">Português</option>
                </select>
                <p className="hint" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '6px' }}>
                  Month names in the destination folders (e.g. 2025/07-July vs 2025/07-Julho). System follows the OS language.
                </p>
              </div>
            </SettingsGroup>

            <SettingsGroup title="Backup Settings">
              <div className="form-group">
                <label>Default Backup Source</label>
                <input
                  value={appSettings.backup.source}
                  onChange={(e) => updateAppSettings('backup', 'source', e.target.value)}
                  placeholder="Default: C:/ExifFlow/Organized"
                />
              </div>

              <div className="form-group">
                <label>Default Backup Destination</label>
                <input
                  value={appSettings.backup.destination}
                  onChange={(e) => updateAppSettings('backup', 'destination', e.target.value)}
                  placeholder="Default: C:/ExifFlow/Backup"
                />
              </div>
            </SettingsGroup>

            <SettingsGroup title="Tool Settings">
              <div className="form-group">
                <label>ExifTool Path (Optional)</label>
                <input
                  value={appSettings.tool.exiftoolPath}
                  onChange={(e) => updateAppSettings('tool', 'exiftoolPath', e.target.value)}
                  placeholder="Default: system path"
                />
              </div>
            </SettingsGroup>

            <SettingsGroup title="System">
              <div className="form-group">
                <label>Theme</label>
                <div className="status-badge status-online">
                  High-Tech Dark (Active)
                </div>
              </div>

              <div className="form-group">
                <label>Activity Log Limit (Lines)</label>
                <input
                  type="number"
                  value={appSettings.system.logLimit}
                  onChange={(e) =>
                    updateAppSettings(
                      'system',
                      'logLimit',
                      Math.min(500, Math.max(1, parseInt(e.target.value, 10) || 1))
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label>Power User Mode</label>
                <input
                  type="checkbox"
                  checked={appSettings.system.powerUserMode}
                  onChange={(e) => updateAppSettings('system', 'powerUserMode', e.target.checked)}
                />
              </div>
            </SettingsGroup>

            <button className="btn btn-primary" style={{ marginTop: "24px" }} onClick={handleSaveSettings}>
              SAVE SETTINGS
            </button>
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
