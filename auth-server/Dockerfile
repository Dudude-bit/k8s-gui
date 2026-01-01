FROM rust:1.88-bookworm as builder

# Install protobuf compiler for gRPC code generation
RUN apt-get update && apt-get install -y \
    protobuf-compiler \
    pkg-config \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace manifests
COPY Cargo.toml Cargo.lock ./
COPY auth-server/Cargo.toml auth-server/Cargo.toml
COPY auth-server/migration/Cargo.toml auth-server/migration/Cargo.toml
COPY k8s-gui-common/Cargo.toml k8s-gui-common/Cargo.toml

# Copy build script and proto files (needed for code generation)
COPY auth-server/build.rs auth-server/build.rs
COPY auth-server/proto auth-server/proto

# Copy source code
COPY auth-server/src auth-server/src
COPY auth-server/migration auth-server/migration
COPY k8s-gui-common/src k8s-gui-common/src

# Build for release
RUN cargo build -p auth-server --release --locked

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/release/auth-server /app/auth-server

EXPOSE 50051 8080

ENV RUST_LOG=info

CMD ["./auth-server"]
