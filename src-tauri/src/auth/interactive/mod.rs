//! Interactive authentication helpers for exec and OIDC flows.
//!
//! Public surface: `prepare_kubeconfig_for_context` — the rest is
//! split by flow into `cloud` (native GKE/AKS), `exec` (kubectl
//! exec credential plugins), and `oidc` (kubeconfig auth-provider
//! `oidc`). Shared exec-credential types live in `cred`.

mod cloud;
mod cred;
mod exec;
mod oidc;

use crate::error::{Error, Result};
use crate::state::AppState;
use kube::config::{AuthInfo, ExecAuthCluster, Kubeconfig};
use secrecy::SecretString;

use cred::ExecCredentialStatus;

/// Prepare kubeconfig for a context, handling exec auth if needed.
///
/// # Errors
///
/// Returns an error if the context cannot be resolved, exec
/// authentication fails, or kubeconfig processing fails.
pub async fn prepare_kubeconfig_for_context(
    state: &AppState,
    mut kubeconfig: Kubeconfig,
    context_name: &str,
) -> Result<Kubeconfig> {
    let (user_name, cluster_name) = resolve_context(&kubeconfig, context_name)?;

    // First, get the exec config and check if we need cluster info
    let (exec_config, needs_cluster_info) = {
        let auth_info = find_auth_info_mut(&mut kubeconfig, &user_name)?;
        if let Some(exec) = auth_info.exec.clone() {
            (Some(exec.clone()), exec.provide_cluster_info)
        } else {
            (None, false)
        }
    };

    // Now resolve cluster info if needed (kubeconfig is no longer mutably borrowed)
    let exec_cluster = if needs_cluster_info {
        resolve_exec_cluster(&kubeconfig, &cluster_name)?
    } else {
        None
    };

    // Get auth_info again for modification
    let auth_info = find_auth_info_mut(&mut kubeconfig, &user_name)?;

    if let Some(exec_config) = exec_config {
        let status = exec::run_exec_auth(state, context_name, &exec_config, exec_cluster).await?;
        apply_exec_credentials(auth_info, status);
        auth_info.exec = None;
        auth_info.auth_provider = None;
        return Ok(kubeconfig);
    }

    if let Some(provider) = auth_info.auth_provider.clone() {
        if provider.name == "oidc" {
            let oidc_result = oidc::run_oidc_auth(state, context_name, &provider).await?;
            auth_info.token = Some(SecretString::from(oidc_result.token));
            auth_info.auth_provider = None;
        }
    }

    Ok(kubeconfig)
}

fn resolve_context(kubeconfig: &Kubeconfig, context_name: &str) -> Result<(String, String)> {
    let context = kubeconfig
        .contexts
        .iter()
        .find(|ctx| ctx.name == context_name)
        .and_then(|ctx| ctx.context.as_ref())
        .ok_or_else(|| Error::Config(format!("Context {context_name} not found")))?;

    let user = context
        .user
        .clone()
        .ok_or_else(|| Error::Config(format!("Context {context_name} has no user")))?;
    Ok((user, context.cluster.clone()))
}

fn find_auth_info_mut<'a>(
    kubeconfig: &'a mut Kubeconfig,
    user_name: &str,
) -> Result<&'a mut AuthInfo> {
    let auth_info = kubeconfig
        .auth_infos
        .iter_mut()
        .find(|info| info.name == user_name)
        .ok_or_else(|| Error::Config(format!("Auth info {user_name} not found")))?;

    Ok(auth_info.auth_info.get_or_insert_with(AuthInfo::default))
}

fn resolve_exec_cluster(
    kubeconfig: &Kubeconfig,
    cluster_name: &str,
) -> Result<Option<ExecAuthCluster>> {
    let cluster = kubeconfig
        .clusters
        .iter()
        .find(|cluster| cluster.name == cluster_name)
        .and_then(|cluster| cluster.cluster.as_ref())
        .ok_or_else(|| Error::Config(format!("Cluster {cluster_name} not found")))?;

    let exec_cluster = ExecAuthCluster::try_from(cluster)
        .map_err(|e| Error::Config(format!("Failed to load cluster info: {e}")))?;
    Ok(Some(exec_cluster))
}

fn apply_exec_credentials(auth_info: &mut AuthInfo, status: ExecCredentialStatus) {
    if let Some(token) = status.token {
        auth_info.token = Some(SecretString::from(token));
    }
    if let Some(cert) = status.client_certificate_data {
        auth_info.client_certificate_data = Some(cert);
    }
    if let Some(key) = status.client_key_data {
        auth_info.client_key_data = Some(SecretString::from(key));
    }
    if let Some(expiry) = status.expiration_timestamp {
        let _ = expiry;
    }
}
