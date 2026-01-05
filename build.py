#!/usr/bin/env python3
from __future__ import annotations
"""
K8s GUI Build Script - Interactive Edition

Fully interactive build script for building Tauri application.
Just run: python build.py

Cross-compilation is limited by platform:
- macOS: can build arm64 + x86_64
- Windows: can build x86_64 only (requires Windows)
- Linux: can build x86_64 + arm64 (with cross-compilers)

Note: Windows builds REQUIRE Windows machine.
"""

import json
import os
import platform
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple, List

# Check for boto3
try:
    import boto3
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False


@dataclass
class Target:
    name: str
    rust_target: str
    os: str
    arch: str
    platform_key: str
    requires_cross: bool = False
    artifact_patterns: list[str] = field(default_factory=list)

    def __post_init__(self):
        if not self.artifact_patterns:
            if self.os == "darwin":
                self.artifact_patterns = ["*.dmg", "*.app.tar.gz", "*.app.tar.gz.sig"]
            elif self.os == "windows":
                self.artifact_patterns = ["*.msi", "*.msi.sig", "*.nsis.zip", "*.nsis.zip.sig"]
            elif self.os == "linux":
                self.artifact_patterns = ["*.AppImage", "*.AppImage.sig", "*.deb"]


TARGETS = {
    "macos-arm64": Target("macos-arm64", "aarch64-apple-darwin", "darwin", "aarch64", "darwin-aarch64"),
    "macos-x64": Target("macos-x64", "x86_64-apple-darwin", "darwin", "x86_64", "darwin-x86_64"),
    "windows-x64": Target("windows-x64", "x86_64-pc-windows-msvc", "windows", "x86_64", "windows-x86_64"),
    "linux-x64": Target("linux-x64", "x86_64-unknown-linux-gnu", "linux", "x86_64", "linux-x86_64"),
    "linux-arm64": Target("linux-arm64", "aarch64-unknown-linux-gnu", "linux", "aarch64", "linux-aarch64", requires_cross=True),
}

PLATFORM_TARGETS = {
    "Darwin": ["macos-arm64", "macos-x64"],
    "Windows": ["windows-x64"],
    "Linux": ["linux-x64", "linux-arm64"],
}


class BuildError(Exception):
    pass


class Colors:
    """ANSI colors for terminal output"""
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BOLD = '\033[1m'
    END = '\033[0m'


def color(text: str, c: str) -> str:
    return f"{c}{text}{Colors.END}"


def print_header(text: str):
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'=' * 50}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{text.center(50)}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'=' * 50}{Colors.END}")


def print_step(text: str):
    print(f"\n{Colors.BOLD}▶ {text}{Colors.END}")


def print_success(text: str):
    print(f"{Colors.GREEN}✅ {text}{Colors.END}")


def print_error(text: str):
    print(f"{Colors.RED}❌ {text}{Colors.END}")


def print_warning(text: str):
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.END}")


def print_info(text: str):
    print(f"{Colors.BLUE}ℹ️  {text}{Colors.END}")


# =============================================================================
# Progress Spinner
# =============================================================================

class Spinner:
    """Animated spinner for long-running operations"""
    FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    
    def __init__(self, message: str):
        self.message = message
        self.running = False
        self.thread = None
        self.frame_idx = 0
        self.start_time = None
    
    def _spin(self):
        import time
        import sys
        while self.running:
            elapsed = int(time.time() - self.start_time)
            frame = self.FRAMES[self.frame_idx % len(self.FRAMES)]
            minutes, seconds = divmod(elapsed, 60)
            time_str = f"{minutes:02d}:{seconds:02d}"
            sys.stdout.write(f"\r   {Colors.CYAN}{frame}{Colors.END} {self.message} [{time_str}]")
            sys.stdout.flush()
            self.frame_idx += 1
            time.sleep(0.1)
    
    def start(self):
        import threading
        import time
        self.running = True
        self.start_time = time.time()
        self.thread = threading.Thread(target=self._spin, daemon=True)
        self.thread.start()
        return self
    
    def stop(self, success: bool = True, message: str = None):
        import time
        self.running = False
        if self.thread:
            self.thread.join(timeout=0.5)
        elapsed = int(time.time() - self.start_time)
        minutes, seconds = divmod(elapsed, 60)
        time_str = f"{minutes:02d}:{seconds:02d}"
        
        # Clear the spinner line
        print("\r" + " " * 80 + "\r", end="")
        
        # Print result
        final_msg = message or self.message
        if success:
            print(f"   {Colors.GREEN}✓{Colors.END} {final_msg} [{time_str}]")
        else:
            print(f"   {Colors.RED}✗{Colors.END} {final_msg} [{time_str}]")
    
    def __enter__(self):
        return self.start()
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop(success=exc_type is None)
        return False


def run_command_silent(cmd: list, env: dict = None, description: str = None) -> tuple[bool, str]:
    """
    Run a command silently with spinner, showing output only on error.
    Returns (success, output)
    """
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    
    spinner_msg = description or f"Running {cmd[0]}..."
    spinner = Spinner(spinner_msg).start()
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=full_env
        )
        
        if result.returncode == 0:
            spinner.stop(success=True)
            return True, result.stdout
        else:
            spinner.stop(success=False)
            # Show error output
            print(f"\n{Colors.RED}{'─' * 60}{Colors.END}")
            print(f"{Colors.RED}Command failed: {' '.join(cmd[:3])}...{Colors.END}")
            if result.stderr:
                print(result.stderr[-2000:])  # Last 2000 chars of stderr
            if result.stdout:
                print(result.stdout[-1000:])  # Last 1000 chars of stdout
            print(f"{Colors.RED}{'─' * 60}{Colors.END}\n")
            return False, result.stderr or result.stdout
    
    except Exception as e:
        spinner.stop(success=False)
        print(f"\n{Colors.RED}Exception: {e}{Colors.END}")
        return False, str(e)


def ask(prompt: str, default: str = None) -> str:
    """Ask user for input with optional default"""
    if default:
        result = input(f"   {prompt} [{default}]: ").strip()
        return result if result else default
    return input(f"   {prompt}: ").strip()


def ask_yes_no(prompt: str, default: bool = True) -> bool:
    """Ask yes/no question"""
    default_str = "Y/n" if default else "y/N"
    result = input(f"   {prompt} [{default_str}]: ").strip().lower()
    if not result:
        return default
    return result in ("y", "yes")


def ask_secret(prompt: str) -> str:
    """Ask for secret input (hidden)"""
    import getpass
    return getpass.getpass(f"   {prompt}: ")


def ask_s3_config() -> Optional[dict]:
    """Interactively ask for S3/MinIO configuration"""
    print_step("S3/MinIO Configuration")
    
    # Storage type
    storage_types = ["MinIO (self-hosted)", "AWS S3", "Other S3-compatible"]
    storage_type = ask_choice("Select storage type:", storage_types)[0]
    
    config = {}
    
    # Bucket
    config["bucket"] = ask("Bucket name", os.environ.get("S3_BUCKET", ""))
    if not config["bucket"]:
        print_error("Bucket name is required")
        return None
    
    # Prefix
    config["prefix"] = ask("Key prefix", os.environ.get("S3_PREFIX", "releases"))
    
    # Endpoint (for MinIO)
    if "MinIO" in storage_type or "Other" in storage_type:
        default_endpoint = os.environ.get("S3_ENDPOINT", "http://localhost:9000")
        config["endpoint"] = ask("Endpoint URL", default_endpoint)
        if not config["endpoint"]:
            print_error("Endpoint URL is required for MinIO")
            return None
        # MinIO doesn't care about region, but boto3 requires it
        config["region"] = "us-east-1"
    else:
        config["endpoint"] = None
        config["region"] = ask("AWS Region", os.environ.get("AWS_REGION", "us-east-1"))
    
    # Credentials
    if os.environ.get("AWS_ACCESS_KEY_ID") and os.environ.get("AWS_SECRET_ACCESS_KEY"):
        print_info("Using credentials from environment (AWS_ACCESS_KEY_ID)")
        config["access_key"] = os.environ["AWS_ACCESS_KEY_ID"]
        config["secret_key"] = os.environ["AWS_SECRET_ACCESS_KEY"]
    else:
        config["access_key"] = ask("Access Key", os.environ.get("MINIO_ACCESS_KEY", ""))
        if config["access_key"]:
            config["secret_key"] = ask_secret("Secret Key")
        else:
            config["access_key"] = None
            config["secret_key"] = None
    
    return config


def ask_choice(prompt: str, choices: List[str], allow_multiple: bool = False) -> List[str]:
    """Ask user to choose from list"""
    print(f"\n   {prompt}")
    for i, choice in enumerate(choices, 1):
        print(f"   [{i}] {choice}")
    
    if allow_multiple:
        print("   [a] All")
        result = input("\n   Choose (comma-separated for multiple): ").strip().lower()
        
        if result == "a":
            return choices
        
        indices = [int(x.strip()) - 1 for x in result.split(",") if x.strip().isdigit()]
        return [choices[i] for i in indices if 0 <= i < len(choices)]
    else:
        while True:
            result = input(f"\n   Choose [1-{len(choices)}]: ").strip()
            if result.isdigit() and 1 <= int(result) <= len(choices):
                return [choices[int(result) - 1]]
            print_error("Invalid choice, try again.")


# =============================================================================
# Version Management
# =============================================================================

def parse_version(version: str) -> Tuple[int, int, int]:
    match = re.match(r"v?(\d+)\.(\d+)\.(\d+)", version)
    if not match:
        raise BuildError(f"Invalid version format: {version}")
    return int(match.group(1)), int(match.group(2)), int(match.group(3))


def format_version(major: int, minor: int, patch: int) -> str:
    return f"{major}.{minor}.{patch}"


def get_latest_git_tag() -> Optional[str]:
    try:
        result = subprocess.run(
            ["git", "describe", "--tags", "--abbrev=0"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return None


def get_version_from_config() -> str:
    config_path = Path("src-tauri/tauri.conf.json")
    if not config_path.exists():
        raise BuildError("src-tauri/tauri.conf.json not found. Run from project root.")
    
    with open(config_path) as f:
        return json.load(f).get("version", "0.0.0")


def update_version_in_files(new_version: str):
    # tauri.conf.json
    tauri_config_path = Path("src-tauri/tauri.conf.json")
    with open(tauri_config_path) as f:
        config = json.load(f)
    
    old_version = config.get("version", "0.0.0")
    config["version"] = new_version
    
    with open(tauri_config_path, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")
    
    print(f"   📝 {tauri_config_path}: {old_version} → {new_version}")
    
    # Cargo.toml
    cargo_toml_path = Path("src-tauri/Cargo.toml")
    if cargo_toml_path.exists():
        content = cargo_toml_path.read_text()
        new_content = re.sub(
            r'^(version\s*=\s*")[^"]+(")',
            f'\\g<1>{new_version}\\g<2>',
            content, count=1, flags=re.MULTILINE
        )
        cargo_toml_path.write_text(new_content)
        print(f"   📝 {cargo_toml_path}")


def create_git_tag(version: str, push: bool = False):
    tag = f"v{version}"
    
    result = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True)
    if result.stdout.strip():
        print("   📝 Committing version changes...")
        subprocess.run(["git", "add", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml"], check=True)
        subprocess.run(["git", "commit", "-m", f"chore: bump version to {version}"], check=True)
    
    print(f"   🏷️  Creating tag: {tag}")
    subprocess.run(["git", "tag", "-a", tag, "-m", f"Release {version}"], check=True)
    
    if push:
        print("   ⬆️  Pushing to origin...")
        subprocess.run(["git", "push", "origin", tag], check=True)
        subprocess.run(["git", "push"], check=True)
    
    return tag


def interactive_version() -> str:
    """Interactive version selection"""
    print_step("Version Management")
    
    current_tag = get_latest_git_tag()
    current_config = get_version_from_config()
    
    print(f"   Git tag:  {current_tag or '(none)'}")
    print(f"   Config:   {current_config}")
    
    # Use higher version
    if current_tag:
        tag_version = current_tag.lstrip("v")
        try:
            current = tag_version if parse_version(tag_version) >= parse_version(current_config) else current_config
        except BuildError:
            current = current_config
    else:
        current = current_config
    
    major, minor, patch = parse_version(current)
    
    choices = [
        f"Patch: {current} → {format_version(major, minor, patch + 1)}",
        f"Minor: {current} → {format_version(major, minor + 1, 0)}",
        f"Major: {current} → {format_version(major + 1, 0, 0)}",
        f"Keep current: {current}",
    ]
    
    selected = ask_choice("Select version bump:", choices)[0]
    
    if "Patch" in selected:
        new_version = format_version(major, minor, patch + 1)
    elif "Minor" in selected:
        new_version = format_version(major, minor + 1, 0)
    elif "Major" in selected:
        new_version = format_version(major + 1, 0, 0)
    else:
        return current
    
    if ask_yes_no(f"Update to {new_version}?"):
        update_version_in_files(new_version)
        push = ask_yes_no("Push tag to origin?", default=False)
        create_git_tag(new_version, push=push)
        return new_version
    
    return current


# =============================================================================
# Build Functions
# =============================================================================

def get_current_platform() -> str:
    return platform.system()


def get_available_targets() -> list[str]:
    return PLATFORM_TARGETS.get(get_current_platform(), [])


def run_command(cmd: list[str], env: dict = None) -> subprocess.CompletedProcess:
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    
    print(f"   → {' '.join(cmd)}")
    result = subprocess.run(cmd, env=full_env)
    
    if result.returncode != 0:
        raise BuildError(f"Command failed: {' '.join(cmd)}")
    return result


def check_prerequisites() -> bool:
    tools = {"cargo": "Rust", "npm": "Node.js", "node": "Node.js", "git": "Git"}
    missing = []
    
    for tool, name in tools.items():
        if shutil.which(tool) is None:
            missing.append(f"{name} ({tool})")
    
    if missing:
        print_error(f"Missing: {', '.join(missing)}")
        return False
    
    result = subprocess.run(["cargo", "tauri", "--version"], capture_output=True)
    if result.returncode != 0:
        print_error("tauri-cli not installed. Run: cargo install tauri-cli")
        return False
    
    return True


def ensure_rust_target(target: Target):
    subprocess.run(["rustup", "target", "add", target.rust_target], 
                   capture_output=True, check=True)


# =============================================================================
# Build Method Selection
# =============================================================================

class BuildMethod:
    """Build method for a target"""
    NATIVE = "native"
    DOCKER = "docker"
    DOCKER_WINDOWS = "docker-windows"  # Windows VM in Docker via dockurr/windows
    REMOTE = "remote"
    UNAVAILABLE = "unavailable"


# Cache for verified remote hosts (hosts we've tested SSH connection to)
_verified_hosts: dict[str, bool] = {}


def test_host_quick(host) -> bool:
    """Quick SSH test with cache"""
    if host.name in _verified_hosts:
        return _verified_hosts[host.name]
    
    # Quick test with short timeout
    if host.auth_method == "password":
        # Skip quick test for password hosts, assume available
        _verified_hosts[host.name] = True
        return True
    
    result = subprocess.run(
        ["ssh", "-o", "ConnectTimeout=3", "-o", "BatchMode=yes", host.host, "echo ok"],
        capture_output=True, text=True
    )
    available = result.returncode == 0
    _verified_hosts[host.name] = available
    return available


def verify_remote_hosts(hosts: list) -> list:
    """Test all remote hosts and return only available ones"""
    available = []
    for h in hosts:
        print(f"   Testing {h.name}...", end=" ", flush=True)
        if test_host_quick(h):
            print(color("OK", Colors.GREEN))
            available.append(h)
        else:
            print(color("FAILED", Colors.RED))
    return available


def get_build_method(target_name: str, verified_hosts: list = None) -> Tuple[str, Optional[any]]:
    """
    Determine the best build method for a target.
    Returns: (method, extra_data) where extra_data is RemoteHost for REMOTE method.
    
    Priority: native → docker → remote → unavailable
    """
    target = TARGETS.get(target_name)
    if not target:
        return BuildMethod.UNAVAILABLE, None
    
    # 1. Check native
    if target_name in get_available_targets():
        return BuildMethod.NATIVE, None
    
    # 2. Check Docker (for Linux targets - both x64 and arm64)
    if target.os == "linux" and check_docker():
        return BuildMethod.DOCKER, None
    
    # 3. Check verified remote hosts (including Windows hosts)
    if verified_hosts:
        for host in verified_hosts:
            if host.can_build(target):
                return BuildMethod.REMOTE, host
    
    # 4. Check Docker Windows VM (for Windows targets) - fallback
    # Available if: local Docker + compose OR Linux remote host exists
    if target.os == "windows":
        if check_docker_windows_available() or find_linux_host_for_windows():
            return BuildMethod.DOCKER_WINDOWS, None
    
    return BuildMethod.UNAVAILABLE, None


def get_all_buildable_targets(verified_hosts: list = None) -> dict[str, Tuple[str, any]]:
    """
    Get all targets with their build methods.
    Returns: {target_name: (method, extra_data)}
    """
    result = {}
    for target_name in TARGETS:
        method, extra = get_build_method(target_name, verified_hosts)
        result[target_name] = (method, extra)
    return result


def format_target_with_method(target_name: str, method: str, extra: any = None) -> str:
    """Format target name with its build method for display"""
    if method == BuildMethod.NATIVE:
        return f"{target_name} (native)"
    elif method == BuildMethod.DOCKER:
        return f"{target_name} (docker)"
    elif method == BuildMethod.DOCKER_WINDOWS:
        return f"{target_name} (docker-windows)"
    elif method == BuildMethod.REMOTE:
        host_name = extra.name if extra else "remote"
        return f"{target_name} ({host_name})"
    else:
        return f"{target_name} (unavailable)"


def build_frontend():
    print_step("Building Frontend")
    
    success, _ = run_command_silent(["npm", "ci"], description="Installing dependencies")
    if not success:
        raise BuildError("npm ci failed")
    
    success, _ = run_command_silent(["npm", "run", "build"], description="Building frontend")
    if not success:
        raise BuildError("npm run build failed")


def build_target(target: Target, env: dict):
    print_step(f"Building {target.name}")
    
    ensure_rust_target(target)
    
    build_env = os.environ.copy()
    build_env.update(env)
    
    if target.requires_cross and target.rust_target == "aarch64-unknown-linux-gnu":
        build_env.update({
            "CC_aarch64_unknown_linux_gnu": "aarch64-linux-gnu-gcc",
            "CXX_aarch64_unknown_linux_gnu": "aarch64-linux-gnu-g++",
            "CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER": "aarch64-linux-gnu-gcc",
            "PKG_CONFIG_ALLOW_CROSS": "1",
        })
    
    success, _ = run_command_silent(
        ["cargo", "tauri", "build", "--target", target.rust_target],
        env=build_env,
        description=f"Compiling {target.name}"
    )
    
    if not success:
        raise BuildError(f"Build failed for {target.name}")


def check_docker() -> bool:
    """Check if Docker is available"""
    result = subprocess.run(["docker", "--version"], capture_output=True)
    return result.returncode == 0


# =============================================================================
# Docker Windows VM (dockurr/windows)
# =============================================================================

WINDOWS_CONTAINER_NAME = "windows-builder"
WINDOWS_SSH_PORT = 2222
WINDOWS_USER = "builder"
WINDOWS_PASSWORD = "BuilderPass123!"

# Remote Linux host for Windows Docker VM (set when we find a Linux host)
_windows_vm_linux_host: Optional["RemoteHost"] = None


def find_linux_host_for_windows() -> Optional["RemoteHost"]:
    """Find a Linux remote host that can run Windows Docker VM"""
    global _windows_vm_linux_host
    
    if _windows_vm_linux_host:
        return _windows_vm_linux_host
    
    remote_hosts = load_remote_hosts()
    for host in remote_hosts:
        if host.platform == "linux":
            _windows_vm_linux_host = host
            return host
    return None


def check_docker_windows_available() -> bool:
    """Check if Windows Docker VM is running (locally or on remote Linux host)"""
    # First check local Docker
    if check_docker():
        result = subprocess.run(
            ["docker", "ps", "-q", "-f", f"name={WINDOWS_CONTAINER_NAME}"],
            capture_output=True, text=True
        )
        if result.stdout.strip():
            return True
    
    # Check on remote Linux host
    linux_host = find_linux_host_for_windows()
    if linux_host:
        try:
            ensure_host_password(linux_host)
            cmd = linux_host.get_ssh_cmd(f"docker ps -q -f name={WINDOWS_CONTAINER_NAME}")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.stdout.strip():
                return True
        except:
            pass
    
    return False


def sync_windows_files_to_linux_host(linux_host: RemoteHost):
    """Sync docker-compose and install files to Linux host"""
    print_step(f"Syncing Windows build files to {linux_host.name}")
    
    ensure_host_password(linux_host)
    
    # Ensure rsync is installed on remote host
    print_info("Checking rsync on remote host...")
    check_rsync_cmd = linux_host.get_ssh_cmd("which rsync || (apt-get update -qq && apt-get install -y -qq rsync)")
    result = subprocess.run(check_rsync_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print_warning(f"rsync installation may have failed: {result.stderr}")
    
    # Create project directory on remote host
    mkdir_cmd = linux_host.get_ssh_cmd(f"mkdir -p {linux_host.project_path}/windows-builder")
    result = subprocess.run(mkdir_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print_warning(f"mkdir failed: {result.stderr}")
    
    # Sync docker-compose.windows.yml
    cmd = linux_host.get_rsync_cmd(
        "docker-compose.windows.yml",
        f"{linux_host.host}:{linux_host.project_path}/"
    )
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print_error(f"Failed to sync docker-compose.windows.yml: {result.stderr}")
        raise BuildError("rsync failed for docker-compose.windows.yml")
    
    # Sync windows-builder directory
    cmd = linux_host.get_rsync_cmd(
        "windows-builder/",
        f"{linux_host.host}:{linux_host.project_path}/windows-builder/"
    )
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print_error(f"Failed to sync windows-builder: {result.stderr}")
        raise BuildError("rsync failed for windows-builder")
    
    print_success("Files synced")


def start_windows_container_remote(linux_host: RemoteHost) -> bool:
    """Start Windows Docker VM on remote Linux host"""
    print_step(f"Starting Windows Docker VM on {linux_host.name}")
    print_warning("First boot takes 30-40 minutes for Windows + tools installation!")
    
    ensure_host_password(linux_host)
    
    # Sync files first
    sync_windows_files_to_linux_host(linux_host)
    
    # Start container on remote host (create dir if needed)
    start_cmd = f"mkdir -p {linux_host.project_path} && cd {linux_host.project_path} && docker compose -f docker-compose.windows.yml up -d"
    cmd = linux_host.get_ssh_cmd(start_cmd)
    
    result = subprocess.run(cmd)
    
    if result.returncode != 0:
        raise BuildError(f"Failed to start Windows container on {linux_host.name}")
    
    return True


def start_windows_container() -> bool:
    """Start the Windows Docker VM (locally on Linux or on remote Linux host)"""
    # Windows Docker VM requires KVM which is only on Linux
    # Try local only on Linux
    compose_file = Path("docker-compose.windows.yml")
    if platform.system() == "Linux" and compose_file.exists() and check_docker():
        print_step("Starting Windows Docker VM locally")
        print_warning("First boot takes 30-40 minutes for Windows + tools installation!")
        
        result = subprocess.run(
            ["docker", "compose", "-f", str(compose_file), "up", "-d"],
            capture_output=False
        )
        
        if result.returncode == 0:
            return True
    
    # Try on remote Linux host (required for Mac/Windows)
    linux_host = find_linux_host_for_windows()
    if linux_host:
        return start_windows_container_remote(linux_host)
    
    raise BuildError("Windows VM requires Linux with KVM (need local Linux Docker or Linux remote host)")


def wait_for_windows_ssh(timeout: int = 2400) -> bool:
    """
    Wait for Windows VM to be fully ready:
    1. SSH accessible
    2. Build tools installed (checked via .builder-ready marker)
    
    Default timeout is 40 minutes (Windows install + build tools)
    """
    import time
    
    print(f"   Waiting for Windows VM to be ready (timeout: {timeout//60} min)...")
    print("   This includes Windows installation AND build tools setup.")
    
    start_time = time.time()
    ssh_ready = False
    
    while time.time() - start_time < timeout:
        elapsed = int(time.time() - start_time)
        
        try:
            # First check if SSH is accessible
            result = subprocess.run(
                ["sshpass", "-p", WINDOWS_PASSWORD, "ssh",
                 "-o", "StrictHostKeyChecking=no",
                 "-o", "ConnectTimeout=5",
                 "-p", str(WINDOWS_SSH_PORT),
                 f"{WINDOWS_USER}@localhost", "echo ok"],
                capture_output=True, text=True, timeout=10
            )
            
            if result.returncode == 0 and "ok" in result.stdout:
                if not ssh_ready:
                    print_success("SSH is accessible!")
                    print("   Waiting for build tools installation to complete...")
                    ssh_ready = True
                
                # Check if build tools are installed by looking for marker file
                check_result = subprocess.run(
                    ["sshpass", "-p", WINDOWS_PASSWORD, "ssh",
                     "-o", "StrictHostKeyChecking=no",
                     "-p", str(WINDOWS_SSH_PORT),
                     f"{WINDOWS_USER}@localhost",
                     "if exist C:\\projects\\k8s-gui\\.builder-ready echo READY"],
                    capture_output=True, text=True, timeout=10
                )
                
                if "READY" in check_result.stdout:
                    print_success("Windows VM is fully ready with build tools!")
                    return True
        
        except subprocess.TimeoutExpired:
            pass
        
        if elapsed % 60 == 0 and elapsed > 0:
            status = "SSH accessible, waiting for tools..." if ssh_ready else "Waiting for Windows..."
            print(f"   {status} ({elapsed//60} min elapsed)")
        
        time.sleep(10)
    
    return False


def build_target_docker_windows(target: Target, env: dict):
    """Build Windows target using Docker Windows VM (local or remote on Linux host)"""
    print_step(f"Building {target.name} via Windows Docker VM")
    
    if target.os != "windows":
        raise BuildError(f"Windows Docker build only supports Windows targets, got {target.os}")
    
    # Determine if Windows VM is local or on remote Linux host
    # Priority: local Docker (if running) -> remote Linux host
    linux_host = find_linux_host_for_windows()
    
    # Check if Windows VM is running locally
    local_running = False
    if check_docker():
        result = subprocess.run(
            ["docker", "ps", "-q", "-f", f"name={WINDOWS_CONTAINER_NAME}"],
            capture_output=True, text=True
        )
        local_running = bool(result.stdout.strip())
    
    # Decide: use local if running OR if we have local Docker and no remote host
    use_remote = linux_host is not None and not local_running
    
    # Ensure container is running somewhere
    if not check_docker_windows_available():
        start_windows_container()
        # Wait for SSH based on where we started the container
        if use_remote:
            if not wait_for_windows_ssh_remote(linux_host):
                raise BuildError("Windows VM failed to start or SSH not available")
        else:
            if not wait_for_windows_ssh():
                raise BuildError("Windows VM failed to start or SSH not available")
    
    output_dir = Path("artifacts") / target.name
    output_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        if use_remote:
            # Windows VM is on remote Linux host - use nested SSH
            _build_windows_via_linux_host(linux_host, target, env, output_dir)
        else:
            # Windows VM is local
            _build_windows_local(target, env, output_dir)
        
        print_success(f"{target.name} built via Windows Docker VM")
    finally:
        # Always cleanup Windows VM after build (fresh each time)
        _cleanup_windows_container(linux_host if use_remote else None)


def _cleanup_windows_container(linux_host: Optional[RemoteHost] = None):
    """Stop and remove Windows Docker VM"""
    print_step("Cleaning up Windows Docker VM")
    
    if linux_host:
        # Cleanup on remote host
        ensure_host_password(linux_host)
        cleanup_cmd = f"cd {linux_host.project_path} && docker compose -f docker-compose.windows.yml down -v --remove-orphans 2>/dev/null || true"
        cmd = linux_host.get_ssh_cmd(cleanup_cmd)
        subprocess.run(cmd, capture_output=True)
    else:
        # Cleanup locally
        compose_file = Path("docker-compose.windows.yml")
        if compose_file.exists():
            subprocess.run(
                ["docker", "compose", "-f", str(compose_file), "down", "-v", "--remove-orphans"],
                capture_output=True
            )
    
    print_success("Windows VM cleaned up")


def _build_windows_local(target: Target, env: dict, output_dir: Path):
    """Build on local Windows Docker VM"""
    ssh_cmd = [
        "sshpass", "-p", WINDOWS_PASSWORD, "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-p", str(WINDOWS_SSH_PORT),
        f"{WINDOWS_USER}@localhost"
    ]
    
    # Sync project files
    print_step("Syncing files to Windows VM")
    rsync_cmd = [
        "sshpass", "-p", WINDOWS_PASSWORD,
        "rsync", "-avz", "--delete",
        "-e", f"ssh -o StrictHostKeyChecking=no -p {WINDOWS_SSH_PORT}",
        "--exclude", "target/",
        "--exclude", "node_modules/",
        "--exclude", ".git/",
        "./",
        f"{WINDOWS_USER}@localhost:C:/projects/k8s-gui/"
    ]
    result = subprocess.run(rsync_cmd)
    if result.returncode != 0:
        raise BuildError("Failed to sync files to Windows VM")
    
    # Build
    env_exports = " ; ".join([f"$env:{k}='{v}'" for k, v in env.items()])
    if "TAURI_SIGNING_PRIVATE_KEY" in os.environ:
        key = os.environ["TAURI_SIGNING_PRIVATE_KEY"].replace("'", "''")
        env_exports += f" ; $env:TAURI_SIGNING_PRIVATE_KEY='{key}'"
    
    build_cmd = f"cd C:\\projects\\k8s-gui ; {env_exports} ; npm ci ; npm run build ; cargo tauri build --target {target.rust_target}"
    
    full_cmd = ssh_cmd + [f"powershell -Command \"{build_cmd}\""]
    print("   → Building on Windows VM...")
    result = subprocess.run(full_cmd)
    
    if result.returncode != 0:
        raise BuildError("Windows Docker VM build failed")
    
    # Fetch artifacts
    print_step("Fetching Windows artifacts")
    fetch_cmd = [
        "sshpass", "-p", WINDOWS_PASSWORD,
        "rsync", "-avz",
        "-e", f"ssh -o StrictHostKeyChecking=no -p {WINDOWS_SSH_PORT}",
        f"{WINDOWS_USER}@localhost:C:/projects/k8s-gui/src-tauri/target/{target.rust_target}/release/bundle/",
        str(output_dir) + "/"
    ]
    subprocess.run(fetch_cmd)


def _build_windows_via_linux_host(linux_host: RemoteHost, target: Target, env: dict, output_dir: Path):
    """Build on Windows VM running on remote Linux host via SSH tunnel"""
    ensure_host_password(linux_host)
    
    # First sync our project to Linux host
    print_step(f"Syncing project to {linux_host.name}")
    sync_to_remote(linux_host, env)
    
    # Now use Linux host to sync to Windows VM and build
    # All commands go: Mac -> Linux -> Windows
    
    # Sync from Linux host to Windows VM
    print_step("Syncing files to Windows VM (via Linux host)")
    sync_to_windows_cmd = f'''
cd {linux_host.project_path} && \
sshpass -p '{WINDOWS_PASSWORD}' rsync -avz --delete \
    -e "ssh -o StrictHostKeyChecking=no -p {WINDOWS_SSH_PORT}" \
    --exclude target/ --exclude node_modules/ --exclude .git/ \
    ./ {WINDOWS_USER}@localhost:C:/projects/k8s-gui/
'''
    cmd = linux_host.get_ssh_cmd(sync_to_windows_cmd)
    result = subprocess.run(cmd)
    if result.returncode != 0:
        raise BuildError("Failed to sync files to Windows VM")
    
    # Build on Windows VM (via Linux)
    print_step("Building on Windows VM")
    env_exports = " ; ".join([f"$env:{k}='{v}'" for k, v in env.items()])
    if "TAURI_SIGNING_PRIVATE_KEY" in os.environ:
        key = os.environ["TAURI_SIGNING_PRIVATE_KEY"].replace("'", "''").replace('"', '\\"')
        env_exports += f" ; $env:TAURI_SIGNING_PRIVATE_KEY='{key}'"
    
    ps_build_cmd = f"cd C:\\projects\\k8s-gui ; {env_exports} ; npm ci ; npm run build ; cargo tauri build --target {target.rust_target}"
    
    build_via_linux_cmd = f'''
sshpass -p '{WINDOWS_PASSWORD}' ssh \
    -o StrictHostKeyChecking=no \
    -p {WINDOWS_SSH_PORT} \
    {WINDOWS_USER}@localhost \
    "powershell -Command \\"{ps_build_cmd}\\""
'''
    cmd = linux_host.get_ssh_cmd(build_via_linux_cmd)
    print("   → Building on Windows VM (via Linux host)...")
    result = subprocess.run(cmd)
    
    if result.returncode != 0:
        raise BuildError("Windows Docker VM build failed")
    
    # Fetch artifacts: Windows -> Linux -> Mac
    print_step("Fetching Windows artifacts (Windows → Linux → Mac)")
    
    # First fetch from Windows to Linux
    fetch_to_linux_cmd = f'''
sshpass -p '{WINDOWS_PASSWORD}' rsync -avz \
    -e "ssh -o StrictHostKeyChecking=no -p {WINDOWS_SSH_PORT}" \
    {WINDOWS_USER}@localhost:C:/projects/k8s-gui/src-tauri/target/{target.rust_target}/release/bundle/ \
    {linux_host.project_path}/windows-artifacts/
'''
    cmd = linux_host.get_ssh_cmd(fetch_to_linux_cmd)
    subprocess.run(cmd)
    
    # Then fetch from Linux to Mac
    cmd = linux_host.get_rsync_cmd(
        f"{linux_host.host}:{linux_host.project_path}/windows-artifacts/",
        str(output_dir) + "/"
    )
    subprocess.run(cmd)


def wait_for_windows_ssh_remote(linux_host: RemoteHost, timeout: int = 2400) -> bool:
    """Wait for Windows VM on remote Linux host to be ready"""
    import time
    
    ensure_host_password(linux_host)
    
    print(f"   Waiting for Windows VM on {linux_host.name} (timeout: {timeout//60} min)...")
    print("   This includes Windows installation AND build tools setup.")
    
    start_time = time.time()
    ssh_ready = False
    
    while time.time() - start_time < timeout:
        elapsed = int(time.time() - start_time)
        
        try:
            # Check SSH via Linux host
            check_cmd = f"sshpass -p '{WINDOWS_PASSWORD}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -p {WINDOWS_SSH_PORT} {WINDOWS_USER}@localhost echo ok"
            cmd = linux_host.get_ssh_cmd(check_cmd)
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            
            if result.returncode == 0 and "ok" in result.stdout:
                if not ssh_ready:
                    print_success("SSH is accessible!")
                    print("   Waiting for build tools installation...")
                    ssh_ready = True
                
                # Check for ready marker
                ready_check = f"sshpass -p '{WINDOWS_PASSWORD}' ssh -o StrictHostKeyChecking=no -p {WINDOWS_SSH_PORT} {WINDOWS_USER}@localhost \"if exist C:\\projects\\k8s-gui\\.builder-ready echo READY\""
                cmd = linux_host.get_ssh_cmd(ready_check)
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
                
                if "READY" in result.stdout:
                    print_success("Windows VM is fully ready with build tools!")
                    return True
        
        except subprocess.TimeoutExpired:
            pass
        
        if elapsed % 60 == 0 and elapsed > 0:
            status = "SSH accessible, waiting for tools..." if ssh_ready else "Waiting for Windows..."
            print(f"   {status} ({elapsed//60} min elapsed)")
        
        time.sleep(10)
    
    return False


def build_docker_image() -> str:
    """Build or ensure the Linux build Docker image exists"""
    image_name = "k8s-gui-linux-builder"
    dockerfile = Path("Dockerfile.linux-build")
    
    if not dockerfile.exists():
        raise BuildError("Dockerfile.linux-build not found")
    
    print("   Building Docker image (this may take a few minutes first time)...")
    result = subprocess.run(
        ["docker", "build", "-t", image_name, "-f", str(dockerfile), "."],
        capture_output=False
    )
    
    if result.returncode != 0:
        raise BuildError("Failed to build Docker image")
    
    return image_name


def build_target_docker(target: Target, env: dict):
    """Build Linux target using Docker"""
    print_step(f"Building {target.name} via Docker")
    
    if target.os != "linux":
        raise BuildError(f"Docker build only supports Linux targets, got {target.os}")
    
    image_name = build_docker_image()
    
    # Prepare environment variables for Docker
    env_args = []
    for key, value in env.items():
        env_args.extend(["-e", f"{key}={value}"])
    
    # Add signing keys if present
    if "TAURI_SIGNING_PRIVATE_KEY" in os.environ:
        env_args.extend(["-e", f"TAURI_SIGNING_PRIVATE_KEY={os.environ['TAURI_SIGNING_PRIVATE_KEY']}"])
    if "TAURI_SIGNING_PRIVATE_KEY_PASSWORD" in os.environ:
        env_args.extend(["-e", f"TAURI_SIGNING_PRIVATE_KEY_PASSWORD={os.environ['TAURI_SIGNING_PRIVATE_KEY_PASSWORD']}"])
    
    # Run Docker build
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{Path.cwd()}:/app",
        "-w", "/app",
        *env_args,
        image_name,
        "bash", "-c",
        f"npm ci && npm run build && cargo tauri build --target {target.rust_target}"
    ]
    
    success, _ = run_command_silent(cmd, description=f"Building {target.name} in Docker")
    
    if not success:
        raise BuildError(f"Docker build failed for {target.name}")
    
    print_success(f"{target.name} built via Docker")


# =============================================================================
# Remote Host Build (SSH)
# =============================================================================

@dataclass
class RemoteHost:
    """Remote build host configuration"""
    name: str
    host: str  # user@hostname or hostname
    platform: str  # darwin, linux, windows
    project_path: str  # Path to project on remote host
    auth_method: str = "key"  # "key" or "password"
    _password: str = None  # Runtime password (not saved)
    
    def can_build(self, target: Target) -> bool:
        """Check if this host can build the given target"""
        if self.platform == "darwin" and target.os == "darwin":
            return True
        if self.platform == "linux" and target.os == "linux":
            return True
        if self.platform == "windows" and target.os == "windows":
            return True
        return False
    
    def get_buildable_targets(self) -> list[str]:
        """Get list of targets this host can build"""
        return [name for name, t in TARGETS.items() if self.can_build(t)]
    
    def get_ssh_cmd(self, remote_cmd: str) -> list[str]:
        """Get SSH command with proper auth"""
        if self.auth_method == "password" and self._password:
            return ["sshpass", "-p", self._password, "ssh", self.host, remote_cmd]
        return ["ssh", self.host, remote_cmd]
    
    def get_rsync_cmd(self, src: str, dest: str, extra_args: list = None) -> list[str]:
        """Get rsync command with proper auth"""
        base_cmd = ["rsync", "-avz"]
        if extra_args:
            base_cmd.extend(extra_args)
        
        if self.auth_method == "password" and self._password:
            base_cmd.extend(["-e", f"sshpass -p {self._password} ssh"])
        
        base_cmd.extend([src, dest])
        return base_cmd


# Runtime password cache for remote hosts
_host_passwords: dict[str, str] = {}


def load_remote_hosts() -> list[RemoteHost]:
    """Load remote hosts from config file"""
    config_path = Path.home() / ".config" / "k8s-gui" / "build-hosts.json"
    if not config_path.exists():
        return []
    
    try:
        with open(config_path) as f:
            data = json.load(f)
        return [RemoteHost(**h) for h in data.get("hosts", [])]
    except Exception as e:
        print_warning(f"Failed to load remote hosts: {e}")
        return []


def save_remote_hosts(hosts: list[RemoteHost]):
    """Save remote hosts to config file"""
    config_dir = Path.home() / ".config" / "k8s-gui"
    config_dir.mkdir(parents=True, exist_ok=True)
    config_path = config_dir / "build-hosts.json"
    
    # Don't save password or runtime fields
    data = {"hosts": [{"name": h.name, "host": h.host, "platform": h.platform, 
                       "project_path": h.project_path, "auth_method": h.auth_method} 
                      for h in hosts]}
    
    with open(config_path, "w") as f:
        json.dump(data, f, indent=2)
    
    print_success(f"Saved remote hosts to {config_path}")


def check_sshpass() -> bool:
    """Check if sshpass is installed"""
    return shutil.which("sshpass") is not None


def get_host_password(host: RemoteHost) -> str:
    """Get password for host (prompts if not cached)"""
    if host.auth_method != "password":
        return None
    
    if host.name in _host_passwords:
        return _host_passwords[host.name]
    
    password = ask_secret(f"Password for {host.host}")
    _host_passwords[host.name] = password
    return password


def ensure_host_password(host: RemoteHost):
    """Ensure host has password set if needed"""
    if host.auth_method == "password":
        if not check_sshpass():
            print_error("sshpass not installed. Run: brew install hudochenkov/sshpass/sshpass")
            raise BuildError("sshpass required for password auth")
        host._password = get_host_password(host)


def ask_add_remote_host() -> Optional[RemoteHost]:
    """Interactively add a new remote host"""
    print_step("Add Remote Build Host")
    
    name = ask("Host name (e.g., 'linux-server')")
    if not name:
        return None
    
    host = ask("SSH host (e.g., 'user@192.168.1.100' or 'myserver')")
    if not host:
        return None
    
    platforms = ["linux", "darwin", "windows"]
    platform = ask_choice("Platform on remote host:", platforms)[0]
    
    default_path = "~/projects/k8s-gui"
    project_path = ask("Project path on remote", default_path)
    
    # Auth method
    auth_methods = ["SSH Key (recommended)", "Password"]
    auth_choice = ask_choice("Authentication method:", auth_methods)[0]
    auth_method = "password" if "Password" in auth_choice else "key"
    
    if auth_method == "password" and not check_sshpass():
        print_warning("sshpass not installed. Run: brew install hudochenkov/sshpass/sshpass")
        if not ask_yes_no("Continue with password auth anyway?", default=False):
            auth_method = "key"
    
    return RemoteHost(name=name, host=host, platform=platform, 
                      project_path=project_path, auth_method=auth_method)


def test_remote_host(host: RemoteHost) -> bool:
    """Test SSH connection to remote host"""
    print(f"   Testing connection to {host.host}...")
    
    # For password auth, prompt for password
    if host.auth_method == "password":
        try:
            ensure_host_password(host)
        except BuildError:
            return False
        cmd = host.get_ssh_cmd("echo ok")
    else:
        cmd = ["ssh", "-o", "ConnectTimeout=5", "-o", "BatchMode=yes", host.host, "echo ok"]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0 and "ok" in result.stdout


def sync_to_remote(host: RemoteHost, env: dict):
    """Sync project to remote host using rsync (or scp for Windows)"""
    print_step(f"Syncing to {host.name}")
    
    # Ensure password is set if needed
    ensure_host_password(host)
    
    # Create project directory on remote
    if host.platform == "windows":
        mkdir_cmd = f'powershell -Command "New-Item -ItemType Directory -Force -Path {host.project_path}"'
    else:
        mkdir_cmd = f"mkdir -p {host.project_path}"
    
    cmd = host.get_ssh_cmd(mkdir_cmd)
    subprocess.run(cmd, capture_output=True)
    
    # Windows: use scp (rsync typically not installed)
    # Linux/macOS: use rsync
    if host.platform == "windows":
        print(f"   → scp to {host.host}:{host.project_path}")
        # For Windows, we use a tar + ssh approach to handle excludes
        # Create a tar stream excluding unwanted files and extract on remote
        tar_excludes = "--exclude=target --exclude=node_modules --exclude=.git --exclude=artifacts --exclude='*.log'"
        
        if host.auth_method == "password" and host._password:
            ssh_cmd = f"sshpass -p '{host._password}' ssh {host.host}"
        else:
            ssh_cmd = f"ssh {host.host}"
        
        # Use tar to pipe files through SSH
        cmd = f"tar {tar_excludes} -cf - . | {ssh_cmd} \"powershell -Command \\\"cd {host.project_path}; tar -xf -\\\"\""
        result = subprocess.run(cmd, shell=True)
    else:
        # Exclude patterns for rsync
        excludes = [
            "--exclude", "target/",
            "--exclude", "node_modules/",
            "--exclude", ".git/",
            "--exclude", "artifacts/",
            "--exclude", "*.log",
            "--delete"
        ]
        
        cmd = host.get_rsync_cmd("./", f"{host.host}:{host.project_path}/", extra_args=excludes)
        
        print(f"   → rsync to {host.host}:{host.project_path}")
        result = subprocess.run(cmd)
    
    if result.returncode != 0:
        raise BuildError(f"Failed to sync to {host.name}")
    
    print_success("Files synced")


def build_on_remote(host: RemoteHost, target: Target, env: dict):
    """Build target on remote host via SSH"""
    print_step(f"Building {target.name} on {host.name}")
    
    # Ensure password is set if needed
    ensure_host_password(host)
    
    # Windows uses PowerShell, Linux/macOS use bash
    if host.platform == "windows":
        # PowerShell environment variables
        env_exports = " ; ".join([f"$env:{k}='{v}'" for k, v in env.items()])
        
        # Add signing keys if present
        if "TAURI_SIGNING_PRIVATE_KEY" in os.environ:
            key = os.environ["TAURI_SIGNING_PRIVATE_KEY"].replace("'", "''")
            env_exports += f" ; $env:TAURI_SIGNING_PRIVATE_KEY='{key}'"
        if "TAURI_SIGNING_PRIVATE_KEY_PASSWORD" in os.environ:
            pwd = os.environ["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"].replace("'", "''")
            env_exports += f" ; $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD='{pwd}'"
        
        # PowerShell build command
        ps_cmd = f"cd {host.project_path} ; {env_exports} ; npm ci ; npm run build ; cargo tauri build --target {target.rust_target}"
        build_cmd = f'powershell -Command "{ps_cmd}"'
    else:
        # Bash environment variables
        env_exports = " && ".join([f"export {k}='{v}'" for k, v in env.items()])
        
        # Add signing keys if present
        if "TAURI_SIGNING_PRIVATE_KEY" in os.environ:
            key = os.environ["TAURI_SIGNING_PRIVATE_KEY"].replace("'", "'\\''")
            env_exports += f" && export TAURI_SIGNING_PRIVATE_KEY='{key}'"
        if "TAURI_SIGNING_PRIVATE_KEY_PASSWORD" in os.environ:
            pwd = os.environ["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"]
            env_exports += f" && export TAURI_SIGNING_PRIVATE_KEY_PASSWORD='{pwd}'"
        
        # Bash build command
        build_cmd = f"cd {host.project_path} && {env_exports} && npm ci && npm run build && cargo tauri build --target {target.rust_target}"
    
    cmd = host.get_ssh_cmd(build_cmd)
    print(f"   → ssh {host.host} 'cargo tauri build --target {target.rust_target}'")
    
    result = subprocess.run(cmd)
    
    if result.returncode != 0:
        raise BuildError(f"Remote build failed on {host.name}")
    
    print_success(f"{target.name} built on {host.name}")


def fetch_artifacts_from_remote(host: RemoteHost, target: Target, output_dir: Path) -> list[Path]:
    """Fetch build artifacts from remote host"""
    print_step(f"Fetching artifacts from {host.name}")
    
    # Ensure password is set if needed
    ensure_host_password(host)
    
    artifacts = []
    
    # Create local output dir
    target_output = output_dir / target.name
    target_output.mkdir(parents=True, exist_ok=True)
    
    if host.platform == "windows":
        # Windows path with backslashes
        remote_bundle = f"{host.project_path}\\\\src-tauri\\\\target\\\\{target.rust_target}\\\\release\\\\bundle"
        
        # Use scp to fetch artifacts from Windows
        if host.auth_method == "password" and host._password:
            scp_prefix = ["sshpass", "-p", host._password, "scp", "-r"]
        else:
            scp_prefix = ["scp", "-r"]
        
        # For Windows, fetch the msi and nsis subdirectories
        for subdir in ["msi", "nsis"]:
            win_path = f"{host.project_path}/src-tauri/target/{target.rust_target}/release/bundle/{subdir}"
            cmd = scp_prefix + [f"{host.host}:{win_path}/*", str(target_output) + "/"]
            subprocess.run(cmd, capture_output=True)
    else:
        remote_bundle = f"{host.project_path}/src-tauri/target/{target.rust_target}/release/bundle/"
        
        # Fetch artifacts using host's rsync method
        cmd = host.get_rsync_cmd(f"{host.host}:{remote_bundle}", str(target_output) + "/")
        subprocess.run(cmd, capture_output=True)
    
    # Collect what we got (recursively search for artifacts)
    for pattern in target.artifact_patterns:
        for f in target_output.rglob(pattern):
            if f.is_file():
                size = f.stat().st_size / 1024 / 1024
                print(f"   📄 {f.name} ({size:.1f} MB)")
                artifacts.append(f)
    
    return artifacts


def build_target_remote(host: RemoteHost, target: Target, env: dict, output_dir: Path) -> list[Path]:
    """Full remote build workflow: sync, build, fetch"""
    sync_to_remote(host, env)
    build_on_remote(host, target, env)
    return fetch_artifacts_from_remote(host, target, output_dir)


def collect_artifacts(target: Target, output_dir: Path) -> list[Path]:
    artifacts = []
    bundle_dirs = [
        Path(f"target/{target.rust_target}/release/bundle"),
        Path(f"src-tauri/target/{target.rust_target}/release/bundle"),
    ]
    
    for bundle_dir in bundle_dirs:
        if not bundle_dir.exists():
            continue
        
        for pattern in target.artifact_patterns:
            for artifact in bundle_dir.rglob(pattern):
                if artifact.is_file():
                    dest = output_dir / artifact.name
                    shutil.copy2(artifact, dest)
                    artifacts.append(dest)
                    size = artifact.stat().st_size / 1024 / 1024
                    print(f"   📄 {artifact.name} ({size:.1f} MB)")
    
    return artifacts


# =============================================================================
# S3/MinIO Upload
# =============================================================================

class S3Uploader:
    """S3-compatible uploader (works with AWS S3, MinIO, etc.)"""
    
    def __init__(self, bucket: str, prefix: str, endpoint: str = None, 
                 access_key: str = None, secret_key: str = None, region: str = "us-east-1"):
        if not HAS_BOTO3:
            raise BuildError("boto3 not installed. Run: pip install boto3")
        
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.endpoint = endpoint
        
        # Build client config
        config = {"region_name": region}
        
        if endpoint:
            config["endpoint_url"] = endpoint
        
        if access_key and secret_key:
            config["aws_access_key_id"] = access_key
            config["aws_secret_access_key"] = secret_key
        
        self.s3 = boto3.client("s3", **config)
        
        # Base URL for public access
        if endpoint:
            # MinIO/custom S3: endpoint/bucket/key
            self.base_url = f"{endpoint.rstrip('/')}/{bucket}"
        else:
            # AWS S3: bucket.s3.amazonaws.com
            self.base_url = f"https://{bucket}.s3.amazonaws.com"
    
    def upload_file(self, local_path: Path, s3_key: str, content_type: str = None) -> str:
        extra_args = {"ContentType": content_type} if content_type else {}
        full_key = f"{self.prefix}/{s3_key}"
        
        print(f"   ⬆️  {local_path.name} → {self.bucket}/{full_key}")
        self.s3.upload_file(str(local_path), self.bucket, full_key, ExtraArgs=extra_args)
        
        return f"{self.base_url}/{full_key}"
    
    def upload_artifacts(self, output_dir: Path, version: str) -> dict:
        platforms = {}
        
        for target_name, target in TARGETS.items():
            target_dir = output_dir / target_name
            if not target_dir.exists():
                continue
            
            main_artifact, signature = None, None
            
            for f in target_dir.iterdir():
                if f.suffix == ".sig":
                    signature = f
                elif any(f.name.endswith(ext) for ext in [".app.tar.gz", ".AppImage", ".msi", ".nsis.zip"]):
                    main_artifact = f
            
            if not main_artifact:
                continue
            
            s3_subdir = f"{target.os}/{target.arch}"
            url = self.upload_file(main_artifact, f"{version}/{s3_subdir}/{main_artifact.name}")
            
            sig_content = ""
            if signature:
                self.upload_file(signature, f"{version}/{s3_subdir}/{signature.name}")
                sig_content = signature.read_text().strip()
            
            for f in target_dir.iterdir():
                if f not in (main_artifact, signature):
                    self.upload_file(f, f"{version}/{s3_subdir}/{f.name}")
            
            platforms[target.platform_key] = {"signature": sig_content, "url": url}
        
        return platforms
    
    def upload_manifest(self, manifest_path: Path) -> str:
        return self.upload_file(manifest_path, "latest.json", "application/json")


def generate_manifest(output_dir: Path, version: str, platforms: dict, base_url: str = None) -> Path:
    if not platforms:
        for target_name, target in TARGETS.items():
            target_dir = output_dir / target_name
            if not target_dir.exists():
                continue
            
            for sig_file in target_dir.glob("*.sig"):
                signature = sig_file.read_text().strip()
                artifact_name = sig_file.stem
                # Use provided base_url or fallback to placeholder
                url_base = base_url or "https://YOUR_BUCKET.s3.amazonaws.com/releases"
                platforms[target.platform_key] = {
                    "signature": signature,
                    "url": f"{url_base}/{version}/{target.os}/{target.arch}/{artifact_name}",
                }
    
    manifest = {
        "version": version,
        "notes": f"Update to version {version}",
        "pub_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": platforms,
    }
    
    manifest_path = output_dir / "latest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    
    print_success(f"Generated {manifest_path}")
    return manifest_path


# =============================================================================
# Interactive Main
# =============================================================================

def main():
    # Note: Running as root (sudo) can break SSH keys and Docker credentials
    # On Mac, Docker Desktop doesn't require root
    
    print_header("K8s GUI Build Script")
    print(f"   Platform: {get_current_platform()}")
    print(f"   Available targets: {', '.join(get_available_targets())}")
    
    # Check prerequisites
    print_step("Checking Prerequisites")
    if not check_prerequisites():
        sys.exit(1)
    print_success("All prerequisites installed")
    
    # Choose action
    print_step("What do you want to do?")
    actions = [
        "Build application",
        "Upload existing artifacts to S3",
        "Manage remote build hosts",
        "Show available targets",
    ]
    action = ask_choice("Select action:", actions)[0]
    
    # Manage remote hosts
    if "Manage" in action:
        remote_hosts = load_remote_hosts()
        
        while True:
            print_step("Remote Build Hosts")
            if remote_hosts:
                for i, h in enumerate(remote_hosts, 1):
                    targets = ", ".join(h.get_buildable_targets())
                    print(f"   [{i}] {h.name} ({h.host}) - {h.platform} → {targets}")
            else:
                print("   (no hosts configured)")
            
            host_actions = ["Add new host", "Test host connection", "Remove host", "Done"]
            host_action = ask_choice("Action:", host_actions)[0]
            
            if "Add" in host_action:
                new_host = ask_add_remote_host()
                if new_host:
                    if test_remote_host(new_host):
                        print_success(f"Connected to {new_host.host}")
                        remote_hosts.append(new_host)
                        save_remote_hosts(remote_hosts)
                    else:
                        print_error(f"Cannot connect to {new_host.host}")
                        if ask_yes_no("Add anyway?", default=False):
                            remote_hosts.append(new_host)
                            save_remote_hosts(remote_hosts)
            
            elif "Test" in host_action and remote_hosts:
                for h in remote_hosts:
                    if test_remote_host(h):
                        print_success(f"{h.name}: OK")
                    else:
                        print_error(f"{h.name}: FAILED")
            
            elif "Remove" in host_action and remote_hosts:
                idx = int(ask(f"Host number to remove [1-{len(remote_hosts)}]", "0")) - 1
                if 0 <= idx < len(remote_hosts):
                    removed = remote_hosts.pop(idx)
                    save_remote_hosts(remote_hosts)
                    print_success(f"Removed {removed.name}")
            
            elif "Done" in host_action:
                break
        return
    
    # Show targets (using unified build method detection)
    if "Show" in action:
        print_step("Available Targets")
        remote_hosts = load_remote_hosts()
        
        # Use the same logic as build mode
        all_targets = get_all_buildable_targets(remote_hosts)
        
        for name, (method, extra) in all_targets.items():
            target = TARGETS[name]
            cross = color(" (cross)", Colors.YELLOW) if target.requires_cross else ""
            
            if method == BuildMethod.NATIVE:
                status = color("✓ native", Colors.GREEN)
            elif method == BuildMethod.DOCKER:
                status = color("✓ docker", Colors.CYAN)
            elif method == BuildMethod.DOCKER_WINDOWS:
                status = color("✓ docker-windows", Colors.CYAN)
            elif method == BuildMethod.REMOTE:
                host_name = extra.name if extra else "remote"
                status = color(f"✓ remote ({host_name})", Colors.BLUE)
            else:
                status = color("✗", Colors.RED)
            
            print(f"   {status} {name}: {target.rust_target}{cross}")
        
        if check_docker():
            print_info("\nDocker available for Linux builds")
        if check_docker_windows_available():
            print_info("Docker Windows VM running for Windows builds")
        if remote_hosts:
            print_info(f"\n{len(remote_hosts)} remote host(s) configured")
        return
    
    output_dir = Path("artifacts")
    
    # Upload only mode
    if "Upload" in action:
        version = get_version_from_config()
        print_info(f"Version: {version}")
        
        s3_config = ask_s3_config()
        if not s3_config:
            sys.exit(1)
        
        print_step("Uploading to S3/MinIO")
        uploader = S3Uploader(**s3_config)
        platforms = uploader.upload_artifacts(output_dir, version)
        # Pass uploader's base_url for correct URL generation
        base_url = f"{uploader.base_url}/{s3_config.get('prefix', 'releases')}"
        manifest = generate_manifest(output_dir, version, platforms, base_url)
        uploader.upload_manifest(manifest)
        
        print_success("Upload complete!")
        return
    
    # Build mode
    
    # Version
    version = interactive_version()
    print_info(f"Building version: {version}")
    
    # Load and verify remote hosts automatically
    remote_hosts = load_remote_hosts()
    verified_hosts = []
    
    if remote_hosts:
        print_step("Checking Remote Hosts")
        verified_hosts = verify_remote_hosts(remote_hosts)
        if verified_hosts:
            print_info(f"{len(verified_hosts)}/{len(remote_hosts)} hosts available")
    
    # Get all targets with their build methods
    all_targets = get_all_buildable_targets(verified_hosts)
    
    # Filter to only buildable targets
    buildable = {name: (method, extra) for name, (method, extra) in all_targets.items() 
                 if method != BuildMethod.UNAVAILABLE}
    unavailable = [name for name, (method, _) in all_targets.items() 
                   if method == BuildMethod.UNAVAILABLE]
    
    if not buildable:
        print_error("No buildable targets available!")
        sys.exit(1)
    
    # Show available methods
    print_step("Available Targets")
    for name, (method, extra) in buildable.items():
        method_label = format_target_with_method(name, method, extra)
        print(f"   ✓ {method_label}")
    
    if unavailable:
        for name in unavailable:
            print(f"   ✗ {name} (no build method)")
    
    # Select targets
    target_choices = [format_target_with_method(name, method, extra) 
                      for name, (method, extra) in buildable.items()]
    
    selected_choices = ask_choice(
        "Select targets to build:",
        target_choices,
        allow_multiple=True
    )
    
    if not selected_choices:
        print_error("No targets selected")
        sys.exit(1)
    
    # Map selected back to target names and methods
    selected_builds = []  # [(target_name, method, extra), ...]
    for choice in selected_choices:
        # Extract target name from choice string
        target_name = choice.split(" (")[0]
        if target_name in buildable:
            method, extra = buildable[target_name]
            selected_builds.append((target_name, method, extra))
    
    # Auth URL
    auth_url = ask("Auth server URL", os.environ.get("VITE_AUTH_SERVER_URL", ""))
    if not auth_url:
        print_error("Auth URL is required")
        sys.exit(1)
    
    # Release mode (signing)
    release_mode = ask_yes_no("Release mode (sign artifacts)?", default=False)
    
    if release_mode:
        if "TAURI_SIGNING_PRIVATE_KEY" not in os.environ:
            key_path = ask("Path to signing key", os.path.expanduser("~/.tauri/k8s-gui.key"))
            if not Path(key_path).exists():
                print_error(f"Key not found: {key_path}")
                sys.exit(1)
            os.environ["TAURI_SIGNING_PRIVATE_KEY"] = Path(key_path).read_text()
            
            password = ask("Key password (leave empty if none)", "")
            if password:
                os.environ["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"] = password
    
    # Upload to S3/MinIO?
    upload_s3 = False
    s3_config = {}
    if release_mode:
        upload_s3 = ask_yes_no("Upload to S3/MinIO after build?", default=True)
        if upload_s3:
            s3_config = ask_s3_config()
            if not s3_config:
                print_warning("Upload configuration cancelled, will skip upload")
                upload_s3 = False
    
    # Confirm
    print_step("Build Configuration")
    print(f"   Version:  {version}")
    print(f"   Targets:  {', '.join(name for name, _, _ in selected_builds)}")
    print(f"   Auth URL: {auth_url}")
    print(f"   Release:  {'Yes' if release_mode else 'No'}")
    print(f"   S3:       {'Yes' if upload_s3 else 'No'}")
    
    if not ask_yes_no("\nProceed with build?"):
        print("Cancelled.")
        return
    
    # Setup env
    env = {"VITE_AUTH_SERVER_URL": auth_url}
    if release_mode:
        env["TAURI_SIGNING_PRIVATE_KEY"] = os.environ.get("TAURI_SIGNING_PRIVATE_KEY", "")
        if "TAURI_SIGNING_PRIVATE_KEY_PASSWORD" in os.environ:
            env["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"] = os.environ["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"]
    
    # Create output dir
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Check if we need frontend build (for native builds)
    has_native = any(method == BuildMethod.NATIVE for _, method, _ in selected_builds)
    if has_native:
        build_frontend()
    
    # Build all targets using their determined methods
    all_artifacts = []
    failed = []
    
    for target_name, method, extra in selected_builds:
        target = TARGETS[target_name]
        try:
            if method == BuildMethod.NATIVE:
                build_target(target, env)
                target_output = output_dir / target_name
                target_output.mkdir(parents=True, exist_ok=True)
                artifacts = collect_artifacts(target, target_output)
                all_artifacts.extend(artifacts)
            
            elif method == BuildMethod.DOCKER:
                build_target_docker(target, env)
                target_output = output_dir / target_name
                target_output.mkdir(parents=True, exist_ok=True)
                artifacts = collect_artifacts(target, target_output)
                all_artifacts.extend(artifacts)
            
            elif method == BuildMethod.DOCKER_WINDOWS:
                build_target_docker_windows(target, env)
                target_output = output_dir / target_name
                target_output.mkdir(parents=True, exist_ok=True)
                artifacts = collect_artifacts(target, target_output)
                all_artifacts.extend(artifacts)
            
            elif method == BuildMethod.REMOTE:
                host = extra
                artifacts = build_target_remote(host, target, env, output_dir)
                all_artifacts.extend(artifacts)
        
        except BuildError as e:
            method_label = f" ({extra.name})" if method == BuildMethod.REMOTE and extra else f" ({method})"
            print_error(f"{target_name}{method_label}: {e}")
            failed.append(target_name)
    
    succeeded = [name for name, _, _ in selected_builds if name not in failed]
    
    # Generate manifest
    platforms = {}
    manifest = generate_manifest(output_dir, version, platforms)
    
    # Upload if requested
    if upload_s3 and succeeded:
        print_step("Uploading to S3")
        try:
            uploader = S3Uploader(**s3_config)
            platforms = uploader.upload_artifacts(output_dir, version)
            # Pass uploader's base_url for correct URL generation
            base_url = f"{uploader.base_url}/{s3_config.get('prefix', 'releases')}"
            manifest = generate_manifest(output_dir, version, platforms, base_url)
            uploader.upload_manifest(manifest)
            print_success("Upload complete!")
        except Exception as e:
            print_error(f"Upload failed: {e}")
    
    # Summary
    print_header("Build Summary")
    print(f"   Version: {version}")
    
    if succeeded:
        print_success(f"Succeeded: {', '.join(succeeded)}")
    if failed:
        print_error(f"Failed: {', '.join(failed)}")
    
    print(f"\n   📁 Artifacts: {output_dir.absolute()}")
    for artifact in all_artifacts:
        size = artifact.stat().st_size / 1024 / 1024
        print(f"      • {artifact.name} ({size:.1f} MB)")
    
    if failed:
        sys.exit(1)
    
    print_success("Done!")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nCancelled.")
        sys.exit(1)
    except BuildError as e:
        print_error(str(e))
        sys.exit(1)
