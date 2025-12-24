//! CORS middleware

use actix_cors::Cors;
use crate::config::Config;

pub fn cors_middleware_with_origins(config: &Config) -> Cors {
    let mut cors = Cors::default()
        .allow_any_method()
        .allow_any_header()
        .supports_credentials()
        .max_age(3600);

    for origin in &config.cors_allowed_origins {
        cors = cors.allowed_origin(origin);
    }

    cors
}

