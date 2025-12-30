//! User gRPC service implementation

use crate::proto::user::{
    user_service_server::UserService, GetProfileRequest, ProfileResponse, UpdateProfileRequest,
};
use crate::services::auth::AuthService;
use crate::services::user::UserService as UserBusinessService;
use std::sync::Arc;
use tonic::{Request, Response, Status};

pub struct UserGrpcService {
    service: Arc<UserBusinessService>,
    auth_service: Arc<AuthService>,
}

impl UserGrpcService {
    pub fn new(service: Arc<UserBusinessService>, auth_service: Arc<AuthService>) -> Self {
        Self {
            service,
            auth_service,
        }
    }
}

#[tonic::async_trait]
impl UserService for UserGrpcService {
    async fn get_profile(
        &self,
        request: Request<GetProfileRequest>,
    ) -> Result<Response<ProfileResponse>, Status> {
        let user_id = self.auth_service.extract_user_id_from_request(&request)?;

        let profile = self
            .service
            .get_profile(user_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(ProfileResponse {
            user_id: profile.user_id.to_string(),
            email: profile.email,
            first_name: profile.first_name,
            last_name: profile.last_name,
            company: profile.company,
            email_verified: profile.email_verified,
        }))
    }

    async fn update_profile(
        &self,
        request: Request<UpdateProfileRequest>,
    ) -> Result<Response<ProfileResponse>, Status> {
        let user_id = self.auth_service.extract_user_id_from_request(&request)?;
        let req = request.into_inner();

        let update_req = crate::services::user::UpdateProfileRequest {
            first_name: req.first_name,
            last_name: req.last_name,
            company: req.company,
        };

        let profile = self
            .service
            .update_profile(user_id, update_req)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(ProfileResponse {
            user_id: profile.user_id.to_string(),
            email: profile.email,
            first_name: profile.first_name,
            last_name: profile.last_name,
            company: profile.company,
            email_verified: profile.email_verified,
        }))
    }
}
