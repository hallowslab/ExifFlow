# ExifFlow

ExifFlow is a **modular media pipeline** composed of multiple applications working together to ingest, transfer, organize, and manage media files based on EXIF metadata.

Rather than being a single binary, ExifFlow is a **workspace of interoperating components**:

* **timekeeper-rs** → EXIF-based media organizer
* **rftps** → FTP/FTPS server for file ingestion
* **app-gui** → Tauri-based desktop interface
* **access-broker** → Optional broker gateway for **rftps** replication feature
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

1. **Start the broker** (authorization gateway + dashboard)
2. **Start rftps** (FTP/FTPS server + optional replication client), or use the GUI
3. **Approve the device** in the broker dashboard
4. **Upload a file**

Each component has a dedicated setup section in its own README:

| Component | README | Setup covers |
| --------- | ------ | ------------ |
| Access Broker (Python/FastAPI) | [`access-broker/README.md`](access-broker/README.md) | venv, `.env`, master key, serve, storage credentials |
| rftps (Rust) | [`rftps/README.md`](rftps/README.md) | build features, FTP/FTPS, broker init, config |
| app-gui (Tauri) | [`app-gui/README.md`](app-gui/README.md) | dev mode, build, FTP + broker settings |

### End-to-end replication setup (3 components)

**1. Access Broker — the authorization gateway**

```bash
cd access-broker
cp .env.example .env
uv run access-broker keygen                  # prints a Fernet master key
# paste the key into .env as BROKER_MASTER_KEY, then:
uv run access-broker serve
```

This starts the API on `0.0.0.0:8700` (client devices talk to it) and the
admin dashboard on `127.0.0.1:8701`.

Set the replication target storage (the FTP server files get pushed to) at
<http://127.0.0.1:8701/dashboard/storage> or via CLI:

```bash
uv run access-broker storage set             # prompts for ftp/ftps host/user/password/CA
```

**2. rftps — FTP/FTPS server + replication client**

```bash
cd rftps
cargo run --release --features broker -- broker init     # interactive; writes bg.json
cargo run --release --features broker -- --config bg.json --directory /path/to/upload-root
```

`broker init` generates a device key and writes `bg.json` with the broker URL,
device name, timeout, optional CA cert, and verbosity. Re-run it (or edit
`bg.json`) to change settings.

**3. Approve the device**

Open <http://127.0.0.1:8701/dashboard>, find the device, and click
**Approve**. Now upload any file to the FTP server — it is replicated to the
storage if configured in step 1.

> **Self-signed FTPS target?** Generate a cert with
> `cargo run --example gen_cert -- outdir 192.168.1.50` and paste the
> `cert.pem` contents into the broker storage **CA cert** field. Verification is
> never skipped — the CA just becomes a trusted root.

> **Only want the GUI?** See [`app-gui/README.md`](app-gui/README.md): set the
> Broker URL + device name in **Settings → Replication (Broker)**, click
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

### 4. Access Broker (Replication Gateway)

Authorization gateway for zero-trust device replication. Devices register,
get approved on the dashboard, and receive encrypted FTP/FTPS storage
credentials.

**Tech stack:** Python, FastAPI, SQLite (aiosqlite), Jinja2/HTMX

**Path:** `./access-broker`
**Setup:** [`access-broker/README.md`](access-broker/README.md)

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
├── access-broker/
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

