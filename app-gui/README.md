# ExifFlow GUI (Tauri + React + Vite)

Desktop interface for the ExifFlow pipeline: starts the rftps FTP/FTPS server,
organizes media by EXIF date, and replicates uploads through the ExifFlow
Relay.

## Prerequisites

* Node.js + npm
* Rust toolchain (for Tauri backend)
* Platform Tauri deps — see the
  [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

The backend links the workspace `rftps` crate with the `relay` feature, so the
workspace must be checked out with `rftps/` next to `app-gui/`.

## Setup

```bash
cd app-gui
npm install
```

## Development mode

```bash
npm run tauri dev
```

This runs the Vite dev server and launches the desktop app. The FTP server
starts inside the app (backend command `start_ftp_server`).

## Build a release

```bash
npm run tauri build
```

## Using the app

### 1. FTP server

In **FTP** tab: pick a storage directory, port, and user, then **START SERVER**.
A password is auto-generated and shown in the panel; FTPS is enabled by
default (embedded self-signed certs). Uploads land in the storage directory.

### 2. Replication via the Relay

Replication offloads FTP/FTPS target credentials to the relay gateway, so
nothing sensitive sits on the client.

1. Make sure a relay is running — see
   [`../relay/README.md`](../relay/README.md).
2. Open **Settings → Relay**.
3. Set **Relay URL** (e.g. `http://127.0.0.1:8700`) and a **Device Name**.
   **Device Key** is auto-generated if left blank.
4. Click **REGISTER DEVICE** — the device appears on the relay dashboard.
5. Approve it at `http://127.0.0.1:8701/dashboard` (and configure the storage
   target there if you haven't).
6. Start the FTP server and upload a file. A `RELAY: ACTIVE` badge confirms the
   connection, and the file replicates to the configured storage.

Optional toggles in the same section:

* **Print relay messages** — on by default; switch off for less verbose log
  output (the status badge still updates).

### 3. Organizer & backup

* **Organize**: sort files into `YYYY/MM/DD` by EXIF date (optional ExifTool).
* **Backup**: copy with deduplication (`size+time` fast or file-`hash` secure).

## Commands

| Invoke name | Purpose |
| ----------- | ------- |
| `start_ftp_server` | Start FTP/FTPS server with optional relay replication |
| `stop_ftp_server` | Stop the FTP server |
| `get_server_info` | Resolve the machine's LAN address for display |
| `register_relay_device` | Register the device at the relay and wait for approval |
| `run_organization` / `stop_organization` | Run/stop the EXIF organizer |
| `run_backup` | Run a deduplicated backup |

## Settings storage

Settings (including relay config) persist in WebView `localStorage` under the
key `exifflow.settings.v1`, scoped to the app identifier `com.exifflow.htl`
(e.g. `%LOCALAPPDATA%\com.exifflow.htl\...` on Windows).

## Tech stack

* Tauri 2
* React 19
* Vite
