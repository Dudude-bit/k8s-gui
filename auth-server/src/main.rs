//! Authentication and Licensing Server (gRPC)
//! 
//! gRPC server for user authentication, license management, and payment tracking

mod config;
mod db;
mod grpc;
mod utils;
mod error;
mod services;
mod proto;
mod tasks;

use std::sync::Arc;
use tonic::transport::Server;

use crate::proto::auth::auth_service_server::AuthServiceServer;
use crate::proto::license::license_service_server::LicenseServiceServer;
use crate::proto::payment::payment_service_server::PaymentServiceServer;
use crate::proto::user::user_service_server::UserServiceServer;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv::dotenv().ok();
    
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    let config = config::Config::from_env().expect("Failed to load configuration");
    let config = Arc::new(config);
    
    let db_pool = db::create_pool(&config.database_url)
        .await
        .expect("Failed to create database pool");

    let addr = format!("{}:{}", config.host, config.port).parse()?;
    tracing::info!("Starting gRPC server on {}", addr);

    // Create business services
    let auth_service = Arc::new(services::auth::AuthService::new(db_pool.clone(), (*config).clone()));
    let user_service = Arc::new(services::user::UserService::new(db_pool.clone()));
    let license_service = Arc::new(services::license::LicenseService::new(db_pool.clone()));
    let payment_service = Arc::new(services::payment::PaymentService::new(db_pool.clone()));

    // Spawn background tasks for cleanup
    tasks::spawn_background_tasks(Arc::new(db_pool));

    // Create gRPC services
    let auth_grpc = grpc::AuthGrpcService::new(auth_service.clone());
    let license_grpc = grpc::LicenseGrpcService::new(license_service, auth_service.clone());
    let payment_grpc = grpc::PaymentGrpcService::new(payment_service, auth_service.clone(), config);
    let user_grpc = grpc::UserGrpcService::new(user_service, auth_service);

    Server::builder()
        .add_service(AuthServiceServer::new(auth_grpc))
        .add_service(LicenseServiceServer::new(license_grpc))
        .add_service(PaymentServiceServer::new(payment_grpc))
        .add_service(UserServiceServer::new(user_grpc))
        .serve(addr)
        .await?;

    Ok(())
}
