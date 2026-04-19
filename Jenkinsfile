pipeline {
    agent any

    environment {
        RUST_BACKTRACE = "1"

        WIN_TARGET = "x86_64-pc-windows-gnu"

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

        stage('Clone Workspace Members') {
            steps {
                sh '''
                set -e

                rm -rf rftps timekeeper-rs

                git clone "$DEP1_REPO" rftps
                git clone "$DEP2_REPO" timekeeper-rs
                '''
            }
        }

        stage('Install Toolchains') {
            steps {
                sh '''
                set -e

                rustup target add x86_64-pc-windows-gnu

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

        stage('Build Linux (Tauri Bundle)') {
            steps {
                sh '''
                set -e

                cd app-gui

                npm install
                npm run build

                cd ..

                cargo tauri build
                '''
            }
        }

        stage('Package Linux') {
            steps {
                sh '''
                set -e

                mkdir -p dist/linux dist/final

                # Copy all Linux bundle outputs from workspace root target
                cp -r target/release/bundle/* dist/linux/ || true

                tar -czf dist/final/ExifFlow-linux-bundle.tar.gz -C dist/linux .
                '''
            }
        }

        /* -------------------- WINDOWS BUILD -------------------- */

        stage('Prepare ExifTool (Windows only)') {
            steps {
                sh '''
                set -e


                mkdir -p app-gui/src-tauri/bin/windows/exiftool
                cp -r "$EXIFTOOL_DIR/"* app-gui/src-tauri/bin/windows/exiftool/
                '''
            }
        }

        stage('Build Windows (Tauri / Fallback)') {
            steps {
                sh '''
                set -e

                cd app-gui

                npm install
                npm run build

                cd ..

                cargo tauri build --target x86_64-pc-windows-gnu || true
                '''
            }
        }

        stage('Package Windows') {
            steps {
                sh '''
                set -e

                mkdir -p dist/windows dist/final

                # Preferred: bundled output (if produced)
                if [ -d "target/x86_64-pc-windows-gnu/release/bundle" ]; then
                    cp -r target/x86_64-pc-windows-gnu/release/bundle/* dist/windows/
                elif [ -d "target/release/bundle" ]; then
                    # fallback if toolchain ignores target dir
                    cp -r target/release/bundle/* dist/windows/
                else
                    echo "No Tauri bundle found, falling back to portable exe" || false
                fi

                cd dist/windows
                zip -r ../final/ExifFlow-windows.zip .
                cd ../../
                '''
            }
        }

        post {
            success {
                archiveArtifacts artifacts: 'dist/final/**,dist/ExifFlow-windows.zip', fingerprint: true
            }
        }
    }
}