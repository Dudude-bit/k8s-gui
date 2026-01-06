fn main() {
    tauri_build::build();

    // Ensure we rebuild if the auth server URL changes, as it's baked into the binary
    println!("cargo:rerun-if-env-changed=VITE_AUTH_SERVER_URL");

    // Rebuild if any proto definitions change
    println!("cargo:rerun-if-changed=../auth-server/proto");

    // Compile gRPC proto files (shared from auth-server)
    tonic_build::configure()
        .build_server(false)
        .build_client(true)
        .out_dir("src/proto")
        .compile_protos(
            &[
                "../auth-server/proto/auth.proto",
                "../auth-server/proto/license.proto",
                "../auth-server/proto/user.proto",
                "../auth-server/proto/payment.proto",
            ],
            &["../auth-server/proto"],
        )
        .expect("Failed to compile proto files");
}
