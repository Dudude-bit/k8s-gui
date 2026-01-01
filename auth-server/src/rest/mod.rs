//! REST API for administrative operations.

use actix_web::{http::StatusCode, web, App, HttpRequest, HttpResponse, HttpServer, ResponseError};
use k8s_gui_common::ErrorExt;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::{OpenApi, ToSchema};
use uuid::Uuid;

use crate::db::entities::SubscriptionType;
use crate::error::{Error, Result};
use crate::services::admin::{AdminService, CreateUserRequest, IssueLicenseRequest};

#[derive(Clone)]
struct AppState {
    admin_service: Arc<AdminService>,
    admin_api_key: String,
}

pub struct RestConfig {
    pub host: String,
    pub port: u16,
    pub admin_api_key: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RegisterUserRequest {
    pub email: String,
    pub password: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub company: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RegisterUserResponse {
    #[schema(value_type = String)]
    pub user_id: Uuid,
    pub email: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum SubscriptionTypeDto {
    Infinite,
    Monthly,
}

impl From<SubscriptionTypeDto> for SubscriptionType {
    fn from(value: SubscriptionTypeDto) -> Self {
        match value {
            SubscriptionTypeDto::Infinite => SubscriptionType::Infinite,
            SubscriptionTypeDto::Monthly => SubscriptionType::Monthly,
        }
    }
}

impl From<SubscriptionType> for SubscriptionTypeDto {
    fn from(value: SubscriptionType) -> Self {
        match value {
            SubscriptionType::Infinite => SubscriptionTypeDto::Infinite,
            SubscriptionType::Monthly => SubscriptionTypeDto::Monthly,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct IssueLicenseRequestBody {
    #[schema(value_type = String)]
    pub user_id: Uuid,
    pub subscription_type: SubscriptionTypeDto,
    pub months: Option<i32>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct IssueLicenseResponse {
    #[schema(value_type = String)]
    pub license_id: Uuid,
    #[schema(value_type = String)]
    pub user_id: Uuid,
    pub license_key: String,
    pub subscription_type: SubscriptionTypeDto,
    pub expires_at: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub code: String,
    pub message: String,
}

impl ResponseError for Error {
    fn status_code(&self) -> StatusCode {
        match self {
            Error::Validation(_) => StatusCode::BAD_REQUEST,
            Error::Authentication(_) => StatusCode::UNAUTHORIZED,
            Error::Authorization(_) => StatusCode::FORBIDDEN,
            Error::NotFound(_) => StatusCode::NOT_FOUND,
            Error::Database(_) | Error::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        let payload = ApiError {
            code: self.error_code().to_string(),
            message: self.to_string(),
        };
        HttpResponse::build(self.status_code()).json(payload)
    }
}

fn require_admin_key(req: &HttpRequest, state: &AppState) -> Result<()> {
    let token = req
        .headers()
        .get("x-admin-token")
        .and_then(|value| value.to_str().ok());

    if token == Some(state.admin_api_key.as_str()) {
        Ok(())
    } else {
        Err(Error::Authentication(
            "Invalid or missing admin API key".to_string(),
        ))
    }
}

#[utoipa::path(
    post,
    path = "/admin/users",
    request_body = RegisterUserRequest,
    responses(
        (status = 200, description = "User registered", body = RegisterUserResponse),
        (status = 400, description = "Invalid input", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "admin"
)]
async fn register_user(
    state: web::Data<AppState>,
    req: HttpRequest,
    payload: web::Json<RegisterUserRequest>,
) -> Result<web::Json<RegisterUserResponse>> {
    require_admin_key(&req, &state)?;

    let payload = payload.into_inner();
    let result = state
        .admin_service
        .create_user(CreateUserRequest {
            email: payload.email,
            password: payload.password,
            first_name: payload.first_name,
            last_name: payload.last_name,
            company: payload.company,
        })
        .await?;

    Ok(web::Json(RegisterUserResponse {
        user_id: result.user_id,
        email: result.email,
    }))
}

#[utoipa::path(
    post,
    path = "/admin/licenses",
    request_body = IssueLicenseRequestBody,
    responses(
        (status = 200, description = "License issued", body = IssueLicenseResponse),
        (status = 400, description = "Invalid input", body = ApiError),
        (status = 404, description = "User not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "admin"
)]
async fn issue_license(
    state: web::Data<AppState>,
    req: HttpRequest,
    payload: web::Json<IssueLicenseRequestBody>,
) -> Result<web::Json<IssueLicenseResponse>> {
    require_admin_key(&req, &state)?;

    let payload = payload.into_inner();
    let months = payload.months.unwrap_or(1);
    let result = state
        .admin_service
        .issue_license(IssueLicenseRequest {
            user_id: payload.user_id,
            subscription_type: payload.subscription_type.into(),
            months,
        })
        .await?;

    Ok(web::Json(IssueLicenseResponse {
        license_id: result.license_id,
        user_id: result.user_id,
        license_key: result.license_key,
        subscription_type: result.subscription_type.into(),
        expires_at: result.expires_at.map(|dt| dt.to_rfc3339()),
        is_active: result.is_active,
    }))
}

#[utoipa::path(
    get,
    path = "/health",
    responses((status = 200, description = "Service is healthy")),
    tag = "system"
)]
async fn health_check() -> HttpResponse {
    HttpResponse::Ok().finish()
}

#[derive(OpenApi)]
#[openapi(
    paths(register_user, issue_license, health_check),
    components(schemas(
        RegisterUserRequest,
        RegisterUserResponse,
        IssueLicenseRequestBody,
        IssueLicenseResponse,
        SubscriptionTypeDto,
        ApiError
    )),
    tags(
        (name = "admin", description = "Administrative operations"),
        (name = "system", description = "System endpoints")
    )
)]
struct ApiDoc;

async fn openapi_json() -> HttpResponse {
    HttpResponse::Ok().json(ApiDoc::openapi())
}

pub async fn run(config: RestConfig, admin_service: Arc<AdminService>) -> Result<()> {
    let bind_addr = format!("{}:{}", config.host, config.port);
    tracing::info!("Starting REST server on {}", bind_addr);

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(AppState {
                admin_service: admin_service.clone(),
                admin_api_key: config.admin_api_key.clone(),
            }))
            .route("/health", web::get().to(health_check))
            .route("/api-docs/openapi.json", web::get().to(openapi_json))
            .service(web::resource("/admin/users").route(web::post().to(register_user)))
            .service(web::resource("/admin/licenses").route(web::post().to(issue_license)))
    })
    .bind(bind_addr)
    .map_err(|e| Error::Internal(format!("Failed to bind REST server: {e}")))?
    .run()
    .await
    .map_err(|e| Error::Internal(format!("REST server error: {e}")))?;

    Ok(())
}
