//! JWT token generation and validation

use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid, // user id
    pub exp: i64, // expiration time
    pub iat: i64, // issued at
    pub typ: String, // token type: "access" or "refresh"
}

impl Claims {
    pub fn new(user_id: Uuid, token_type: String, expiry_seconds: i64) -> Self {
        let now = Utc::now();
        Claims {
            sub: user_id,
            exp: (now + Duration::seconds(expiry_seconds)).timestamp(),
            iat: now.timestamp(),
            typ: token_type,
        }
    }
}

pub struct JwtService {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    access_token_expiry: i64,
    refresh_token_expiry: i64,
}

impl JwtService {
    pub fn new(secret: &str, access_expiry: i64, refresh_expiry: i64) -> Self {
        Self {
            encoding_key: EncodingKey::from_secret(secret.as_ref()),
            decoding_key: DecodingKey::from_secret(secret.as_ref()),
            access_token_expiry: access_expiry,
            refresh_token_expiry: refresh_expiry,
        }
    }

    pub fn generate_access_token(&self, user_id: Uuid) -> Result<String, jsonwebtoken::errors::Error> {
        let claims = Claims::new(user_id, "access".to_string(), self.access_token_expiry);
        encode(&Header::default(), &claims, &self.encoding_key)
    }

    pub fn generate_refresh_token(&self, user_id: Uuid) -> Result<String, jsonwebtoken::errors::Error> {
        let claims = Claims::new(user_id, "refresh".to_string(), self.refresh_token_expiry);
        encode(&Header::default(), &claims, &self.encoding_key)
    }

    pub(crate) fn validate_token(&self, token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
        let mut validation = Validation::default();
        validation.validate_exp = true;
        validation.leeway = 60; // 1 minute leeway

        let token_data = decode::<Claims>(token, &self.decoding_key, &validation)?;
        Ok(token_data.claims)
    }

    pub fn validate_access_token(&self, token: &str) -> Result<Uuid, jsonwebtoken::errors::Error> {
        let claims = self.validate_token(token)?;
        if claims.typ != "access" {
            return Err(jsonwebtoken::errors::Error::from(jsonwebtoken::errors::ErrorKind::InvalidToken));
        }
        Ok(claims.sub)
    }

    pub fn validate_refresh_token(&self, token: &str) -> Result<Uuid, jsonwebtoken::errors::Error> {
        let claims = self.validate_token(token)?;
        if claims.typ != "refresh" {
            return Err(jsonwebtoken::errors::Error::from(jsonwebtoken::errors::ErrorKind::InvalidToken));
        }
        Ok(claims.sub)
    }
}

/// Hash a refresh token for storage
pub fn hash_refresh_token(token: &str) -> String {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_generation_and_validation() {
        let service = JwtService::new("test_secret", 3600, 86400);
        let user_id = Uuid::new_v4();

        let access_token = service.generate_access_token(user_id).unwrap();
        let validated_user_id = service.validate_access_token(&access_token).unwrap();
        assert_eq!(user_id, validated_user_id);

        let refresh_token = service.generate_refresh_token(user_id).unwrap();
        let validated_user_id = service.validate_refresh_token(&refresh_token).unwrap();
        assert_eq!(user_id, validated_user_id);
    }
}

