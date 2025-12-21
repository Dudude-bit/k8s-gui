# Dockerfile for Tauri build (Fedora, linux-x64)
FROM fedora:40

# Install system deps
RUN dnf -y update && dnf -y install \
    curl git make gcc pkgconf-pkg-config openssl-devel \
    webkit2gtk4.1-devel gtk3-devel libsoup-devel \
    nodejs npm ca-certificates

# Install Rust (x86_64 only)
RUN curl https://sh.rustup.rs -sSf | bash -s -- -y --default-toolchain stable-x86_64-unknown-linux-gnu --profile default --no-modify-path
ENV PATH="/root/.cargo/bin:$PATH"
ENV CARGO_BUILD_TARGET=x86_64-unknown-linux-gnu

# Install Tauri CLI
RUN npm install -g @tauri-apps/cli





WORKDIR /app


# Copy only manifests first for cache
COPY package.json package-lock.json Cargo.toml ./
COPY src-tauri/Cargo.toml ./src-tauri/

# Install JS deps
RUN npm install

# Copy rest of the project
COPY . .

# Default: just show help
CMD ["bash"]
