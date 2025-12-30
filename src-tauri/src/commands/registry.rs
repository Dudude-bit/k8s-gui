//! Registry search and credential storage commands.

use crate::auth::CredentialStore;
use crate::error::Error;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use dirs::home_dir;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const REGISTRY_KEY_PREFIX: &str = "registry:";
const SEARCH_LIMIT: usize = 200;
const RESULT_LIMIT: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryAuth {
    pub auth_type: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryAuthStatus {
    pub auth_type: String,
    pub username: Option<String>,
    pub has_credentials: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryConfig {
    pub id: String,
    pub provider: String,
    pub base_url: Option<String>,
    pub host: Option<String>,
    pub project: Option<String>,
    pub account_id: Option<String>,
    pub region: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrySearchRequest {
    pub query: String,
    pub registry: RegistryConfig,
    pub auth: Option<RegistryAuth>,
    pub use_saved_auth: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryImageResult {
    pub id: String,
    pub name: String,
    pub description: String,
    pub is_official: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryImportEntry {
    pub server: String,
    pub host: String,
    pub base_url: String,
    pub is_docker_hub: bool,
    pub auth: Option<RegistryAuth>,
}

#[derive(Debug, Deserialize)]
struct DockerConfigFile {
    auths: Option<HashMap<String, DockerAuthEntry>>,
}

#[derive(Debug, Deserialize)]
struct DockerAuthEntry {
    auth: Option<String>,
    #[serde(rename = "identitytoken")]
    identity_token: Option<String>,
}

fn registry_key(registry_id: &str) -> String {
    format!("{REGISTRY_KEY_PREFIX}{registry_id}")
}

fn build_auth_header(auth: &RegistryAuth) -> Option<String> {
    match auth.auth_type.as_str() {
        "basic" => {
            let username = auth.username.as_ref()?.trim();
            let password = auth.password.as_ref()?.trim();
            if username.is_empty() || password.is_empty() {
                return None;
            }
            let encoded = STANDARD.encode(format!("{username}:{password}"));
            Some(format!("Basic {encoded}"))
        }
        "bearer" => {
            let token = auth.token.as_ref()?.trim();
            if token.is_empty() {
                return None;
            }
            Some(format!("Bearer {token}"))
        }
        _ => None,
    }
}

fn normalize_base_url(input: &str) -> String {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    }
}

fn host_from_url(base_url: &str) -> String {
    base_url
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("")
        .to_string()
}

fn host_from_server(server: &str) -> String {
    server
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("")
        .trim()
        .to_string()
}

fn is_docker_hub_host(host: &str) -> bool {
    matches!(
        host,
        "docker.io" | "index.docker.io" | "registry-1.docker.io"
    )
}

fn docker_config_path() -> Result<PathBuf, String> {
    let home = home_dir().ok_or_else(|| "Unable to resolve home directory".to_string())?;
    Ok(home.join(".docker").join("config.json"))
}

fn decode_basic_auth(encoded: &str) -> Option<(String, String)> {
    let decoded = STANDARD.decode(encoded.trim()).ok()?;
    let decoded = String::from_utf8(decoded).ok()?;
    let mut parts = decoded.splitn(2, ':');
    let username = parts.next()?.to_string();
    let password = parts.next().unwrap_or("").to_string();
    if username.is_empty() && password.is_empty() {
        None
    } else {
        Some((username, password))
    }
}

fn load_saved_auth(registry_id: &str) -> Result<Option<RegistryAuth>, String> {
    let store = CredentialStore::new();
    let key = registry_key(registry_id);
    let raw = store.get(&key).map_err(|e: Error| e.to_string())?;
    if let Some(value) = raw {
        serde_json::from_str(&value)
            .map(Some)
            .map_err(|e| e.to_string())
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn import_docker_config() -> Result<Vec<RegistryImportEntry>, String> {
    let path = docker_config_path()?;
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read Docker config at {}: {}", path.display(), e))?;
    let config: DockerConfigFile =
        serde_json::from_str(&raw).map_err(|e| format!("Failed to parse Docker config: {e}"))?;
    let auths = config.auths.unwrap_or_default();
    let mut entries = Vec::new();
    let mut seen_hosts = HashMap::new();

    for (server, auth_entry) in auths {
        let host = host_from_server(&server);
        if host.is_empty() {
            continue;
        }
        let host_key = host.to_lowercase();
        if seen_hosts.contains_key(&host_key) {
            continue;
        }
        seen_hosts.insert(host_key, true);

        let is_docker_hub = is_docker_hub_host(&host);
        let base_url = normalize_base_url(&host);
        let mut auth: Option<RegistryAuth> = None;

        if let Some(token) = auth_entry.identity_token.as_ref() {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                auth = Some(RegistryAuth {
                    auth_type: "bearer".to_string(),
                    username: None,
                    password: None,
                    token: Some(trimmed.to_string()),
                });
            }
        } else if let Some(auth_value) = auth_entry.auth.as_ref() {
            if let Some((username, password)) = decode_basic_auth(auth_value) {
                auth = Some(RegistryAuth {
                    auth_type: "basic".to_string(),
                    username: Some(username),
                    password: Some(password),
                    token: None,
                });
            }
        }

        entries.push(RegistryImportEntry {
            server,
            host,
            base_url,
            is_docker_hub,
            auth,
        });
    }

    Ok(entries)
}

async fn search_registry_catalog(
    client: &Client,
    base_url: &str,
    query: &str,
    auth_header: Option<String>,
    project_filter: Option<&str>,
) -> Result<Vec<RegistryImageResult>, String> {
    let url = format!(
        "{}/v2/_catalog?n={}",
        base_url.trim_end_matches('/'),
        SEARCH_LIMIT
    );
    let mut request = client.get(url);
    if let Some(header) = auth_header {
        request = request.header("Authorization", header);
    }
    let response = request.send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Registry request failed with {}",
            response.status()
        ));
    }
    let payload: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let repositories = payload
        .get("repositories")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "Registry catalog did not return repositories".to_string())?;
    let needle = query.to_lowercase();
    let host = host_from_url(base_url);
    let mut results = Vec::new();
    for repo_value in repositories {
        let repo = match repo_value.as_str() {
            Some(value) => value,
            None => continue,
        };
        if let Some(project) = project_filter {
            if !repo.starts_with(&format!("{project}/")) {
                continue;
            }
        }
        if !repo.to_lowercase().contains(&needle) {
            continue;
        }
        let name = if host.is_empty() {
            repo.to_string()
        } else {
            format!("{host}/{repo}")
        };
        results.push(RegistryImageResult {
            id: name.clone(),
            name,
            description: String::new(),
            is_official: false,
        });
        if results.len() >= RESULT_LIMIT {
            break;
        }
    }
    Ok(results)
}

async fn search_docker_hub(
    client: &Client,
    query: &str,
) -> Result<Vec<RegistryImageResult>, String> {
    let url = format!(
        "https://hub.docker.com/v2/search/repositories/?query={}&page_size={}",
        urlencoding::encode(query),
        RESULT_LIMIT
    );
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Docker Hub search failed with {}",
            response.status()
        ));
    }
    let payload: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let results = match payload.get("results").and_then(|value| value.as_array()) {
        Some(value) => value,
        None => return Ok(Vec::new()),
    };
    let mut output = Vec::new();
    for entry in results.iter().take(RESULT_LIMIT) {
        let repo_name = entry
            .get("repo_name")
            .and_then(|value| value.as_str())
            .unwrap_or_default();
        let namespace = entry
            .get("namespace")
            .and_then(|value| value.as_str())
            .unwrap_or_default();
        let name = entry
            .get("name")
            .and_then(|value| value.as_str())
            .unwrap_or_default();
        let full_name = if !repo_name.is_empty() {
            repo_name
        } else if !namespace.is_empty() && !name.is_empty() {
            &format!("{namespace}/{name}")
        } else {
            ""
        };
        if full_name.is_empty() {
            continue;
        }
        let display_name = full_name.strip_prefix("library/").unwrap_or(full_name);
        let description = entry
            .get("description")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        let is_official = entry
            .get("is_official")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false)
            || entry
                .get("is_trusted")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false);
        output.push(RegistryImageResult {
            id: display_name.to_string(),
            name: display_name.to_string(),
            description,
            is_official,
        });
    }
    Ok(output)
}

async fn search_harbor(
    client: &Client,
    base_url: &str,
    query: &str,
    auth_header: Option<String>,
    project_filter: Option<&str>,
) -> Result<Vec<RegistryImageResult>, String> {
    let url = format!(
        "{}/api/v2.0/search?q={}",
        base_url.trim_end_matches('/'),
        urlencoding::encode(query)
    );
    let mut request = client.get(url);
    if let Some(header) = auth_header {
        request = request.header("Authorization", header);
    }
    let response = request.send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Harbor search failed with {}", response.status()));
    }
    let payload: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let repositories = match payload.get("repository").and_then(|value| value.as_array()) {
        Some(value) => value,
        None => return Ok(Vec::new()),
    };
    let host = host_from_url(base_url);
    let mut output = Vec::new();
    for entry in repositories.iter().take(RESULT_LIMIT) {
        let repo_name = entry
            .get("repository_name")
            .and_then(|value| value.as_str())
            .unwrap_or_default();
        if repo_name.is_empty() {
            continue;
        }
        if let Some(project) = project_filter {
            if !repo_name.starts_with(&format!("{project}/")) {
                continue;
            }
        }
        let full_name = if host.is_empty() {
            repo_name.to_string()
        } else {
            format!("{host}/{repo_name}")
        };
        let description = entry
            .get("description")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        output.push(RegistryImageResult {
            id: full_name.clone(),
            name: full_name,
            description,
            is_official: false,
        });
    }
    Ok(output)
}

#[tauri::command]
pub async fn set_registry_credentials(
    registry_id: String,
    auth: RegistryAuth,
) -> Result<(), String> {
    let store = CredentialStore::new();
    let key = registry_key(&registry_id);
    if auth.auth_type == "none" {
        store.delete(&key).map_err(|e: Error| e.to_string())?;
        return Ok(());
    }
    let value = serde_json::to_string(&auth).map_err(|e| e.to_string())?;
    store.store(&key, &value).map_err(|e: Error| e.to_string())
}

#[tauri::command]
pub async fn delete_registry_credentials(registry_id: String) -> Result<(), String> {
    let store = CredentialStore::new();
    let key = registry_key(&registry_id);
    store.delete(&key).map_err(|e: Error| e.to_string())
}

#[tauri::command]
pub async fn get_registry_auth_status(
    registry_id: String,
) -> Result<Option<RegistryAuthStatus>, String> {
    let auth = load_saved_auth(&registry_id)?;
    if let Some(auth) = auth {
        Ok(Some(RegistryAuthStatus {
            auth_type: auth.auth_type,
            username: auth.username,
            has_credentials: true,
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn search_registry_images(
    request: RegistrySearchRequest,
) -> Result<Vec<RegistryImageResult>, String> {
    let client = Client::new();
    let mut auth = request.auth.clone();
    if request.use_saved_auth {
        if let Some(saved) = load_saved_auth(&request.registry.id)? {
            auth = Some(saved);
        }
    }
    let auth_header = auth.as_ref().and_then(build_auth_header);

    match request.registry.provider.as_str() {
        "docker-hub" => search_docker_hub(&client, &request.query).await,
        "harbor" => {
            let base_url = request
                .registry
                .base_url
                .as_ref()
                .map(|value| normalize_base_url(value))
                .ok_or_else(|| "Harbor base URL is required".to_string())?;
            let project_filter = request.registry.project.as_deref();
            search_harbor(
                &client,
                &base_url,
                &request.query,
                auth_header,
                project_filter,
            )
            .await
        }
        "gcr" => {
            let host = request.registry.host.as_deref().unwrap_or("gcr.io");
            let base_url = normalize_base_url(host);
            let project_filter = request.registry.project.as_deref();
            search_registry_catalog(
                &client,
                &base_url,
                &request.query,
                auth_header,
                project_filter,
            )
            .await
        }
        "ecr" => {
            let account_id = request
                .registry
                .account_id
                .as_ref()
                .ok_or_else(|| "ECR account ID is required".to_string())?;
            let region = request
                .registry
                .region
                .as_ref()
                .ok_or_else(|| "ECR region is required".to_string())?;
            let base_url =
                normalize_base_url(&format!("{account_id}.dkr.ecr.{region}.amazonaws.com"));
            search_registry_catalog(&client, &base_url, &request.query, auth_header, None).await
        }
        "registry-v2" => {
            let base_url = request
                .registry
                .base_url
                .as_ref()
                .map(|value| normalize_base_url(value))
                .ok_or_else(|| "Registry URL is required".to_string())?;
            search_registry_catalog(&client, &base_url, &request.query, auth_header, None).await
        }
        other => Err(format!("Unsupported registry provider: {other}")),
    }
}
