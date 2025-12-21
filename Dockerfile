# Dockerfile for cross-platform Tauri build (Linux, Windows)
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install system deps
RUN apt-get update && apt-get install -y \
    curl git build-essential pkg-config libssl-dev \
    libwebkit2gtk-4.0-dev libgtk-3-dev libsoup2.4-dev \
    libjavascriptcoregtk-4.0-dev libayatana-appindicator3-dev \
    python3 python3-pip ca-certificates \
    cmake unzip xz-utils zip \
    musl-tools mingw-w64 \
    qemu-user-static binfmt-support \
    && rm -rf /var/lib/apt/lists/*


# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Install Rust
RUN curl https://sh.rustup.rs -sSf | bash -s -- -y
ENV PATH="/root/.cargo/bin:$PATH"

# Install cross for cross-compilation
RUN cargo install cross --git https://github.com/cross-rs/cross

# Install Tauri CLI
RUN bun add -g @tauri-apps/cli


WORKDIR /app

# Copy only manifests first for cache
COPY package.json bun.lockb Cargo.toml ./
COPY src-tauri/Cargo.toml ./src-tauri/

# Install JS deps
RUN bun install

# Copy rest of the project
COPY . .

# Default: just show help
CMD ["bash"]
