//! Shared exec-credential types used by both the exec flow and the
//! native-cloud fallback that fakes one.

use kube::config::ExecAuthCluster;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
pub(super) struct ExecCredential {
    pub status: Option<ExecCredentialStatus>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ExecCredentialStatus {
    #[serde(rename = "expirationTimestamp")]
    pub expiration_timestamp: Option<String>,
    pub token: Option<String>,
    #[serde(rename = "clientCertificateData")]
    pub client_certificate_data: Option<String>,
    #[serde(rename = "clientKeyData")]
    pub client_key_data: Option<String>,
}

#[derive(Debug, Serialize)]
pub(super) struct ExecCredentialSpec {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interactive: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cluster: Option<ExecAuthCluster>,
}

#[derive(Debug, Serialize)]
pub(super) struct ExecCredentialRequest {
    pub kind: Option<String>,
    #[serde(rename = "apiVersion")]
    pub api_version: Option<String>,
    pub spec: Option<ExecCredentialSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<serde_json::Value>,
}

/// Parameters for creating a terminal session for exec auth
pub(super) struct ExecTerminalParams {
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
}
