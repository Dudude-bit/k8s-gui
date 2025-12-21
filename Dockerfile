# Dockerfile for Tauri build (Fedora, linux-x64)
FROM fedora:40

# Faster, more reproducible
ENV NODE_ENV=production
ENV CARGO_HOME=/root/.cargo
ENV RUSTUP_HOME=/root/.rustup
ENV PATH="/root/.cargo/bin:${PATH}"
ENV CARGO_BUILD_TARGET=x86_64-unknown-linux-gnu

WORKDIR /app

# System dependencies for Rust + Tauri (GTK/WebKit)
# NOTE: depending on your Tauri/WebKit version, libsoup3-devel may be needed instead of libsoup-devel
RUN dnf -y update && dnf -y install \
    bash curl git make gcc gcc-c++ pkgconf-pkg-config \
    openssl openssl-devel ca-certificates \
    nodejs npm \
    gtk3-devel \
    webkit2gtk4.1-devel \
    libsoup-devel \
    libappindicator-gtk3-devel \
    && dnf clean all

# Install Rust (stable toolchain) + add target
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain stable --profile minimal \
  && rustup target add ${CARGO_BUILD_TARGET}

# ---- Cache-friendly copy (manifests/locks first) ----
# JS
COPY package.json package-lock.json ./
# Rust
COPY Cargo.toml Cargo.lock ./
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock ./src-tauri/

# Install JS deps (strict, reproducible)
# If you need dev deps for build, remove NODE_ENV=production or add --include=dev
RUN npm ci

# Copy rest of project
COPY . .

# Default shell
CMD ["bash"]
