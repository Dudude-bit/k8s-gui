//! User profile handlers

use actix_web::{web, HttpResponse, Responder, HttpRequest};
use crate::error::{AppError, Result};
use crate::middleware::auth::get_user_id_from_http_request;
use crate::services::user::{UserService, UpdateProfileRequest};

pub async fn get_profile(
    req: HttpRequest,
    service: web::Data<UserService>,
) -> Result<impl Responder> {
    let user_id = get_user_id_from_http_request(&req)
        .ok_or_else(|| AppError::Authentication("User not authenticated".to_string()))?;

    let response = service.get_profile(user_id).await?;
    Ok(HttpResponse::Ok().json(response))
}

pub async fn update_profile(
    req: HttpRequest,
    body: web::Json<UpdateProfileRequest>,
    service: web::Data<UserService>,
) -> Result<impl Responder> {
    let user_id = get_user_id_from_http_request(&req)
        .ok_or_else(|| AppError::Authentication("User not authenticated".to_string()))?;

    let response = service.update_profile(user_id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(response))
}

