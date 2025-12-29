//! Authentication and Licensing Server
//! 
//! REST API server for user authentication, license management, and payment tracking

mod config;
mod db;
mod handlers;
mod middleware;
mod utils;
mod error;
mod services;
mod openapi;

use actix_web::{web, App, HttpServer};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;
use crate::openapi::ApiDoc;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv::dotenv().ok();
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    let config = config::Config::from_env().expect("Failed to load configuration");
    let db_pool = db::create_pool(&config.database_url)
        .await
        .expect("Failed to create database pool");

    log::info!("Starting authentication server on {}:{}", config.host, config.port);

    let config_clone = config.clone();
    let auth_service = services::auth::AuthService::new(db_pool.clone(), config.clone());
    let auth_service_data = web::Data::new(auth_service);
    
    let user_service = services::user::UserService::new(db_pool.clone());
    let user_service_data = web::Data::new(user_service);

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(config_clone.clone()))
            .app_data(web::Data::new(db_pool.clone()))
            .app_data(auth_service_data.clone())
            .app_data(user_service_data.clone())
            .wrap(middleware::cors::cors_middleware_with_origins(&config_clone))
            .wrap(actix_web::middleware::DefaultHeaders::new()
                .add(("X-Content-Type-Options", "nosniff"))
                .add(("X-Frame-Options", "DENY"))
                .add(("X-XSS-Protection", "1; mode=block"))
            )
            .service(
                SwaggerUi::new("/swagger-ui/{_:.*}")
                    .url("/api-docs/openapi.json", ApiDoc::openapi())
            )
            .service(
                web::scope("/api/v1")
                    .service(
                        web::scope("/auth")
                            .wrap(middleware::rate_limit::RateLimitMiddleware::new(5, 60)) // 5 requests per minute for auth endpoints
                            .route("/register", web::post().to(handlers::auth::register))
                            .route("/login", web::post().to(handlers::auth::login))
                            .route("/refresh", web::post().to(handlers::auth::refresh))
                            .route("/logout", web::post().to(handlers::auth::logout))
                            .route("/forgot-password", web::post().to(handlers::auth::forgot_password))
                            .route("/reset-password", web::post().to(handlers::auth::reset_password))
                    )
                    .service(
                        web::scope("/user")
                            .wrap(middleware::auth::AuthMiddleware)
                            .route("/profile", web::get().to(handlers::user::get_profile))
                            .route("/profile", web::put().to(handlers::user::update_profile))
                    )
                    .service(
                        web::scope("/license")
                            .service(
                                web::resource("/status")
                                    .wrap(middleware::auth::AuthMiddleware)
                                    .route(web::get().to(handlers::license::get_status))
                            )
                            .service(
                                web::resource("/activate")
                                    .wrap(middleware::auth::AuthMiddleware)
                                    .route(web::post().to(handlers::license::activate))
                            )
                            .service(
                                web::resource("/validate")
                                    .wrap(middleware::auth::AuthMiddleware)
                                    .route(web::get().to(handlers::license::validate))
                            )
                    )
                    .service(
                        web::scope("/payments")
                            .service(
                                web::scope("")
                                    .wrap(middleware::auth::AuthMiddleware)
                                    .route("/history", web::get().to(handlers::payment::get_history))
                            )
                            // Webhook endpoint doesn't require user auth (uses signature verification)
                            .route("/webhook", web::post().to(handlers::payment::handle_webhook))
                    )
            )
    })
    .bind((config.host.as_str(), config.port))?
    .run()
    .await
}

