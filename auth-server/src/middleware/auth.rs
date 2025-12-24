//! Authentication middleware for JWT validation

use actix_web::{dev::ServiceRequest, Error, HttpMessage};
use actix_web::body::MessageBody;
use actix_web::dev::{Service, ServiceResponse, Transform};
use actix_web::web::Data;
use crate::config::Config;
use crate::utils::jwt::JwtService;
use std::future::{ready, Ready};
use std::pin::Pin;
use std::rc::Rc;
use uuid::Uuid;

pub struct AuthMiddleware;

impl<S, B> Transform<S, ServiceRequest> for AuthMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = AuthService<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(AuthService {
            service: Rc::new(service),
        }))
    }
}

pub struct AuthService<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for AuthService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = Pin<Box<dyn std::future::Future<Output = Result<Self::Response, Self::Error>>>>;

    actix_web::dev::forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = self.service.clone();

        // Get config and create JWT service
        let config = req.app_data::<Data<Config>>().cloned();
        let auth_header = req.headers().get("Authorization").cloned();

        Box::pin(async move {
            let config = config.ok_or_else(|| {
                actix_web::error::ErrorInternalServerError("Configuration not found")
            })?;

            let jwt_service = JwtService::new(
                &config.jwt_secret,
                config.jwt_expiry as i64,
                config.refresh_token_expiry as i64,
            );

            // Extract token from Authorization header
            let token = auth_header
                .as_ref()
                .and_then(|h| h.to_str().ok())
                .and_then(|s| {
                    if s.starts_with("Bearer ") {
                        Some(s[7..].to_string())
                    } else {
                        None
                    }
                })
                .ok_or_else(|| {
                    actix_web::error::ErrorUnauthorized("Missing or invalid authorization header")
                })?;

            // Validate token
            let user_id = jwt_service.validate_access_token(&token)
                .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid or expired token"))?;

            // Store user_id in request extensions
            req.extensions_mut().insert::<Uuid>(user_id);

            service.call(req).await
        })
    }
}

pub fn get_user_id_from_http_request(req: &actix_web::HttpRequest) -> Option<Uuid> {
    req.extensions().get::<Uuid>().copied()
}

