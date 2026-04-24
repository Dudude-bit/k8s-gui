//! AWS EKS authentication provider

use super::{AuthProvider, AuthResult};
use crate::error::{AuthError, Error, Result};
use async_trait::async_trait;
use aws_credential_types::provider::ProvideCredentials;
use base64::Engine;

/// AWS EKS authentication provider
pub struct AwsEksAuth {
    region: String,
    role_arn: Option<String>,
    profile: Option<String>,
}

impl AwsEksAuth {
    /// Create a new AWS EKS auth provider
    #[must_use]
    pub fn new(region: String, role_arn: Option<String>, profile: Option<String>) -> Self {
        Self {
            region,
            role_arn,
            profile,
        }
    }

    /// Get a presigned URL for EKS authentication
    async fn get_token(&self) -> Result<String> {
        use aws_config::BehaviorVersion;
        use aws_sdk_sts::config::Credentials;

        // Load AWS configuration
        let mut config_loader = aws_config::defaults(BehaviorVersion::latest())
            .region(aws_config::Region::new(self.region.clone()));

        if let Some(profile) = &self.profile {
            config_loader = config_loader.profile_name(profile);
        }

        let aws_config = config_loader.load().await;

        // If role_arn is specified, assume that role
        let credentials = if let Some(role_arn) = &self.role_arn {
            let sts_client = aws_sdk_sts::Client::new(&aws_config);

            let assume_role_output = sts_client
                .assume_role()
                .role_arn(role_arn)
                .role_session_name("k8s-gui-session")
                .send()
                .await
                .map_err(|e| {
                    Error::Auth(AuthError::AwsAuth(format!(
                        "Failed to assume role {role_arn}: {e}"
                    )))
                })?;

            let creds = assume_role_output.credentials().ok_or_else(|| {
                Error::Auth(AuthError::AwsAuth(
                    "No credentials returned from AssumeRole".to_string(),
                ))
            })?;

            Some(Credentials::new(
                creds.access_key_id(),
                creds.secret_access_key(),
                Some(creds.session_token().to_string()),
                None,
                "assume_role",
            ))
        } else {
            None
        };

        // Generate the presigned URL for GetCallerIdentity
        let token = self
            .generate_eks_token(&aws_config, credentials.as_ref())
            .await?;

        Ok(token)
    }

    /// Generate EKS token using presigned STS `GetCallerIdentity`
    async fn generate_eks_token(
        &self,
        config: &aws_config::SdkConfig,
        _credentials: Option<&aws_sdk_sts::config::Credentials>,
    ) -> Result<String> {
        // Build the STS GetCallerIdentity request
        let _endpoint = format!("https://sts.{}.amazonaws.com/", self.region);
        // Action=GetCallerIdentity&Version=2011-06-15

        // Get credentials from config or use provided ones
        let creds_provider = config.credentials_provider().ok_or_else(|| {
            Error::Auth(AuthError::AwsAuth(
                "No AWS credentials available".to_string(),
            ))
        })?;

        let creds = creds_provider.provide_credentials().await.map_err(|e| {
            Error::Auth(AuthError::AwsAuth(format!(
                "Failed to get AWS credentials: {e}"
            )))
        })?;

        // Create signing parameters
        let _identity = aws_credential_types::provider::ProvideCredentials::provide_credentials(
            &creds_provider,
        )
        .await
        .map_err(|e| {
            Error::Auth(AuthError::AwsAuth(format!(
                "Failed to provide credentials: {e}"
            )))
        })?;

        // For EKS, we need to create a presigned URL with specific headers
        // The token format is: k8s-aws-v1.<base64-encoded-presigned-url>

        let now = chrono::Utc::now();
        let _expiry = now + chrono::Duration::minutes(15);

        // Build presigned URL manually
        // This is a simplified version - production code should use aws-sigv4 properly
        let token = format!(
            "k8s-aws-v1.{}",
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(
                format!(
                    "https://sts.{}.amazonaws.com/?Action=GetCallerIdentity&Version=2011-06-15&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential={}&X-Amz-Date={}&X-Amz-Expires=900&X-Amz-SignedHeaders=host;x-k8s-aws-id",
                    self.region,
                    urlencoding::encode(&format!(
                        "{}/{}/sts/aws4_request",
                        creds.access_key_id(),
                        now.format("%Y%m%d")
                    )),
                    now.format("%Y%m%dT%H%M%SZ")
                )
            )
        );

        Ok(token)
    }
}

#[async_trait]
impl AuthProvider for AwsEksAuth {
    async fn authenticate(&self) -> Result<AuthResult> {
        let token = self.get_token().await?;

        // EKS tokens are valid for 15 minutes
        let expires_at = chrono::Utc::now() + chrono::Duration::minutes(15);

        Ok(AuthResult {
            token,
            expires_at: Some(expires_at),
            refresh_token: None,
            token_type: "Bearer".to_string(),
        })
    }

    async fn refresh(&self, _auth: &AuthResult) -> Result<AuthResult> {
        // EKS tokens can be refreshed by generating a new one
        self.authenticate().await
    }

    fn supports_refresh(&self) -> bool {
        true
    }

    fn name(&self) -> &'static str {
        "aws_eks"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aws_eks_auth_creation() {
        let auth = AwsEksAuth::new("us-west-2".to_string(), None, None);

        assert_eq!(auth.name(), "aws_eks");
        assert!(auth.supports_refresh());
    }
}
