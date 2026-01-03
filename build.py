#!/usr/bin/env python3
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
        print(f"   [a] All")
        result = input(f"\n   Choose (comma-separated for multiple): ").strip().lower()
        
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


def build_frontend():
    print_step("Building Frontend")
    run_command(["npm", "ci"])
    run_command(["npm", "run", "build"])
    print_success("Frontend built")


def build_target(target: Target, env: dict):
    print_step(f"Building {target.name}")
    
    ensure_rust_target(target)
    
    build_env = env.copy()
    
    if target.requires_cross and target.rust_target == "aarch64-unknown-linux-gnu":
        build_env.update({
            "CC_aarch64_unknown_linux_gnu": "aarch64-linux-gnu-gcc",
            "CXX_aarch64_unknown_linux_gnu": "aarch64-linux-gnu-g++",
            "CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER": "aarch64-linux-gnu-gcc",
            "PKG_CONFIG_ALLOW_CROSS": "1",
        })
    
    run_command(["cargo", "tauri", "build", "--target", target.rust_target], env=build_env)
    print_success(f"{target.name} built")


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


def generate_manifest(output_dir: Path, version: str, platforms: dict) -> Path:
    if not platforms:
        for target_name, target in TARGETS.items():
            target_dir = output_dir / target_name
            if not target_dir.exists():
                continue
            
            for sig_file in target_dir.glob("*.sig"):
                signature = sig_file.read_text().strip()
                artifact_name = sig_file.stem
                platforms[target.platform_key] = {
                    "signature": signature,
                    "url": f"https://YOUR_BUCKET.s3.amazonaws.com/releases/{version}/{target.os}/{target.arch}/{artifact_name}",
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
        "Show available targets",
    ]
    action = ask_choice("Select action:", actions)[0]
    
    if "Show" in action:
        print_step("Available Targets")
        available = get_available_targets()
        for name, target in TARGETS.items():
            status = color("✓", Colors.GREEN) if name in available else color("✗", Colors.RED)
            cross = color(" (cross)", Colors.YELLOW) if target.requires_cross else ""
            print(f"   {status} {name}: {target.rust_target}{cross}")
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
        manifest = generate_manifest(output_dir, version, platforms)
        uploader.upload_manifest(manifest)
        
        print_success("Upload complete!")
        return
    
    # Build mode
    
    # Version
    version = interactive_version()
    print_info(f"Building version: {version}")
    
    # Select targets
    available_targets = get_available_targets()
    selected_targets = ask_choice(
        "Select targets to build:",
        available_targets,
        allow_multiple=True
    )
    
    if not selected_targets:
        print_error("No targets selected")
        sys.exit(1)
    
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
    print(f"   Targets:  {', '.join(selected_targets)}")
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
    
    # Build frontend
    build_frontend()
    
    # Build targets
    all_artifacts = []
    failed = []
    
    for target_name in selected_targets:
        target = TARGETS[target_name]
        try:
            build_target(target, env)
            target_output = output_dir / target_name
            target_output.mkdir(parents=True, exist_ok=True)
            artifacts = collect_artifacts(target, target_output)
            all_artifacts.extend(artifacts)
        except BuildError as e:
            print_error(f"{target_name}: {e}")
            failed.append(target_name)
    
    succeeded = [t for t in selected_targets if t not in failed]
    
    # Generate manifest
    platforms = {}
    manifest = generate_manifest(output_dir, version, platforms)
    
    # Upload if requested
    if upload_s3 and succeeded:
        print_step("Uploading to S3")
        try:
            uploader = S3Uploader(s3_config["bucket"], s3_config["prefix"], s3_config["region"])
            platforms = uploader.upload_artifacts(output_dir, version)
            manifest = generate_manifest(output_dir, version, platforms)
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
