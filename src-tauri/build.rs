use std::{
    env,
    fs,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

fn get_git_version() -> String {
    // Prefer exact tag if HEAD is tagged, otherwise fall back to commit hash.
    let tag_output = Command::new("git")
        .args(["describe", "--tags", "--exact-match"])
        .output();

    if let Ok(output) = tag_output {
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !version.is_empty() {
                return version;
            }
        }
    }

    // Fallback: get the short commit hash.
    let commit_output = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output();

    if let Ok(output) = commit_output {
        if output.status.success() {
            let commit = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !commit.is_empty() {
                return commit;
            }
        }
    }

    // If git is not available, return "unknown"
    "unknown".to_string()
}

fn main() {
    // Export git version as an environment variable for compilation
    let git_version = get_git_version();
    println!("cargo:rustc-env=GIT_VERSION={}", git_version);

    // Force rebuild every time to get fresh git version.
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set"));
    let stamp_path = manifest_dir.join(".force_rebuild");
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    fs::write(&stamp_path, now.to_string()).expect("Failed to write rebuild stamp");
    println!("cargo:rerun-if-changed={}", stamp_path.display());

    tauri_build::build();

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
