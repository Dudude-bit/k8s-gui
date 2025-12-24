//! User profile handlers

use actix_web::{web, HttpResponse, Responder, HttpRequest};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use crate::error::{AppError, Result};
use crate::db::models::{User, UserProfile};
use crate::middleware::auth::get_user_id_from_http_request;

#[derive(Debug, Serialize)]
pub struct ProfileResponse {
    pub user_id: Uuid,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub company: Option<String>,
    pub email_verified: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub company: Option<String>,
}

pub async fn get_profile(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> Result<impl Responder> {
    let user_id = get_user_id_from_http_request(&req)
        .ok_or_else(|| AppError::Authentication("User not authenticated".to_string()))?;

    let user = User::find_by_id(pool.as_ref(), user_id).await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let profile = UserProfile::find_by_user_id(pool.as_ref(), user_id).await?;

    Ok(HttpResponse::Ok().json(ProfileResponse {
        user_id: user.id,
        email: user.email,
        first_name: profile.as_ref().and_then(|p| p.first_name.clone()),
        last_name: profile.as_ref().and_then(|p| p.last_name.clone()),
        company: profile.as_ref().and_then(|p| p.company.clone()),
        email_verified: user.email_verified,
    }))
}

pub async fn update_profile(
    req: HttpRequest,
    body: web::Json<UpdateProfileRequest>,
    pool: web::Data<PgPool>,
) -> Result<impl Responder> {
    let user_id = get_user_id_from_http_request(&req)
        .ok_or_else(|| AppError::Authentication("User not authenticated".to_string()))?;

    // Check if profile exists, create if not
    let profile = if UserProfile::find_by_user_id(&pool, user_id).await?.is_some() {
        UserProfile::update(
            pool.as_ref(),
            user_id,
            body.first_name.clone(),
            body.last_name.clone(),
            body.company.clone(),
        ).await?
    } else {
        UserProfile::create(
            pool.as_ref(),
            user_id,
            body.first_name.clone(),
            body.last_name.clone(),
            body.company.clone(),
        ).await?
    };

    let user = User::find_by_id(pool.as_ref(), user_id).await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    Ok(HttpResponse::Ok().json(ProfileResponse {
        user_id: user.id,
        email: user.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        company: profile.company,
        email_verified: user.email_verified,
    }))
}

