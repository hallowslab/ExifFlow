# ExifFlow Workspace Build Guide

This document explains how to build the entire ExifFlow workspace or its individual components.

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (Edition 2024)
- [Node.js & npm](https://nodejs.org/) (Required for the Tauri GUI)

## Building the Entire Workspace

You can build all members of the workspace (including dependencies) using:

```bash
cargo build --release
```

**Note**: Make sure to clone the components as into the worspace directory as specified in the [Component Documentation](#component-documentation) section.

## Component Documentation

The workspace is divided into several projects, each with its own specialized build options:

### 1. Media Organizer (Timekeeper)
Handles EXIF-based file sorting and organization.
- [**Github Repo**](https://github.com/hallowslab/timekeeper-rs)
- **Path:** `./timekeeper-rs`
- **Key Feature:** `bundled` (embeds ExifTool)
- [Full Build Details](../timekeeper-rs/docs/build.md)

### 2. FTP Server (RFTPS)
Provides the backend for remote transfers.
- [**Github Repo**](https://github.com/hallowslab/rftps)
- **Path:** `./rftps`
- **Key Feature:** `include_pem_files` (embeds SSL/TLS certificates)
- [Full Build Details](../rftps/docs/build.md)

### 3. ExifFlow GUI (Tauri App)
The primary user interface built with Vite, React, and Tauri.
- **Path:** `./app-gui`
- **Build command:**
  ```bash
  cd app-gui
  npm install
  npm run tauri build
  ```

## Summary of Build Features

| Component | Feature | Effect |
|-----------|---------|--------|
| `timekeeper` | `bundled` | Embeds ExifTool binaries into the resulting executable. |
| `rftps` | `include_pem_files` | Embeds `cert.pem` and `key.pem` for standalone FTPS support. |

## Development

To run the full application in development mode:

```bash
cd app-gui
npm run tauri dev
```
