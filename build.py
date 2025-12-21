#!/usr/bin/env python3
import argparse
import subprocess
import sys
import os
from pathlib import Path

# Supported targets
TARGETS = {
    "linux-x64":   "x86_64-unknown-linux-gnu",
    "linux-arm64": "aarch64-unknown-linux-gnu",
    "windows-x64": "x86_64-pc-windows-gnu",
    "windows-arm64": "aarch64-pc-windows-gnu",
    # macos-arm64 only possible on mac host
    "macos-arm64": "aarch64-apple-darwin",
}

ARTIFACTS = Path("artifacts")
ARTIFACTS.mkdir(exist_ok=True)


def run(cmd, **kwargs):
    print(f"[RUN] {cmd}")
    subprocess.run(cmd, shell=True, check=True, **kwargs)

def build_in_docker(target):
    # Map target to cross/cargo target
    docker_cmd = (
        f"docker build -t k8s-gui-build . && "
        f"docker run --rm -v $PWD:/app -w /app k8s-gui-build "
        f"bash -c 'source $HOME/.cargo/env && cross build --release --target {target}'"
    )
    run(docker_cmd)
    # Copy artifact
    target_dir = Path(f"target/{target}/release")
    for bin in target_dir.glob("k8s-gui*"):
        out = ARTIFACTS / f"k8s-gui_{target}"
        print(f"Copying {bin} -> {out}")
        out.write_bytes(bin.read_bytes())

def build_macos_arm64():
    # Only works on macOS arm64 host with Xcode and bun
    run("bun install")
    run("cargo build --release --target aarch64-apple-darwin")
    run("bun tauri build")
    target_dir = Path("target/aarch64-apple-darwin/release")
    for bin in target_dir.glob("k8s-gui*"):
        out = ARTIFACTS / f"k8s-gui_aarch64-apple-darwin"
        print(f"Copying {bin} -> {out}")
        out.write_bytes(bin.read_bytes())

def build_macos_x64():
    # Only works on macOS x64 host with Xcode and bun
    run("bun install")
    run("cargo build --release --target x86_64-apple-darwin")
    run("bun tauri build")
    target_dir = Path("target/x86_64-apple-darwin/release")
    for bin in target_dir.glob("k8s-gui*"):
        out = ARTIFACTS / f"k8s-gui_x86_64-apple-darwin"
        print(f"Copying {bin} -> {out}")
        out.write_bytes(bin.read_bytes())

def main():
    parser = argparse.ArgumentParser(description="Cross-build k8s-gui for multiple platforms")
    parser.add_argument("--targets", nargs="*", default=list(TARGETS.keys()) + ["macos-x64"], help="Targets to build")
    args = parser.parse_args()

    for name in args.targets:
        if name == "macos-arm64":
            if sys.platform != "darwin" or os.uname().machine != "arm64":
                print("macos-arm64 build only supported on Apple Silicon host")
                continue
            build_macos_arm64()
        elif name == "macos-x64":
            if sys.platform != "darwin" or os.uname().machine != "x86_64":
                print("macos-x64 build only supported on Intel Mac host")
                continue
            build_macos_x64()
        else:
            target = TARGETS.get(name)
            if not target:
                print(f"Unknown target: {name}")
                continue
            build_in_docker(target)
    print(f"Artifacts in {ARTIFACTS.resolve()}")

if __name__ == "__main__":
    main()
