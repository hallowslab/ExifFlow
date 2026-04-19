# ExifFlow

ExifFlow is a **modular media pipeline** composed of multiple applications working together to ingest, transfer, organize, and manage media files based on EXIF metadata.

Rather than being a single binary, ExifFlow is a **workspace of interoperating components**:

* **timekeeper-rs** → EXIF-based media organizer
* **rftps** → FTP/FTPS server for file ingestion
* **app-gui** → Tauri-based desktop interface

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

