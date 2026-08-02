# ExifFlow

ExifFlow is a **modular media pipeline** composed of multiple applications working together to ingest, transfer, organize, and manage media files based on EXIF metadata.

Rather than being a single binary, ExifFlow is a **workspace of interoperating components**:

* **timekeeper-rs** → EXIF-based media organizer
* **rftps** → FTP/FTPS server for file ingestion
* **app-gui** → Tauri-based desktop interface
* **relay** → Optional relay gateway for **rftps** replication feature
---

## Architecture Overview

> Note: Backup functionality is currently handled at the ExifFlow system level, not within individual components.

```
[ Client Devices ]
        │
        ▼
   rftps (FTP/FTPS)
        │
        ▼
 timekeeper-rs (EXIF sorting + backup)
        │
        ▼
   Organized Media Storage
        │
        ▼
     app-gui (Tauri frontend)
```

---

## Quick Start

The quickest path to a working pipeline is:

1. **Start the relay** (authorization gateway + dashboard)
2. **Start rftps** (FTP/FTPS server + optional replication client), or use the GUI
3. **Approve the device** in the relay dashboard
4. **Upload a file**

Each component has a dedicated setup section in its own README:

| Component | README | Setup covers |
| --------- | ------ | ------------ |
| Relay (Python/FastAPI) | [`relay/README.md`](relay/README.md) | venv, `.env`, master key, serve, storage credentials |
| rftps (Rust) | [`rftps/README.md`](rftps/README.md) | build features, FTP/FTPS, relay init, config |
| app-gui (Tauri) | [`app-gui/README.md`](app-gui/README.md) | dev mode, build, FTP + relay settings |

### End-to-end replication setup (3 components)

**1. Relay — the authorization gateway**

```bash
cd relay
cp .env.example .env
uv run relay keygen                      # prints a Fernet master key
# paste the key into .env as RELAY_MASTER_KEY, then:
uv run relay serve
```

This starts the API on `0.0.0.0:8700` (client devices talk to it) and the
admin dashboard on `127.0.0.1:8701`.

Set the replication target storage (the FTP server files get pushed to) at
<http://127.0.0.1:8701/dashboard/storage> or via CLI:

```bash
uv run relay storage set                 # prompts for ftp/ftps host/user/password/CA
```

**2. rftps — FTP/FTPS server + replication client**

```bash
cd rftps
cargo run --release --features relay -- relay init     # interactive; writes bg.json
cargo run --release --features relay -- --config bg.json --directory /path/to/upload-root
```

`relay init` generates a device key and writes `bg.json` with the relay URL,
device name, timeout, optional CA cert, and verbosity. Re-run it (or edit
`bg.json`) to change settings.

**3. Approve the device**

Open <http://127.0.0.1:8701/dashboard>, find the device, and click
**Approve**. Now upload any file to the FTP server — it is replicated to the
storage if configured in step 1.

> **Self-signed FTPS target?** Generate a cert with
> `cargo run --example gen_cert -- outdir 192.168.1.50` and paste the
> `cert.pem` contents into the relay storage **CA cert** field. Verification is
> never skipped — the CA just becomes a trusted root.

> **Only want the GUI?** See [`app-gui/README.md`](app-gui/README.md): set the
> Relay URL + device name in **Settings → Replication (Relay)**, click
> **REGISTER DEVICE**, and approve it in the dashboard.

---

## Components

### 1. Timekeeper (timekeeper-rs)

Media file organizer powered by EXIF metadata.

**Key capabilities:**

* EXIF-based sorting (date)
* Optional embedded ExifTool

**Repository:** [https://github.com/hallowslab/timekeeper-rs](https://github.com/hallowslab/timekeeper-rs)
**Workspace Path:** `./timekeeper-rs`

---

### 2. RFTPS

High-performance FTP/FTPS server built on `libunftp`.

**Key capabilities:**

* FTP + FTPS support
* Optional embedded TLS certificates

**Repository:** [https://github.com/hallowslab/rftps](https://github.com/hallowslab/rftps)
**Workspace Path:** `./rftps`

---

### 3. ExifFlow GUI (Tauri)

Desktop application providing a user interface over the pipeline, with a builtin backup functionality.

**Tech stack:**

* Tauri
* React
* Vite

**Path:** `./app-gui`

---

### 4. Relay (Replication Gateway)

Authorization gateway for zero-trust device replication. Devices register,
get approved on the dashboard, and receive encrypted FTP/FTPS storage
credentials.

**Tech stack:** Python, FastAPI, SQLite (aiosqlite), Jinja2/HTMX

**Path:** `./relay`
**Setup:** [`relay/README.md`](relay/README.md)

---

## Build Guide (Workspace)

### Prerequisites

* Rust (Edition 2024)
* Node.js + npm (for GUI)

---

### Building the app

```bash
cargo tauri build
```

> All components must be cloned into the workspace directory structure.

---

### Build Individual Components

#### Timekeeper

Standard build (external ExifTool):

```bash
cargo build --release
```

Bundled build (portable):

```bash
cargo build --release --features bundled
```

---

#### RFTPS

Standard build:

```bash
cargo build --release
```

With embedded certificates:

```bash
cargo build --release --features include_pem_files
```

---

#### GUI (Tauri)

```bash
cd app-gui
npm install
npm run tauri build
```

---

## Development Mode

Run the GUI with backend integration:

```bash
cd app-gui
npm run tauri dev
```

---

## Build Features Summary

| Component     | Feature             | Effect                   |
| ------------- | ------------------- | ------------------------ |
| timekeeper-rs | `bundled`           | Embeds ExifTool binaries |
| rftps         | `include_pem_files` | Embeds TLS certificates  |

---

## Badges



![Downloads](https://img.shields.io/github/downloads/hallowslab/ExifFlow/total)
![License](https://img.shields.io/github/license/hallowslab/ExifFlow)


---

## Workspace Structure

```
.
├── app-gui/
├── timekeeper-rs/
├── rftps/
├── relay/
├── docs/
│   └── build.md
├── Cargo.toml
└── README.md
```

---

## Design Principles

* Modular architecture (separation of concerns)
* Deterministic builds
* Manual control over external dependencies
* Portable deployment options

---

## Roadmap

* [ ] Modify components into git submodules
* [ ] Refactor backup functionality into it's own component

---

## Contributing

Open issues or submit PRs per component repository.

---

## License

