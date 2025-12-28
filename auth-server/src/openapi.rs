use utoipa::OpenApi;
use crate::handlers;
use crate::services;

#[derive(OpenApi)]
#[openapi(
    paths(
        handlers::auth::register,
        handlers::auth::login,
        handlers::auth::refresh,
        handlers::auth::logout,
        handlers::auth::forgot_password,
        handlers::auth::reset_password,
        handlers::user::get_profile,
        handlers::user::update_profile,
        handlers::license::get_status,
        handlers::license::activate,
        handlers::license::validate,
        handlers::payment::get_history,
    ),
    components(
        schemas(
            services::auth::RegisterRequest,
            services::auth::LoginRequest,
            services::auth::RefreshRequest,
            services::auth::ForgotPasswordRequest,
            services::auth::ResetPasswordRequest,
            services::auth::AuthResponse,
            services::auth::MessageResponse,
            services::user::ProfileResponse,
            services::user::UpdateProfileRequest,
            handlers::license::LicenseStatusResponse,
            handlers::license::ActivateLicenseRequest,
            handlers::payment::PaymentHistoryResponse,
            handlers::payment::PaymentInfo,
        )
    ),
    tags(
        (name = "auth", description = "Authentication endpoints"),
        (name = "user", description = "User profile endpoints"),
        (name = "license", description = "License management endpoints"),
        (name = "payment", description = "Payment history endpoints")
    ),
    modifiers(&SecurityAddon)
)]
pub struct ApiDoc;

pub struct SecurityAddon;

impl utoipa::Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let components = openapi.components.get_or_insert(Default::default());
        components.add_security_scheme(
            "bearer_auth",
            utoipa::openapi::security::SecurityScheme::Http(
                utoipa::openapi::security::HttpBuilder::new()
                    .scheme(utoipa::openapi::security::HttpAuthScheme::Bearer)
                    .bearer_format("JWT")
                    .build(),
            ),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn write_openapi_json() {
        let doc = ApiDoc::openapi().to_pretty_json().unwrap();
        let mut file = std::fs::File::create("auth-openapi.json").unwrap();
        file.write_all(doc.as_bytes()).unwrap();
    }
}
