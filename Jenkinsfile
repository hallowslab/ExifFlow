pipeline {
    agent any

    parameters {
        booleanParam(name: 'FORCE_ARTIFACTS', defaultValue: false, description: 'Force artifact build even if not a tag')
        string(name: 'EXIFTOOL_VERSION', defaultValue: '13.59', description: 'Version of exiftool to use')
    }

    environment {
        RUST_BACKTRACE = "1"

        LINUX_TARGET = "x86_64-unknown-linux-gnu"
        WINDOWS_TARGET = "x86_64-pc-windows-msvc"
        MAC_TARGET = "aarch64-apple-darwin"

        LINUX_DIR = "target/linux"
        WINDOWS_DIR = "target/windows"
        MAC_DIR = "target/mac"

        LINUX_PLAIN_DIR = "target/linux-plain"
        WINDOWS_PLAIN_DIR = "target/windows-plain"

        CERT_DIR = "certs"

        EXIFTOOL_DIR = "/opt/code-deps/exiftool/${params.EXIFTOOL_VERSION}"

        DEP1_REPO = "https://github.com/hallowslab/rftps.git"
        DEP1_TAG = "v0.6.1"
        DEP2_REPO = "https://github.com/hallowslab/timekeeper-rs.git"
        DEP2_TAG = "v0.3.2"
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

                # Pin component versions: update these tags deliberately when
                # bumping rftps / timekeeper-rs.
                git clone --branch $DEP1_TAG "$DEP1_REPO" rftps
                git clone --branch $DEP2_TAG "$DEP2_REPO" timekeeper-rs

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

        stage('Generate Certs (rftps + app-gui)') {
            steps {
                sh '''
                set -e
                . "$HOME/.cargo/env"

                mkdir -p certs

                # SAN-bearing certs for both the rftps FTPS server and the ExifFlow GUI
                cd rftps
                cargo run --example gen_cert -- ../certs 127.0.0.1 localhost
                cd ..

                cp certs/cert.pem rftps/cert.pem
                cp certs/key.pem rftps/key.pem

                cp certs/cert.pem app-gui/certs/cert.pem
                cp certs/key.pem app-gui/certs/key.pem
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

                    # Clear stale installers from previous builds (Tauri appends
                    # versioned bundles without cleaning).
                    rm -rf "$CARGO_TARGET_DIR"

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

                BUNDLE_DIR="$LINUX_DIR/$LINUX_TARGET/release/bundle"

                if [ ! -d "$BUNDLE_DIR" ]; then
                    echo "Linux bundle not found: $BUNDLE_DIR"
                    exit 1
                fi

                cp -r "$BUNDLE_DIR"/* dist/linux/

                tar -czf dist/final/ExifFlow-linux.tar.gz -C dist/linux .
                '''
            }
        }

        stage('Build Linux Plain') {
            steps {
                nodejs('Node-24') {
                    sh '''
                    set -e
                    . "$HOME/.cargo/env"

                    export CARGO_TARGET_DIR="$LINUX_PLAIN_DIR"

                    rm -rf "$CARGO_TARGET_DIR"

                    cd app-gui
                    npm ci
                    npm run build
                    cd ..

                    cargo tauri build --target $LINUX_TARGET -- --no-default-features --features bundled
                    '''
                }
            }
        }

        stage('Package Linux Plain') {
            steps {
                sh '''
                set -e

                mkdir -p dist/linux-plain dist/final

                BUNDLE_DIR="$LINUX_PLAIN_DIR/$LINUX_TARGET/release/bundle"

                if [ ! -d "$BUNDLE_DIR" ]; then
                    echo "Linux plain bundle not found: $BUNDLE_DIR"
                    exit 1
                fi

                cp -r "$BUNDLE_DIR"/* dist/linux-plain/

                tar -czf dist/final/ExifFlow-plain-linux.tar.gz -C dist/linux-plain .
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

                    rm -rf "$CARGO_TARGET_DIR"

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

                BUNDLE_DIR="$WINDOWS_DIR/$WINDOWS_TARGET/release/bundle"

                if [ ! -d "$BUNDLE_DIR" ]; then
                    echo "Windows bundle not found: $BUNDLE_DIR"
                    exit 1
                fi

                cp -r "$BUNDLE_DIR"/* dist/windows/

                cd dist/windows
                zip -r ../final/ExifFlow-windows.zip .
                cd ../../
                '''
            }
        }

        stage('Build Windows Plain') {
            steps {
                nodejs('Node-24') {
                    sh '''
                    set -e
                    . "$HOME/.cargo/env"

                    export CARGO_TARGET_DIR="$WINDOWS_PLAIN_DIR"

                    rm -rf "$CARGO_TARGET_DIR"

                    cd app-gui
                    npm ci
                    npm run build
                    cd ..

                    cargo tauri build --target $WINDOWS_TARGET --runner cargo-xwin -- --no-default-features --features bundled
                    '''
                }
            }
        }

        stage('Package Windows Plain') {
            steps {
                sh '''
                set -e

                mkdir -p dist/windows-plain dist/final

                BUNDLE_DIR="$WINDOWS_PLAIN_DIR/$WINDOWS_TARGET/release/bundle"

                if [ ! -d "$BUNDLE_DIR" ]; then
                    echo "Windows plain bundle not found: $BUNDLE_DIR"
                    exit 1
                fi

                cp -r "$BUNDLE_DIR"/* dist/windows-plain/

                cd dist/windows-plain
                zip -r ../final/ExifFlow-plain-windows.zip .
                cd ../../
                '''
            }
        }

        stage('Archive Artifacts') {
            when {
                anyOf {
                    buildingTag()
                    expression { return params.FORCE_ARTIFACTS == true }
                }
            }
            steps {
                archiveArtifacts artifacts: 'dist/final/**', fingerprint: true
            }
        }

    }
}