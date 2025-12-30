//! License gRPC service implementation

use crate::proto::license::{
    license_service_server::LicenseService, ActivateRequest, GetStatusRequest,
    LicenseStatusResponse, ValidateRequest, ValidateResponse,
};
use crate::services::auth::AuthService;
use crate::services::license::LicenseService as LicenseBusinessService;
use prost_types::Timestamp;
use std::sync::Arc;
use tonic::{Request, Response, Status};

pub struct LicenseGrpcService {
    service: Arc<LicenseBusinessService>,
    auth_service: Arc<AuthService>,
}

impl LicenseGrpcService {
    pub fn new(service: Arc<LicenseBusinessService>, auth_service: Arc<AuthService>) -> Self {
        Self {
            service,
            auth_service,
        }
    }

    fn datetime_to_timestamp(dt: chrono::DateTime<chrono::Utc>) -> Timestamp {
        Timestamp {
            seconds: dt.timestamp(),
            nanos: dt.timestamp_subsec_nanos() as i32,
        }
    }
}

#[tonic::async_trait]
impl LicenseService for LicenseGrpcService {
    async fn get_status(
        &self,
        request: Request<GetStatusRequest>,
    ) -> Result<Response<LicenseStatusResponse>, Status> {
        let user_id = self.auth_service.extract_user_id_from_request(&request)?;

        let license = self
            .service
            .get_status(user_id, None)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(LicenseStatusResponse {
            has_license: license.is_some(),
            license_key: license.as_ref().map(|l| l.masked_key()),
            subscription_type: license.as_ref().map(|l| l.subscription_type.to_string()),
            expires_at: license
                .as_ref()
                .and_then(|l| l.expires_at.map(Self::datetime_to_timestamp)),
            is_valid: license.as_ref().map(|l| l.is_valid()).unwrap_or(false),
        }))
    }

    async fn activate(
        &self,
        request: Request<ActivateRequest>,
    ) -> Result<Response<LicenseStatusResponse>, Status> {
        let user_id = self.auth_service.extract_user_id_from_request(&request)?;
        let req = request.into_inner();

        let license = self
            .service
            .activate(user_id, &req.license_key)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(LicenseStatusResponse {
            has_license: true,
            license_key: Some(license.masked_key()),
            subscription_type: Some(license.subscription_type.to_string()),
            expires_at: license.expires_at.map(Self::datetime_to_timestamp),
            is_valid: license.is_valid(),
        }))
    }

    async fn validate(
        &self,
        request: Request<ValidateRequest>,
    ) -> Result<Response<ValidateResponse>, Status> {
        let user_id = self.auth_service.extract_user_id_from_request(&request)?;
        let req = request.into_inner();

        let license = self
            .service
            .validate(user_id, &req.license_key)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(ValidateResponse {
            valid: license.is_valid(),
            subscription_type: license.subscription_type.to_string(),
            expires_at: license.expires_at.map(Self::datetime_to_timestamp),
        }))
    }
}
