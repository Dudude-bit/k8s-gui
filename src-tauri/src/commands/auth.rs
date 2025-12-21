//! Authentication commands

use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Authentication method
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AuthMethodRequest {
    Kubeconfig,
    BearerToken { token: String },
    Certificate { cert: String, key: String },
    AwsEks { cluster_name: String, region: String },
    Oidc { issuer_url: String, client_id: String },
}

/// Authentication result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResultResponse {
    pub success: bool,
    pub context: Option<String>,
    pub error: Option<String>,
}

/// EKS Cluster info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EksClusterInfo {
    pub name: String,
    pub endpoint: String,
    pub region: String,
    pub status: String,
}

/// OIDC Auth response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OidcAuthResponse {
    pub auth_url: String,
    pub state: String,
}

/// Get current authentication status
#[tauri::command]
pub async fn get_auth_status(
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    Ok(state.get_current_context())
}

/// Authenticate with kubeconfig (default method)
#[tauri::command]
pub async fn auth_with_kubeconfig(
    state: State<'_, AppState>,
) -> Result<AuthResultResponse, String> {
    match state.client_manager.load_kubeconfig().await {
        Ok(_) => {
            let context = state.client_manager.get_current_context().await
                .map_err(|e| e.to_string())?;
            
            state.set_current_context(context.clone());
            
            Ok(AuthResultResponse {
                success: true,
                context,
                error: None,
            })
        }
        Err(e) => Ok(AuthResultResponse {
            success: false,
            context: None,
            error: Some(e.to_string()),
        })
    }
}

/// Authenticate with bearer token
#[tauri::command]
pub async fn auth_with_token(
    token: String,
    server: String,
    context_name: Option<String>,
    state: State<'_, AppState>,
) -> Result<AuthResultResponse, String> {
    use crate::auth::{AuthConfig, AuthMethod};
    
    let auth_config = AuthConfig {
        method: AuthMethod::BearerToken { token },
        server_url: Some(server),
        ca_data: None,
        insecure_skip_tls_verify: false,
    };
    
    let context = context_name.unwrap_or_else(|| "token-auth".to_string());
    
    match state.client_manager.connect_with_auth(&context, &auth_config).await {
        Ok(_) => {
            state.set_current_context(Some(context.clone()));
            Ok(AuthResultResponse {
                success: true,
                context: Some(context),
                error: None,
            })
        }
        Err(e) => Ok(AuthResultResponse {
            success: false,
            context: None,
            error: Some(e.to_string()),
        })
    }
}

/// Authenticate with certificate
#[tauri::command]
pub async fn auth_with_certificate(
    cert_path: String,
    key_path: String,
    server: String,
    ca_path: Option<String>,
    context_name: Option<String>,
    state: State<'_, AppState>,
) -> Result<AuthResultResponse, String> {
    use crate::auth::{AuthConfig, AuthMethod};
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    
    let cert_data = std::fs::read_to_string(&cert_path)
        .map_err(|e| format!("Failed to read cert: {}", e))?;
    let key_data = std::fs::read_to_string(&key_path)
        .map_err(|e| format!("Failed to read key: {}", e))?;
    let ca_data = if let Some(ca) = ca_path {
        let ca_bytes = std::fs::read(&ca).map_err(|e| format!("Failed to read CA: {}", e))?;
        Some(STANDARD.encode(&ca_bytes))
    } else {
        None
    };
    
    let auth_config = AuthConfig {
        method: AuthMethod::Certificate {
            client_certificate_data: STANDARD.encode(cert_data.as_bytes()),
            client_key_data: STANDARD.encode(key_data.as_bytes()),
        },
        server_url: Some(server),
        ca_data,
        insecure_skip_tls_verify: false,
    };
    
    let context = context_name.unwrap_or_else(|| "cert-auth".to_string());
    
    match state.client_manager.connect_with_auth(&context, &auth_config).await {
        Ok(_) => {
            state.set_current_context(Some(context.clone()));
            Ok(AuthResultResponse {
                success: true,
                context: Some(context),
                error: None,
            })
        }
        Err(e) => Ok(AuthResultResponse {
            success: false,
            context: None,
            error: Some(e.to_string()),
        })
    }
}

/// Start OIDC authentication flow
#[tauri::command]
pub async fn start_oidc_auth(
    issuer_url: String,
    client_id: String,
    _state: State<'_, AppState>,
) -> Result<OidcAuthResponse, String> {
    // Stub: would initiate OIDC flow
    let state_param = uuid::Uuid::new_v4().to_string();
    let auth_url = format!(
        "{}/authorize?client_id={}&response_type=code&state={}&redirect_uri=http://localhost:8765/callback",
        issuer_url, client_id, state_param
    );
    
    Ok(OidcAuthResponse {
        auth_url,
        state: state_param,
    })
}

/// Complete OIDC authentication
#[tauri::command]
pub async fn complete_oidc_auth(
    code: String,
    state_param: String,
    _state: State<'_, AppState>,
) -> Result<AuthResultResponse, String> {
    // Stub: would exchange code for token
    tracing::info!("OIDC auth: code={}, state={}", code, state_param);
    Ok(AuthResultResponse {
        success: false,
        context: None,
        error: Some("OIDC authentication not yet implemented".to_string()),
    })
}

/// Authenticate with AWS EKS
#[tauri::command]
pub async fn auth_with_eks(
    cluster_name: String,
    region: String,
    profile: Option<String>,
    state: State<'_, AppState>,
) -> Result<AuthResultResponse, String> {
    use crate::auth::{AuthConfig, AuthMethod};
    
    let auth_config = AuthConfig {
        method: AuthMethod::AwsEks {
            cluster_name: cluster_name.clone(),
            region: region.clone(),
            profile,
            role_arn: None,
        },
        server_url: None,
        ca_data: None,
        insecure_skip_tls_verify: false,
    };
    
    let context = format!("eks-{}-{}", cluster_name, region);
    
    match state.client_manager.connect_with_auth(&context, &auth_config).await {
        Ok(_) => {
            state.set_current_context(Some(context.clone()));
            Ok(AuthResultResponse {
                success: true,
                context: Some(context),
                error: None,
            })
        }
        Err(e) => Ok(AuthResultResponse {
            success: false,
            context: None,
            error: Some(e.to_string()),
        })
    }
}

/// Cancel an active auth session
#[tauri::command]
pub async fn cancel_auth_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if let Some(session) = state.remove_auth_session(&session_id) {
        let _ = session.cancel_tx.send(());
        state.emit(crate::state::AppEvent::AuthFlowCancelled {
            session_id,
            context: session.context,
            message: Some("Authentication cancelled.".to_string()),
        });
    }
    Ok(())
}

/// List available EKS clusters
#[tauri::command]
pub async fn list_eks_clusters(
    region: Option<String>,
    _state: State<'_, AppState>,
) -> Result<Vec<EksClusterInfo>, String> {
    use aws_config::meta::region::RegionProviderChain;
    use aws_sdk_eks::Client;
    
    let region_provider = RegionProviderChain::first_try(region.map(aws_config::Region::new))
        .or_default_provider();
    
    let config = aws_config::from_env()
        .region(region_provider)
        .load()
        .await;
    
    let client = Client::new(&config);
    
    let clusters = client.list_clusters()
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    let cluster_names = clusters.clusters.unwrap_or_default();
    let mut cluster_infos = Vec::new();
    
    for name in cluster_names {
        if let Ok(desc) = client.describe_cluster().name(&name).send().await {
            if let Some(cluster) = desc.cluster {
                cluster_infos.push(EksClusterInfo {
                    name: cluster.name.unwrap_or_default(),
                    endpoint: cluster.endpoint.unwrap_or_default(),
                    region: config.region().map(|r| r.to_string()).unwrap_or_default(),
                    status: cluster.status.map(|s| s.as_str().to_string()).unwrap_or_default(),
                });
            }
        }
    }
    
    Ok(cluster_infos)
}

/// Refresh authentication (for tokens that expire)
#[tauri::command]
pub async fn refresh_auth(
    state: State<'_, AppState>,
) -> Result<AuthResultResponse, String> {
    // Stub: would refresh token if needed
    if let Some(context) = state.get_current_context() {
        Ok(AuthResultResponse {
            success: true,
            context: Some(context),
            error: None,
        })
    } else {
        Ok(AuthResultResponse {
            success: false,
            context: None,
            error: Some("No active authentication".to_string()),
        })
    }
}

/// Save credentials for later use
#[tauri::command]
pub async fn save_credentials(
    name: String,
    credentials: serde_json::Value,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    // Stub: would save to secure storage
    tracing::info!("Saving credentials: {}", name);
    let _ = credentials;
    Ok(())
}

/// Delete saved credentials
#[tauri::command]
pub async fn delete_credentials(
    name: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    // Stub: would delete from secure storage
    tracing::info!("Deleting credentials: {}", name);
    Ok(())
}

/// Logout / clear authentication
#[tauri::command]
pub async fn logout(
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.set_current_context(None);
    Ok(())
}
