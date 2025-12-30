fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure()
        .build_server(true)
        .build_client(false)
        .out_dir("src/proto")
        .compile_protos(
            &[
                "proto/auth.proto",
                "proto/license.proto",
                "proto/payment.proto",
                "proto/user.proto",
            ],
            &["proto"],
        )?;
    Ok(())
}
