//! Auth gRPC service implementation

use tonic::{Request, Response, Status};
use crate::proto::auth::{
    auth_service_server::AuthService,
    AuthResponse, RegisterRequest, LoginRequest, RefreshRequest,
    ForgotPasswordRequest, ResetPasswordRequest, MessageResponse,
};
use crate::services::auth::AuthService as AuthBusinessService;
use std::sync::Arc;

pub struct AuthGrpcService {
    service: Arc<AuthBusinessService>,
}

impl AuthGrpcService {
    pub fn new(service: Arc<AuthBusinessService>) -> Self {
        Self { service }
    }
}

#[tonic::async_trait]
impl AuthService for AuthGrpcService {
    async fn register(
        &self,
        request: Request<RegisterRequest>,
    ) -> Result<Response<AuthResponse>, Status> {
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

    async fn forgot_password(
        &self,
        request: Request<ForgotPasswordRequest>,
    ) -> Result<Response<MessageResponse>, Status> {
        let req = request.into_inner();
        
        let business_req = crate::services::auth::ForgotPasswordRequest {
            email: req.email,
        };
        
        let result = self.service.forgot_password(business_req).await
            .map_err(|e| Status::internal(e.to_string()))?;
        
        Ok(Response::new(MessageResponse {
            message: result.message,
        }))
    }

    async fn reset_password(
        &self,
        request: Request<ResetPasswordRequest>,
    ) -> Result<Response<MessageResponse>, Status> {
        let req = request.into_inner();
        
        let business_req = crate::services::auth::ResetPasswordRequest {
            token: req.token,
            new_password: req.new_password,
        };
        
        let result = self.service.reset_password(business_req).await
            .map_err(|e| Status::internal(e.to_string()))?;
        
        Ok(Response::new(MessageResponse {
            message: result.message,
        }))
    }
}
