//! Authentication handlers

use actix_web::{web, HttpResponse, Responder};
use crate::error::Result;
use crate::services::auth::{
    AuthService, RegisterRequest, LoginRequest, RefreshRequest, 
    ForgotPasswordRequest, ResetPasswordRequest
};

#[utoipa::path(
    post,
    path = "/api/v1/auth/register",
    request_body = RegisterRequest,
    responses(
        (status = 201, description = "User registered successfully", body = AuthResponse),
        (status = 400, description = "Validation error")
    )
)]
pub async fn register(
    req: web::Json<RegisterRequest>,
    service: web::Data<AuthService>,
) -> Result<impl Responder> {
    let response = service.register(req.into_inner()).await?;
    Ok(HttpResponse::Created().json(response))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/login",
    request_body = LoginRequest,
    responses(
        (status = 200, description = "User logged in successfully", body = AuthResponse),
        (status = 401, description = "Invalid credentials")
    )
)]
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

#[utoipa::path(
    post,
    path = "/api/v1/auth/refresh",
    request_body = RefreshRequest,
    responses(
        (status = 200, description = "Token refreshed successfully", body = AuthResponse),
        (status = 401, description = "Invalid refresh token")
    )
)]
pub async fn refresh(
    req: web::Json<RefreshRequest>,
    service: web::Data<AuthService>,
) -> Result<impl Responder> {
    let response = service.refresh(req.into_inner()).await?;
    Ok(HttpResponse::Ok().json(response))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/logout",
    request_body = RefreshRequest,
    responses(
        (status = 200, description = "Logged out successfully", body = MessageResponse)
    )
)]
pub async fn logout(
    req: web::Json<RefreshRequest>,
    service: web::Data<AuthService>,
) -> Result<impl Responder> {
    let response = service.logout(req.into_inner()).await?;
    Ok(HttpResponse::Ok().json(response))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/forgot-password",
    request_body = ForgotPasswordRequest,
    responses(
        (status = 200, description = "Password reset email sent", body = MessageResponse)
    )
)]
pub async fn forgot_password(
    req: web::Json<ForgotPasswordRequest>,
    service: web::Data<AuthService>,
) -> Result<impl Responder> {
    let response = service.forgot_password(req.into_inner()).await?;
    Ok(HttpResponse::Ok().json(response))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/reset-password",
    request_body = ResetPasswordRequest,
    responses(
        (status = 200, description = "Password reset successfully", body = MessageResponse)
    )
)]
pub async fn reset_password(
    req: web::Json<ResetPasswordRequest>,
    service: web::Data<AuthService>,
) -> Result<impl Responder> {
    let response = service.reset_password(req.into_inner()).await?;
    Ok(HttpResponse::Ok().json(response))
}

