//! License check middleware for premium features

use crate::error::{Error, Result};
use crate::auth::license_client::LicenseClient;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct LicenseChecker {
    client: Arc<RwLock<Option<LicenseClient>>>,
}

impl LicenseChecker {
    pub fn new() -> Self {
        Self {
            client: Arc::new(RwLock::new(None)),
        }
    }

    pub fn set_client(&self, client: LicenseClient) {
        tokio::spawn(async move {
            // Store client in a way that can be accessed
            // For now, we'll need to pass it through state
        });
    }

    pub async fn check_premium_feature(&self) -> Result<()> {
        // Get client from state or create new one
        // For now, return error if not configured
        let client_guard = self.client.read().await;
        if let Some(ref client) = *client_guard {
            let is_valid = client.check_license_valid().await?;
            if !is_valid {
                return Err(Error::Internal("Premium feature requires valid license".to_string()));
            }
            Ok(())
        } else {
            Err(Error::Internal("License client not configured".to_string()))
        }
    }
}

impl Default for LicenseChecker {
    fn default() -> Self {
        Self::new()
    }
}

// List of premium features that require license check
pub const PREMIUM_FEATURES: &[&str] = &[
    "metrics",
    "logs",
    "terminal",
    "exec",
    "port-forward",
    "advanced_deployments",
];

pub fn is_premium_feature(feature: &str) -> bool {
    PREMIUM_FEATURES.iter().any(|&f| feature.contains(f))
}

