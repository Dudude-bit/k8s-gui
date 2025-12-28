//! Authentication handlers

use actix_web::{web, HttpResponse, Responder};
use crate::error::Result;
use crate::services::auth::{
    AuthService, RegisterRequest, LoginRequest, RefreshRequest, 
    ForgotPasswordRequest, ResetPasswordRequest
};

pub async fn register(
    req: web::Json<RegisterRequest>,
    service: web::Data<AuthService>,
) -> Result<impl Responder> {
    let response = service.register(req.into_inner()).await?;
    Ok(HttpResponse::Created().json(response))
}

pub async fn login(
    req: web::Json<LoginRequest>,
    service: web::Data<AuthService>,
    req_info: actix_web::HttpRequest,
) -> Result<impl Responder> {
    // Get IP and user agent
    let ip = req_info.connection_info().peer_addr()
        .map(|s| s.to_string());
    let user_agent = req_info.headers().get("user-agent")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string());

    let response = service.login(req.into_inner(), ip, user_agent).await?;
    Ok(HttpResponse::Ok().json(response))
}

pub async fn refresh(
    req: web::Json<RefreshRequest>,
    service: web::Data<AuthService>,
) -> Result<impl Responder> {
    let response = service.refresh(req.into_inner()).await?;
    Ok(HttpResponse::Ok().json(response))
}

pub async fn logout(
    req: web::Json<RefreshRequest>,
    service: web::Data<AuthService>,
) -> Result<impl Responder> {
    let response = service.logout(req.into_inner()).await?;
    Ok(HttpResponse::Ok().json(response))
}

pub async fn forgot_password(
    req: web::Json<ForgotPasswordRequest>,
    service: web::Data<AuthService>,
) -> Result<impl Responder> {
    let response = service.forgot_password(req.into_inner()).await?;
    Ok(HttpResponse::Ok().json(response))
}

pub async fn reset_password(
    req: web::Json<ResetPasswordRequest>,
    service: web::Data<AuthService>,
) -> Result<impl Responder> {
    let response = service.reset_password(req.into_inner()).await?;
    Ok(HttpResponse::Ok().json(response))
}

