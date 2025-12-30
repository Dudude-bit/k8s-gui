//! Authentication and Licensing Server (gRPC)
//!
//! gRPC server for user authentication, license management, and payment tracking

mod config;
mod db;
mod error;
mod grpc;
mod proto;
mod services;
mod tasks;
mod utils;

use std::sync::Arc;

use tonic::transport::Server;

use crate::proto::auth::auth_service_server::AuthServiceServer;
use crate::proto::license::license_service_server::LicenseServiceServer;
use crate::proto::payment::payment_service_server::PaymentServiceServer;
use crate::proto::user::user_service_server::UserServiceServer;
use crate::utils::rate_limit::RateLimiters;
use k8s_gui_common::init_tracing;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv::dotenv().ok();

    // Initialize tracing
    init_tracing();

    let config =
        config::Config::load().map_err(|e| format!("Failed to load configuration: {e}"))?;
    let config = Arc::new(config);

    let db_pool = db::create_pool(&config.database_url)
        .await
        .map_err(|e| format!("Failed to create database pool: {e}"))?;

    let addr = format!("{}:{}", config.host, config.port)
        .parse()
        .map_err(|e| format!("Failed to parse server address: {e}"))?;
    tracing::info!("Starting gRPC server on {}", addr);

    // Create rate limiters
    let rate_limiters = Arc::new(RateLimiters::new());

    // Create business services
    let auth_service = Arc::new(services::auth::AuthService::new(
        db_pool.clone(),
        (*config).clone(),
    ));
    let user_service = Arc::new(services::user::UserService::new(db_pool.clone()));
    let license_service = Arc::new(services::license::LicenseService::new(db_pool.clone()));
    let payment_service = Arc::new(services::payment::PaymentService::new(db_pool.clone()));

    // Spawn background tasks for cleanup
    tasks::spawn_background_tasks(Arc::new(db_pool), rate_limiters.clone());

    // Create gRPC services
    let auth_grpc = grpc::AuthGrpcService::new(auth_service.clone(), rate_limiters);
    let license_grpc = grpc::LicenseGrpcService::new(license_service, auth_service.clone());
    let payment_grpc = grpc::PaymentGrpcService::new(payment_service, auth_service.clone(), config);
    let user_grpc = grpc::UserGrpcService::new(user_service, auth_service);

    Server::builder()
        .add_service(AuthServiceServer::new(auth_grpc))
        .add_service(LicenseServiceServer::new(license_grpc))
        .add_service(PaymentServiceServer::new(payment_grpc))
        .add_service(UserServiceServer::new(user_grpc))
        .serve(addr)
        .await
        .map_err(|e| format!("Server error: {e}"))?;

    Ok(())
}
