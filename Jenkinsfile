pipeline {
    agent any

    environment {
        RUST_BACKTRACE = "1"

        LINUX_TARGET = "x86_64-unknown-linux-gnu"
        WINDOWS_TARGET = "x86_64-pc-windows-msvc"
        MAC_TARGET = "aarch64-apple-darwin"

        LINUX_DIR = "target/linux"
        WINDOWS_DIR = "target/windows"
        MAC_DIR = "target/mac"

        CERT_DIR = "certs"
        EXIFTOOL_DIR = "/opt/code-deps/exiftool"

        DEP1_REPO = "https://github.com/hallowslab/rftps.git"
        DEP2_REPO = "https://github.com/hallowslab/timekeeper-rs.git"
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Prepare Workspace') {
            steps {
                sh '''
                set -e

                rm -rf dist target rftps timekeeper-rs

                git clone "$DEP1_REPO" rftps
                git clone "$DEP2_REPO" timekeeper-rs

                mkdir -p certs
                '''
            }
        }

        stage('Install Toolchains') {
            steps {
                sh '''
                set -e

                . "$HOME/.cargo/env"
                rustup target add x86_64-pc-windows-gnu
                cargo install --locked cargo-xwin

                cargo --version
                gcc --version
                '''
            }
        }

        stage('Generate Certs (RFTPS only)') {
            steps {
                sh '''
                set -e

                mkdir -p certs

                openssl req -x509 -newkey rsa:2048 -nodes \
                    -keyout certs/key.pem \
                    -out certs/cert.pem \
                    -days 365 \
                    -subj "/CN=exifflow.internal"

                cp certs/cert.pem rftps/cert.pem
                cp certs/key.pem rftps/key.pem
                '''
            }
        }

        /* -------------------- LINUX BUILD -------------------- */

        stage('Build Linux') {
            steps {
                nodejs('Node-24') {
                    sh '''
                    set -e
                    . "$HOME/.cargo/env"

                    export CARGO_TARGET_DIR="$LINUX_DIR"

                    cd app-gui
                    npm ci
                    npm run build
                    cd ..

                    cargo tauri build --target $LINUX_TARGET
                    '''
                }
            }
        }

        stage('Package Linux') {
            steps {
                sh '''
                set -e

                mkdir -p dist/linux dist/final

                BUNDLE_DIR=$(find app-gui/src-tauri/target/linux -type d -path "*/release/bundle" | head -n 1)

                if [ -z "$BUNDLE_DIR" ]; then
                    echo "Linux bundle not found"
                    exit 1
                fi

                cp -r "$BUNDLE_DIR"/* dist/linux/

                tar -czf dist/final/ExifFlow-linux.tar.gz -C dist/linux .
                '''
            }
        }

        /* -------------------- WINDOWS BUILD -------------------- */

        stage('Prepare ExifTool (Windows only)') {
            steps {
                sh '''
                set -e

                mkdir -p timekeeper-rs/bin/windows/exiftool

                cp -r "$EXIFTOOL_DIR/"* timekeeper-rs/bin/windows/exiftool/
                '''
            }
        }

        stage('Build Windows') {
            steps {
                nodejs('Node-24') {
                    sh '''
                    set -e
                    . "$HOME/.cargo/env"

                    export CARGO_TARGET_DIR="$WINDOWS_DIR"

                    cd app-gui
                    npm ci
                    npm run build
                    cd ..

                    cargo tauri build --target $WINDOWS_TARGET --runner cargo-xwin
                    '''
                }
            }
        }

        stage('Package Windows') {
            steps {
                sh '''
                set -e

                mkdir -p dist/windows dist/final

                BUNDLE_DIR=$(find app-gui/src-tauri/target/windows -type d -path "*/release/bundle" | head -n 1)

                if [ -z "$BUNDLE_DIR" ]; then
                    echo "Windows bundle not found"
                    exit 1
                fi

                cp -r "$BUNDLE_DIR"/* dist/windows/

                cd dist/windows
                zip -r ../final/ExifFlow-windows.zip .
                cd ../../
                '''
            }
        }

    }

    post {
        success {
            archiveArtifacts artifacts: 'dist/final/**', fingerprint: true
        }
    }
}