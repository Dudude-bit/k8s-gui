//! Auth gRPC service implementation

use tonic::{Request, Response, Status};
use crate::proto::auth::{
    auth_service_server::AuthService,
    AuthResponse, RegisterRequest, LoginRequest, RefreshRequest,
    MessageResponse,
};
use crate::services::auth::AuthService as AuthBusinessService;
use crate::utils::rate_limit::RateLimiters;
use std::sync::Arc;

pub struct AuthGrpcService {
    service: Arc<AuthBusinessService>,
    rate_limiters: Arc<RateLimiters>,
}

impl AuthGrpcService {
    pub fn new(service: Arc<AuthBusinessService>, rate_limiters: Arc<RateLimiters>) -> Self {
        Self { service, rate_limiters }
    }

    /// Extract client IP from request metadata for rate limiting
    fn extract_client_ip<T>(request: &Request<T>) -> String {
        // Try to get IP from x-forwarded-for header (when behind proxy)
        if let Some(forwarded) = request.metadata().get("x-forwarded-for") {
            if let Ok(ip) = forwarded.to_str() {
                // Take the first IP in the chain
                return ip.split(',').next().unwrap_or("unknown").trim().to_string();
            }
        }
        
        // Try to get from x-real-ip header
        if let Some(real_ip) = request.metadata().get("x-real-ip") {
            if let Ok(ip) = real_ip.to_str() {
                return ip.to_string();
            }
        }
        
        // Fallback to remote address
        request.remote_addr()
            .map(|addr| addr.ip().to_string())
            .unwrap_or_else(|| "unknown".to_string())
    }
}

#[tonic::async_trait]
impl AuthService for AuthGrpcService {
    async fn register(
        &self,
        request: Request<RegisterRequest>,
    ) -> Result<Response<AuthResponse>, Status> {
        // Rate limit by IP
        let client_ip = Self::extract_client_ip(&request);
        if let Err(retry_after) = self.rate_limiters.register.check(&client_ip) {
            return Err(Status::resource_exhausted(format!(
                "Too many registration attempts. Please try again in {} seconds.",
                retry_after
            )));
        }

        let req = request.into_inner();
        
        let business_req = crate::services::auth::RegisterRequest {
            email: req.email,
            password: req.password,
            first_name: None,
            last_name: None,
            company: None,
        };
        
        let result = self.service.register(business_req).await
            .map_err(|e| Status::internal(e.to_string()))?;
        
        Ok(Response::new(AuthResponse {
            user_id: result.user_id.to_string(),
            access_token: result.access_token,
            refresh_token: result.refresh_token,
            expires_in: result.expires_in as i64,
        }))
    }

    async fn login(
        &self,
        request: Request<LoginRequest>,
    ) -> Result<Response<AuthResponse>, Status> {
        // Rate limit by IP
        let client_ip = Self::extract_client_ip(&request);
        if let Err(retry_after) = self.rate_limiters.login.check(&client_ip) {
            return Err(Status::resource_exhausted(format!(
                "Too many login attempts. Please try again in {} seconds.",
                retry_after
            )));
        }

        let req = request.into_inner();
        
        let business_req = crate::services::auth::LoginRequest {
            email: req.email,
            password: req.password,
        };
        
        let result = self.service.login(business_req).await
            .map_err(|e| Status::unauthenticated(e.to_string()))?;
        
        Ok(Response::new(AuthResponse {
            user_id: result.user_id.to_string(),
            access_token: result.access_token,
            refresh_token: result.refresh_token,
            expires_in: result.expires_in as i64,
        }))
    }

    async fn refresh(
        &self,
        request: Request<RefreshRequest>,
    ) -> Result<Response<AuthResponse>, Status> {
        let req = request.into_inner();
        
        let business_req = crate::services::auth::RefreshRequest {
            refresh_token: req.refresh_token,
        };
        
        let result = self.service.refresh(business_req).await
            .map_err(|e| Status::unauthenticated(e.to_string()))?;
        
        Ok(Response::new(AuthResponse {
            user_id: result.user_id.to_string(),
            access_token: result.access_token,
            refresh_token: result.refresh_token,
            expires_in: result.expires_in as i64,
        }))
    }

    async fn logout(
        &self,
        request: Request<RefreshRequest>,
    ) -> Result<Response<MessageResponse>, Status> {
        let req = request.into_inner();
        
        let business_req = crate::services::auth::RefreshRequest {
            refresh_token: req.refresh_token,
        };
        
        let result = self.service.logout(business_req).await
            .map_err(|e| Status::internal(e.to_string()))?;
        
        Ok(Response::new(MessageResponse {
            message: result.message,
        }))
    }

}
