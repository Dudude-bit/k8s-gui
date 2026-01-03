//! Secure credential storage using system keyring

use crate::error::{Error, Result};
use keyring::Entry;

const SERVICE_NAME: &str = "k8s-gui";

#[cfg(target_os = "linux")]
fn with_linux_keyring_hint(message: String) -> String {
    format!(
        "{message}. Hint: ensure Secret Service (gnome-keyring or KWallet) is installed and DBUS session is available."
    )
}

#[cfg(not(target_os = "linux"))]
fn with_linux_keyring_hint(message: String) -> String {
    message
}

/// Secure credential store using system keyring
pub struct CredentialStore {
    service: String,
}

impl CredentialStore {
    /// Create a new credential store
    #[must_use]
    pub fn new() -> Self {
        Self {
            service: SERVICE_NAME.to_string(),
        }
    }

    /// Store a credential
    ///
    /// # Errors
    ///
    /// Returns an error if the keyring entry cannot be created or if storing
    /// the credential fails.
    pub fn store(&self, key: &str, value: &str) -> Result<()> {
        let entry = Entry::new(&self.service, key)
            .map_err(|e| {
                Error::Keyring(with_linux_keyring_hint(format!(
                    "Failed to create keyring entry: {e}"
                )))
            })?;

        entry
            .set_password(value)
            .map_err(|e| {
                Error::Keyring(with_linux_keyring_hint(format!(
                    "Failed to store credential: {e}"
                )))
            })?;

        tracing::debug!("Stored credential for key: {}", key);
        Ok(())
    }

    /// Retrieve a credential
    ///
    /// # Errors
    ///
    /// Returns an error if the keyring entry cannot be created or if retrieving
    /// the credential fails (other than when the entry doesn't exist).
    pub fn get(&self, key: &str) -> Result<Option<String>> {
        let entry = Entry::new(&self.service, key)
            .map_err(|e| {
                Error::Keyring(with_linux_keyring_hint(format!(
                    "Failed to create keyring entry: {e}"
                )))
            })?;

        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(Error::Keyring(with_linux_keyring_hint(format!(
                "Failed to retrieve credential: {e}"
            )))),
        }
    }

    /// Delete a credential
    ///
    /// # Errors
    ///
    /// Returns an error if the keyring entry cannot be created or if deleting
    /// the credential fails (other than when the entry doesn't exist).
    pub fn delete(&self, key: &str) -> Result<()> {
        let entry = Entry::new(&self.service, key)
            .map_err(|e| {
                Error::Keyring(with_linux_keyring_hint(format!(
                    "Failed to create keyring entry: {e}"
                )))
            })?;

        match entry.delete_credential() {
            Ok(()) => {
                tracing::debug!("Deleted credential for key: {}", key);
                Ok(())
            }
            Err(keyring::Error::NoEntry) => Ok(()), // Already deleted
            Err(e) => Err(Error::Keyring(with_linux_keyring_hint(format!(
                "Failed to delete credential: {e}"
            )))),
        }
    }

    /// Store a token for a context
    ///
    /// # Errors
    ///
    /// Returns an error if storing the token fails.
    pub fn store_token(&self, context: &str, token: &str) -> Result<()> {
        let key = format!("token:{context}");
        self.store(&key, token)
    }

    /// Get a token for a context
    ///
    /// # Errors
    ///
    /// Returns an error if retrieving the token fails.
    pub fn get_token(&self, context: &str) -> Result<Option<String>> {
        let key = format!("token:{context}");
        self.get(&key)
    }

    /// Delete a token for a context
    ///
    /// # Errors
    ///
    /// Returns an error if deleting the token fails.
    pub fn delete_token(&self, context: &str) -> Result<()> {
        let key = format!("token:{context}");
        self.delete(&key)
    }

    /// Store refresh token for a context
    ///
    /// # Errors
    ///
    /// Returns an error if storing the refresh token fails.
    pub fn store_refresh_token(&self, context: &str, token: &str) -> Result<()> {
        let key = format!("refresh_token:{context}");
        self.store(&key, token)
    }

    /// Get refresh token for a context
    ///
    /// # Errors
    ///
    /// Returns an error if retrieving the refresh token fails.
    pub fn get_refresh_token(&self, context: &str) -> Result<Option<String>> {
        let key = format!("refresh_token:{context}");
        self.get(&key)
    }

    /// Store AWS credentials
    ///
    /// # Errors
    ///
    /// Returns an error if storing the AWS credentials fails.
    pub fn store_aws_credentials(
        &self,
        profile: &str,
        access_key: &str,
        secret_key: &str,
    ) -> Result<()> {
        let creds = format!("{access_key}:{secret_key}");
        let key = format!("aws:{profile}");
        self.store(&key, &creds)
    }

    /// Get AWS credentials
    ///
    /// # Errors
    ///
    /// Returns an error if retrieving the AWS credentials fails.
    pub fn get_aws_credentials(&self, profile: &str) -> Result<Option<(String, String)>> {
        let key = format!("aws:{profile}");
        match self.get(&key)? {
            Some(creds) => {
                let parts: Vec<&str> = creds.splitn(2, ':').collect();
                if parts.len() == 2 {
                    Ok(Some((parts[0].to_string(), parts[1].to_string())))
                } else {
                    Ok(None)
                }
            }
            None => Ok(None),
        }
    }
}

impl Default for CredentialStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These tests require a system keyring to be available
    // They are marked as ignored by default

    #[test]
    #[ignore]
    fn test_store_and_retrieve() {
        let store = CredentialStore::new();
        let key = "test-key";
        let value = "test-value";

        store.store(key, value).unwrap();
        let retrieved = store.get(key).unwrap();
        assert_eq!(retrieved, Some(value.to_string()));

        store.delete(key).unwrap();
        let deleted = store.get(key).unwrap();
        assert_eq!(deleted, None);
    }

    #[test]
    #[ignore]
    fn test_token_operations() {
        let store = CredentialStore::new();
        let context = "test-context";
        let token = "test-token";

        store.store_token(context, token).unwrap();
        let retrieved = store.get_token(context).unwrap();
        assert_eq!(retrieved, Some(token.to_string()));

        store.delete_token(context).unwrap();
    }
}
