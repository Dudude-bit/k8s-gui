//! Watch commands for real-time resource updates

use crate::commands::helpers::ResourceContext;
use crate::error::{Error, Result};
use crate::resources::{ResourceType, ResourceWatcher};
use crate::state::{AppState, WatchSubscription};
use crate::utils::normalize_optional_namespace;
use k8s_openapi::api::apps::v1::{DaemonSet, Deployment, StatefulSet};
use k8s_openapi::api::batch::v1::{CronJob, Job};
use k8s_openapi::api::core::v1::{
    ConfigMap, Endpoints, Node, PersistentVolume, PersistentVolumeClaim, Pod, Secret, Service,
};
use k8s_openapi::api::networking::v1::Ingress;
use k8s_openapi::api::storage::v1::StorageClass;
use kube::api::WatchParams;
use kube::Api;
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::broadcast;

/// Information about an active watch subscription
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchInfo {
    pub id: String,
    pub resource_type: String,
    pub namespace: Option<String>,
}

/// Spawn a watch task for a given API
fn spawn_watch_task<K>(
    api: Api<K>,
    event_tx: broadcast::Sender<crate::state::AppEvent>,
    watch_id: String,
    watch_params: WatchParams,
    cancel_rx: tokio::sync::oneshot::Receiver<()>,
    resource_type: ResourceType,
) where
    K: kube::Resource + Clone + std::fmt::Debug + Send + Sync + 'static,
    K: serde::de::DeserializeOwned + serde::Serialize,
    K::DynamicType: Default,
{
    let watcher = ResourceWatcher::new(api, event_tx);
    let resource_name = resource_type.to_string();
    tokio::spawn(async move {
        if let Err(e) = watcher.watch(watch_id, Some(watch_params), cancel_rx).await {
            tracing::error!("Watch error for {}: {}", resource_name, e);
        }
    });
}

/// Start watching a resource type for changes
///
/// Returns a watch_id that can be used to stop the watch later.
/// Events will be emitted as "watch-event" Tauri events.
#[tauri::command]
pub async fn start_watch(
    resource_type: String,
    namespace: Option<String>,
    label_selector: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    // Parse resource type
    let res_type = ResourceType::from_str(&resource_type).ok_or_else(|| {
        Error::InvalidInput(format!("Unsupported resource type: {}", resource_type))
    })?;

    let watch_id = state.new_watch_id();
    let event_tx = state.event_tx.clone();

    // Normalize namespace input
    let namespace = normalize_optional_namespace(namespace);

    // Use ResourceContext pattern for consistent client/namespace handling
    let ctx = ResourceContext::for_list(&state, namespace.clone())?;

    // Create cancel channel
    let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel();

    // Store subscription
    let subscription = WatchSubscription {
        id: watch_id.clone(),
        resource_type: res_type.kind().to_string(),
        namespace: namespace.clone(),
        cancel_tx,
    };
    state
        .watch_subscriptions
        .insert(watch_id.clone(), subscription);

    // Build watch params
    let mut watch_params = WatchParams::default();
    if let Some(labels) = label_selector {
        watch_params = watch_params.labels(&labels);
    }

    let watch_id_clone = watch_id.clone();

    // Spawn watch task based on resource type
    match res_type {
        ResourceType::Pod => {
            let api: Api<Pod> = ctx.namespaced_or_cluster_api();
            spawn_watch_task(api, event_tx, watch_id_clone, watch_params, cancel_rx, res_type);
        }
        ResourceType::Deployment => {
            let api: Api<Deployment> = ctx.namespaced_or_cluster_api();
            spawn_watch_task(api, event_tx, watch_id_clone, watch_params, cancel_rx, res_type);
        }
        ResourceType::Service => {
            let api: Api<Service> = ctx.namespaced_or_cluster_api();
            spawn_watch_task(api, event_tx, watch_id_clone, watch_params, cancel_rx, res_type);
        }
        ResourceType::StatefulSet => {
            let api: Api<StatefulSet> = ctx.namespaced_or_cluster_api();
            spawn_watch_task(api, event_tx, watch_id_clone, watch_params, cancel_rx, res_type);
        }
        ResourceType::DaemonSet => {
            let api: Api<DaemonSet> = ctx.namespaced_or_cluster_api();
            spawn_watch_task(api, event_tx, watch_id_clone, watch_params, cancel_rx, res_type);
        }
        ResourceType::Job => {
            let api: Api<Job> = ctx.namespaced_or_cluster_api();
            spawn_watch_task(api, event_tx, watch_id_clone, watch_params, cancel_rx, res_type);
        }
        ResourceType::CronJob => {
            let api: Api<CronJob> = ctx.namespaced_or_cluster_api();
            spawn_watch_task(api, event_tx, watch_id_clone, watch_params, cancel_rx, res_type);
        }
        ResourceType::ConfigMap => {
            let api: Api<ConfigMap> = ctx.namespaced_or_cluster_api();
            spawn_watch_task(api, event_tx, watch_id_clone, watch_params, cancel_rx, res_type);
        }
        ResourceType::Secret => {
            let api: Api<Secret> = ctx.namespaced_or_cluster_api();
            spawn_watch_task(api, event_tx, watch_id_clone, watch_params, cancel_rx, res_type);
        }
        ResourceType::Ingress => {
            let api: Api<Ingress> = ctx.namespaced_or_cluster_api();
            spawn_watch_task(api, event_tx, watch_id_clone, watch_params, cancel_rx, res_type);
        }
        ResourceType::PersistentVolumeClaim => {
            let api: Api<PersistentVolumeClaim> = ctx.namespaced_or_cluster_api();
            spawn_watch_task(api, event_tx, watch_id_clone, watch_params, cancel_rx, res_type);
        }
        // Cluster-scoped resources
        ResourceType::Node => {
            let api: Api<Node> = ctx.cluster_api();
            spawn_watch_task(api, event_tx, watch_id_clone, watch_params, cancel_rx, res_type);
        }
        ResourceType::PersistentVolume => {
            let api: Api<PersistentVolume> = ctx.cluster_api();
            spawn_watch_task(api, event_tx, watch_id_clone, watch_params, cancel_rx, res_type);
        }
        ResourceType::StorageClass => {
            let api: Api<StorageClass> = ctx.cluster_api();
            spawn_watch_task(api, event_tx, watch_id_clone, watch_params, cancel_rx, res_type);
        }
        ResourceType::Endpoints => {
            let api: Api<Endpoints> = ctx.namespaced_or_cluster_api();
            spawn_watch_task(api, event_tx, watch_id_clone, watch_params, cancel_rx, res_type);
        }
    }

    tracing::info!(
        "Started watch {} for {} in namespace {:?}",
        watch_id,
        res_type,
        namespace
    );

    Ok(watch_id)
}

/// Stop watching a resource
#[tauri::command]
pub async fn stop_watch(watch_id: String, state: State<'_, AppState>) -> Result<()> {
    if let Some((_, subscription)) = state.watch_subscriptions.remove(&watch_id) {
        let _ = subscription.cancel_tx.send(());
        tracing::info!("Stopped watch {}", watch_id);
        Ok(())
    } else {
        Err(Error::not_found("Watch", &watch_id, ""))
    }
}

/// List all active watch subscriptions
#[tauri::command]
pub async fn list_active_watches(state: State<'_, AppState>) -> Result<Vec<WatchInfo>> {
    let watches: Vec<WatchInfo> = state
        .watch_subscriptions
        .iter()
        .map(|entry| WatchInfo {
            id: entry.value().id.clone(),
            resource_type: entry.value().resource_type.clone(),
            namespace: entry.value().namespace.clone(),
        })
        .collect();

    Ok(watches)
}
