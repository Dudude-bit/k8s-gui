//! License client for connecting to auth-server via gRPC

use crate::auth::auth_disabled;
use crate::config::AppConfig;
use crate::error::{Error, Result};
use crate::proto::auth::auth_service_client::AuthServiceClient;
use crate::proto::auth::{
    AuthResponse as GrpcAuthResponse, LoginRequest, RefreshRequest, RegisterRequest,
};
use crate::proto::license::license_service_client::LicenseServiceClient;
use crate::proto::license::{ActivateRequest, GetStatusRequest, LicenseStatusResponse};
use crate::proto::payment::payment_service_client::PaymentServiceClient;
use crate::proto::payment::{
    GetHistoryRequest, PaymentHistoryResponse as GrpcPaymentHistoryResponse,
    PaymentInfo as GrpcPaymentInfo,
};
use crate::proto::user::user_service_client::UserServiceClient;
use crate::proto::user::{
    GetProfileRequest, ProfileResponse, UpdateProfileRequest as GrpcUpdateProfileRequest,
};
use chrono::TimeZone;
use std::sync::Arc;
use tokio::sync::RwLock;
use tonic::metadata::MetadataValue;
use tonic::transport::{Channel, ClientTlsConfig};

type CachedLicenseStatus = Arc<RwLock<Option<(LicenseStatus, chrono::DateTime<chrono::Utc>)>>>;

/// Auth response with tokens
#[derive(Debug, Clone)]
pub struct AuthTokens {
    pub user_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
}

impl From<GrpcAuthResponse> for AuthTokens {
    fn from(r: GrpcAuthResponse) -> Self {
        Self {
            user_id: r.user_id,
            access_token: r.access_token,
            refresh_token: r.refresh_token,
            expires_in: r.expires_in,
        }
    }
}

/// License status
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub has_license: bool,
    pub license_key: Option<String>,
    pub subscription_type: Option<String>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub is_valid: bool,
}

impl From<LicenseStatusResponse> for LicenseStatus {
    fn from(r: LicenseStatusResponse) -> Self {
        Self {
            has_license: r.has_license,
            license_key: r.license_key,
            subscription_type: r.subscription_type,
            expires_at: r.expires_at.and_then(|t| {
                chrono::DateTime::from_timestamp(t.seconds, t.nanos as u32)
            }),
            is_valid: r.is_valid,
        }
    }
}

/// User profile
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub user_id: String,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub company: Option<String>,
    pub email_verified: bool,
}

impl From<ProfileResponse> for UserProfile {
    fn from(r: ProfileResponse) -> Self {
        Self {
            user_id: r.user_id,
            email: r.email,
            first_name: r.first_name,
            last_name: r.last_name,
            company: r.company,
            email_verified: r.email_verified,
        }
    }
}

/// Update profile request
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileRequest {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub company: Option<String>,
}

/// Payment info
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentInfo {
    pub id: String,
    pub license_id: Option<String>,
    pub amount: String,
    pub currency: String,
    pub status: String,
    pub transaction_id: Option<String>,
    pub payment_provider: Option<String>,
    pub created_at: Option<String>,
}

impl From<GrpcPaymentInfo> for PaymentInfo {
    fn from(p: GrpcPaymentInfo) -> Self {
        Self {
            id: p.id,
            license_id: p.license_id,
            amount: p.amount,
            currency: p.currency,
            status: p.status,
            transaction_id: p.transaction_id,
            payment_provider: p.payment_provider,
            created_at: p.created_at.and_then(|t| {
                let nanos = u32::try_from(t.nanos).ok()?;
                chrono::Utc
                    .timestamp_opt(t.seconds, nanos)
                    .single()
                    .map(|dt| dt.to_rfc3339())
            }),
        }
    }
}

/// Payment history response
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentHistoryResponse {
    pub payments: Vec<PaymentInfo>,
    pub total: i64,
}

impl From<GrpcPaymentHistoryResponse> for PaymentHistoryResponse {
    fn from(r: GrpcPaymentHistoryResponse) -> Self {
        Self {
            payments: r.payments.into_iter().map(PaymentInfo::from).collect(),
            total: r.total,
        }
    }
}

fn disabled_license_status() -> LicenseStatus {
    LicenseStatus {
        has_license: true,
        license_key: None,
        subscription_type: Some("lifetime".to_string()),
        expires_at: None,
        is_valid: true,
    }
}

fn disabled_user_profile() -> UserProfile {
    UserProfile {
        user_id: "local".to_string(),
        email: "offline@local".to_string(),
        first_name: None,
        last_name: None,
        company: None,
        email_verified: true,
    }
}

fn disabled_payment_history() -> PaymentHistoryResponse {
    PaymentHistoryResponse {
        payments: Vec::new(),
        total: 0,
    }
}

pub struct LicenseClient {
    endpoint: String,
    access_token: Arc<RwLock<Option<String>>>,
    refresh_token: Arc<RwLock<Option<String>>>,
    /// Token expiration time (Unix timestamp)
    token_expires_at: Arc<RwLock<Option<i64>>>,
    cached_status: CachedLicenseStatus,
}

/// Buffer time before token expiration to trigger proactive refresh (5 minutes)
const TOKEN_REFRESH_BUFFER_SECS: i64 = 300;

impl LicenseClient {
    #[must_use]
    pub fn new(endpoint: String) -> Self {
        let (access_token, refresh_token, expires_at) = Self::load_tokens_from_config();

        Self {
            endpoint,
            access_token: Arc::new(RwLock::new(access_token)),
            refresh_token: Arc::new(RwLock::new(refresh_token)),
            token_expires_at: Arc::new(RwLock::new(expires_at)),
            cached_status: Arc::new(RwLock::new(None)),
        }
    }

    fn load_tokens_from_config() -> (Option<String>, Option<String>, Option<i64>) {
        match AppConfig::load() {
            Ok(config) => {
                let access_token = config.auth_tokens.access_token;
                let refresh_token = config.auth_tokens.refresh_token;
                let expires_at = config.auth_tokens.expires_at;
                if access_token.is_some() {
                    tracing::info!("Restored access token from config");
                }
                (access_token, refresh_token, expires_at)
            }
            Err(e) => {
                tracing::error!("Failed to load config for auth tokens: {}", e);
                (None, None, None)
            }
        }
    }

    fn save_tokens_to_config(access_token: &str, refresh_token: &str, expires_at: Option<i64>) {
        match AppConfig::load() {
            Ok(mut config) => {
                config.auth_tokens.access_token = Some(access_token.to_string());
                config.auth_tokens.refresh_token = Some(refresh_token.to_string());
                config.auth_tokens.expires_at = expires_at;
                if let Err(e) = crate::commands::settings::save_config(&config) {
                    tracing::error!("Failed to save auth tokens to config: {}", e);
                } else {
                    tracing::info!("Tokens saved to config (expires_at: {:?})", expires_at);
                }
            }
            Err(e) => {
                tracing::error!("Failed to load config for saving tokens: {}", e);
            }
        }
    }

    fn clear_tokens_from_config() {
        match AppConfig::load() {
            Ok(mut config) => {
                config.auth_tokens.access_token = None;
                config.auth_tokens.refresh_token = None;
                config.auth_tokens.expires_at = None;
                if let Err(e) = crate::commands::settings::save_config(&config) {
                    tracing::error!("Failed to clear auth tokens from config: {}", e);
                }
            }
            Err(e) => {
                tracing::error!("Failed to load config for clearing tokens: {}", e);
            }
        }
    }

    async fn connect(&self) -> Result<Channel> {
        let mut endpoint = Channel::from_shared(self.endpoint.clone())
            .map_err(|e| Error::Config(format!("Invalid endpoint: {e}")))?;

        if self.endpoint.starts_with("https://") {
            endpoint = endpoint
                .tls_config(ClientTlsConfig::new().with_enabled_roots())
                .map_err(|e| Error::Config(format!("TLS config error: {e}")))?;
        }

        let channel = endpoint.connect().await.map_err(|e| {
            Error::Connection(format!("Failed to connect to auth server: {e}"))
        })?;
        Ok(channel)
    }

    /// Create an authenticated request with Bearer token in metadata
    fn authenticated_request<T>(inner: T, token: &str) -> Result<tonic::Request<T>> {
        let mut request = tonic::Request::new(inner);
        let bearer = format!("Bearer {token}");
        let value = MetadataValue::try_from(&bearer)
            .map_err(|_| Error::Internal("Invalid token format".to_string()))?;
        request.metadata_mut().insert("authorization", value);
        Ok(request)
    }

    /// Login with email and password
    ///
    /// # Errors
    ///
    /// Returns an error if connection to the auth server fails, login request fails,
    /// or the response is invalid.
    pub async fn login(&self, email: &str, password: &str) -> Result<AuthTokens> {
        if auth_disabled() {
            return Ok(AuthTokens {
                user_id: "local".to_string(),
                access_token: "disabled".to_string(),
                refresh_token: "disabled".to_string(),
                expires_in: 0,
            });
        }
        let channel = self.connect().await?;
        let mut client = AuthServiceClient::new(channel);

        let request = tonic::Request::new(LoginRequest {
            email: email.to_string(),
            password: password.to_string(),
        });

        let response = client
            .login(request)
            .await
            .map_err(|e| Error::Internal(format!("Login failed: {e}")))?;

        let tokens: AuthTokens = response.into_inner().into();

        // Calculate expiration timestamp
        let now = chrono::Utc::now().timestamp();
        let expires_at = if tokens.expires_in > 0 {
            Some(now + tokens.expires_in)
        } else {
            None
        };

        *self.access_token.write().await = Some(tokens.access_token.clone());
        *self.refresh_token.write().await = Some(tokens.refresh_token.clone());
        *self.token_expires_at.write().await = expires_at;
        Self::save_tokens_to_config(&tokens.access_token, &tokens.refresh_token, expires_at);

        Ok(tokens)
    }

    /// Register a new user
    ///
    /// # Errors
    ///
    /// Returns an error if connection to the auth server fails, registration request fails,
    /// or the response is invalid.
    pub async fn register(
        &self,
        email: &str,
        password: &str,
        _first_name: Option<String>,
        _last_name: Option<String>,
    ) -> Result<AuthTokens> {
        if auth_disabled() {
            return Ok(AuthTokens {
                user_id: "local".to_string(),
                access_token: "disabled".to_string(),
                refresh_token: "disabled".to_string(),
                expires_in: 0,
            });
        }
        let channel = self.connect().await?;
        let mut client = AuthServiceClient::new(channel);

        let request = tonic::Request::new(RegisterRequest {
            email: email.to_string(),
            password: password.to_string(),
        });

        let response = client
            .register(request)
            .await
            .map_err(|e| Error::Internal(format!("Registration failed: {e}")))?;

        let tokens: AuthTokens = response.into_inner().into();

        // Calculate expiration timestamp
        let now = chrono::Utc::now().timestamp();
        let expires_at = if tokens.expires_in > 0 {
            Some(now + tokens.expires_in)
        } else {
            None
        };

        *self.access_token.write().await = Some(tokens.access_token.clone());
        *self.refresh_token.write().await = Some(tokens.refresh_token.clone());
        *self.token_expires_at.write().await = expires_at;
        Self::save_tokens_to_config(&tokens.access_token, &tokens.refresh_token, expires_at);

        Ok(tokens)
    }

    pub async fn set_tokens(&self, access_token: String, refresh_token: String) {
        if auth_disabled() {
            return;
        }
        // When setting tokens externally, we don't know expiration, so set None
        // This will trigger a refresh on next check
        Self::save_tokens_to_config(&access_token, &refresh_token, None);
        *self.access_token.write().await = Some(access_token);
        *self.refresh_token.write().await = Some(refresh_token);
        *self.token_expires_at.write().await = None;
    }

    async fn ensure_token_valid(&self) -> Result<()> {
        if auth_disabled() {
            return Ok(());
        }
        
        let access_token = self.access_token.read().await.clone();
        let expires_at = *self.token_expires_at.read().await;
        
        // Check if we need to refresh:
        // 1. No access token
        // 2. Token is expired or will expire soon
        let needs_refresh = match (access_token.as_ref(), expires_at) {
            (None, _) => true,
            (Some(_), Some(exp)) => {
                let now = chrono::Utc::now().timestamp();
                // Refresh if token expires within the buffer time
                now >= exp - TOKEN_REFRESH_BUFFER_SECS
            }
            (Some(_), None) => false, // We have a token but don't know expiration, assume valid
        };
        
        if needs_refresh {
            tracing::info!("Token needs refresh (expires_at: {:?})", expires_at);
            let refresh_token = self.refresh_token.read().await.clone();
            if let Some(ref token) = refresh_token {
                match self.refresh_access_token(token).await {
                    Ok(()) => {
                        tracing::info!("Token refreshed successfully");
                    }
                    Err(e) => {
                        // Refresh failed - clear invalid tokens and return error
                        tracing::error!("Token refresh failed: {}, clearing tokens", e);
                        self.clear_auth();
                        return Err(Error::Internal("Session expired. Please log in again.".to_string()));
                    }
                }
            } else {
                return Err(Error::Internal("Not authenticated".to_string()));
            }
        }

        Ok(())
    }

    async fn refresh_access_token(&self, refresh_token: &str) -> Result<()> {
        let channel = self.connect().await?;
        let mut client = AuthServiceClient::new(channel);

        let request = tonic::Request::new(RefreshRequest {
            refresh_token: refresh_token.to_string(),
        });

        let response = client
            .refresh(request)
            .await
            .map_err(|e| Error::Internal(format!("Token refresh failed: {e}")))?;

        let tokens: AuthTokens = response.into_inner().into();

        // Calculate expiration timestamp
        let now = chrono::Utc::now().timestamp();
        let expires_at = if tokens.expires_in > 0 {
            Some(now + tokens.expires_in)
        } else {
            None
        };

        *self.access_token.write().await = Some(tokens.access_token.clone());
        *self.refresh_token.write().await = Some(tokens.refresh_token.clone());
        *self.token_expires_at.write().await = expires_at;
        Self::save_tokens_to_config(&tokens.access_token, &tokens.refresh_token, expires_at);

        Ok(())
    }

    /// Get license status, optionally forcing a refresh
    ///
    /// # Errors
    ///
    /// Returns an error if connection to the license server fails, the request fails,
    /// or the response is invalid.
    pub async fn get_license_status(&self, force_refresh: bool) -> Result<LicenseStatus> {
        if auth_disabled() {
            let status = disabled_license_status();
            *self.cached_status.write().await = Some((status.clone(), chrono::Utc::now()));
            return Ok(status);
        }
        // Check cache first
        if !force_refresh {
            let cache_guard = self.cached_status.read().await;
            if let Some((status, cached_at)) = cache_guard.as_ref() {
                if cached_at > &(chrono::Utc::now() - chrono::Duration::hours(1)) {
                    return Ok(status.clone());
                }
            }
            drop(cache_guard);
        }

        self.ensure_token_valid().await?;

        let access_token = self
            .access_token
            .read()
            .await
            .clone()
            .ok_or_else(|| Error::Internal("Not authenticated".to_string()))?;

        let channel = self.connect().await?;
        let mut client = LicenseServiceClient::new(channel);

        let request = Self::authenticated_request(GetStatusRequest {}, &access_token)?;

        let response = client
            .get_status(request)
            .await
            .map_err(|e| Error::Internal(format!("Failed to get license status: {e}")))?;

        let status: LicenseStatus = response.into_inner().into();

        *self.cached_status.write().await = Some((status.clone(), chrono::Utc::now()));

        Ok(status)
    }

    pub async fn activate_license(&self, license_key: &str) -> Result<LicenseStatus> {
        if auth_disabled() {
            let status = disabled_license_status();
            *self.cached_status.write().await = Some((status.clone(), chrono::Utc::now()));
            return Ok(status);
        }
        self.ensure_token_valid().await?;
        *self.cached_status.write().await = None;

        let access_token = self
            .access_token
            .read()
            .await
            .clone()
            .ok_or_else(|| Error::Internal("Not authenticated".to_string()))?;

        let channel = self.connect().await?;
        let mut client = LicenseServiceClient::new(channel);

        let request = Self::authenticated_request(
            ActivateRequest {
                license_key: license_key.to_string(),
            },
            &access_token,
        )?;

        let response = client
            .activate(request)
            .await
            .map_err(|e| Error::Internal(format!("Failed to activate license: {e}")))?;

        let status: LicenseStatus = response.into_inner().into();

        *self.cached_status.write().await = Some((status.clone(), chrono::Utc::now()));

        Ok(status)
    }

    pub async fn check_license_valid(&self) -> Result<bool> {
        if auth_disabled() {
            return Ok(true);
        }
        let status = self.get_license_status(false).await?;
        Ok(status.is_valid)
    }

    /// Check if user is authenticated
    pub async fn is_authenticated(&self) -> bool {
        if auth_disabled() {
            return true;
        }
        self.access_token.read().await.is_some() || self.refresh_token.read().await.is_some()
    }

    /// Require premium license for premium features
    pub async fn require_premium_license(&self) -> Result<()> {
        if auth_disabled() {
            return Ok(());
        }
        // If user is not authenticated, return error without logging
        if !self.is_authenticated().await {
            return Err(Error::Internal(
                "Not authenticated. Please log in to use premium features.".to_string(),
            ));
        }

        match self.check_license_valid().await {
            Ok(true) => Ok(()),
            Ok(false) => Err(Error::Internal(
                "Premium feature requires a valid license.".to_string(),
            )),
            Err(e) => {
                // Only log as error if it's not an authentication issue
                if e.to_string().contains("Not authenticated") {
                    tracing::debug!("User not authenticated for license check");
                } else {
                    tracing::error!("License check failed: {}", e);
                }
                Err(Error::Internal(format!("License validation failed: {e}")))
            }
        }
    }

    pub fn clear_auth(&self) {
        if auth_disabled() {
            return;
        }
        let access_token = Arc::clone(&self.access_token);
        let refresh_token = Arc::clone(&self.refresh_token);
        let cached_status = Arc::clone(&self.cached_status);

        tokio::spawn(async move {
            Self::clear_tokens_from_config();
            *access_token.write().await = None;
            *refresh_token.write().await = None;
            *cached_status.write().await = None;
        });
    }

    pub async fn get_user_profile(&self) -> Result<UserProfile> {
        if auth_disabled() {
            return Ok(disabled_user_profile());
        }
        self.ensure_token_valid().await?;

        let access_token = self
            .access_token
            .read()
            .await
            .clone()
            .ok_or_else(|| Error::Internal("Not authenticated".to_string()))?;

        let channel = self.connect().await?;
        let mut client = UserServiceClient::new(channel);

        let request = Self::authenticated_request(GetProfileRequest {}, &access_token)?;

        let response = client
            .get_profile(request)
            .await
            .map_err(|e| Error::Internal(format!("Failed to get user profile: {e}")))?;

        Ok(response.into_inner().into())
    }

    pub async fn update_user_profile(&self, updates: UpdateProfileRequest) -> Result<UserProfile> {
        if auth_disabled() {
            let mut profile = disabled_user_profile();
            profile.first_name = updates.first_name;
            profile.last_name = updates.last_name;
            profile.company = updates.company;
            return Ok(profile);
        }
        self.ensure_token_valid().await?;

        let access_token = self
            .access_token
            .read()
            .await
            .clone()
            .ok_or_else(|| Error::Internal("Not authenticated".to_string()))?;

        let channel = self.connect().await?;
        let mut client = UserServiceClient::new(channel);

        let request = Self::authenticated_request(
            GrpcUpdateProfileRequest {
                first_name: updates.first_name,
                last_name: updates.last_name,
                company: updates.company,
            },
            &access_token,
        )?;

        let response = client
            .update_profile(request)
            .await
            .map_err(|e| Error::Internal(format!("Failed to update user profile: {e}")))?;

        Ok(response.into_inner().into())
    }

    pub async fn get_payment_history(&self) -> Result<PaymentHistoryResponse> {
        if auth_disabled() {
            return Ok(disabled_payment_history());
        }
        self.ensure_token_valid().await?;

        let access_token = self
            .access_token
            .read()
            .await
            .clone()
            .ok_or_else(|| Error::Internal("Not authenticated".to_string()))?;

        let channel = self.connect().await?;
        let mut client = PaymentServiceClient::new(channel);

        let request = Self::authenticated_request(
            GetHistoryRequest {
                limit: Some(100),
                offset: Some(0),
            },
            &access_token,
        )?;

        let response = client
            .get_history(request)
            .await
            .map_err(|e| Error::Internal(format!("Failed to get payment history: {e}")))?;

        Ok(response.into_inner().into())
    }
}
