@echo off
:: K8s GUI Windows Build Environment - Automatic Installer
:: This script runs automatically after Windows installation via dockurr/windows
:: It installs: OpenSSH Server, Chocolatey, Git, Node.js, Rust, Visual Studio Build Tools

echo ============================================
echo K8s GUI Windows Builder - Auto Setup
echo ============================================

:: 1. Install OpenSSH Server
echo [1/6] Installing OpenSSH Server...
powershell -Command "Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0"
powershell -Command "Start-Service sshd"
powershell -Command "Set-Service -Name sshd -StartupType 'Automatic'"
:: Set PowerShell as default shell for SSH
powershell -Command "New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -PropertyType String -Force"
echo OpenSSH Server installed and started!

:: 2. Install Chocolatey
echo [2/6] Installing Chocolatey...
powershell -Command "[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
:: Refresh PATH
set "PATH=%PATH%;C:\ProgramData\chocolatey\bin"
echo Chocolatey installed!

:: 3. Install Git, Node.js and Protoc
echo [3/6] Installing Git, Node.js and Protobuf...
choco install -y git nodejs-lts protoc --no-progress
echo Git, Node.js and Protoc installed!

:: 4. Install Rust
echo [4/6] Installing Rust...
powershell -Command "Invoke-WebRequest -Uri 'https://win.rustup.rs/x86_64' -OutFile 'rustup-init.exe'"
rustup-init.exe -y --default-toolchain stable
set "PATH=%PATH%;%USERPROFILE%\.cargo\bin"
del rustup-init.exe
echo Rust installed!

:: 5. Install Visual Studio Build Tools
echo [5/6] Installing Visual Studio Build Tools...
echo This will take 10-15 minutes...
powershell -Command "Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vs_BuildTools.exe' -OutFile 'vs_BuildTools.exe'"
vs_BuildTools.exe --quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22000
del vs_BuildTools.exe
echo Visual Studio Build Tools installed!

:: 6. Install Tauri CLI
echo [6/6] Installing Tauri CLI...
:: Refresh environment to include cargo
set "PATH=%PATH%;%USERPROFILE%\.cargo\bin"
cargo install tauri-cli --locked
echo Tauri CLI installed!

:: Create project directory
mkdir C:\projects\k8s-gui 2>nul

:: Create marker file to indicate setup is complete
echo READY > C:\projects\k8s-gui\.builder-ready

echo ============================================
echo Setup Complete!
echo SSH is now available on port 22
echo Project path: C:\projects\k8s-gui
echo ============================================
