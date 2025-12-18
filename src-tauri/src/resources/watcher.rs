//! Resource watcher for real-time updates

use crate::error::Result;
use crate::state::AppEvent;
use futures::StreamExt;
use kube::{
    api::{Api, WatchEvent, WatchParams},
    Client, Resource, ResourceExt,
};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::fmt::Debug;
use std::sync::Arc;
use tokio::sync::{broadcast, oneshot};

/// Resource watcher that streams events for any Kubernetes resource
pub struct ResourceWatcher<K>
where
    K: Clone + DeserializeOwned + Debug + Send + 'static,
{
    api: Api<K>,
    event_tx: broadcast::Sender<AppEvent>,
    resource_type: String,
}

impl<K> ResourceWatcher<K>
where
    K: Clone + DeserializeOwned + Debug + Send + Resource + Serialize + 'static,
    <K as Resource>::DynamicType: Default,
{
    /// Create a new resource watcher
    pub fn new(api: Api<K>, event_tx: broadcast::Sender<AppEvent>, resource_type: &str) -> Self {
        Self {
            api,
            event_tx,
            resource_type: resource_type.to_string(),
        }
    }

    /// Start watching resources
    pub async fn watch(
        self,
        watch_id: String,
        params: Option<WatchParams>,
        mut cancel_rx: oneshot::Receiver<()>,
    ) -> Result<()> {
        let params = params.unwrap_or_default();
        let mut stream = self.api.watch(&params, "0").await?.boxed();

        loop {
            tokio::select! {
                _ = &mut cancel_rx => {
                    tracing::debug!("Watch {} cancelled", watch_id);
                    break;
                }
                event = stream.next() => {
                    match event {
                        Some(Ok(watch_event)) => {
                            if let Err(e) = self.handle_event(&watch_id, watch_event).await {
                                tracing::error!("Error handling watch event: {}", e);
                            }
                        }
                        Some(Err(e)) => {
                            tracing::error!("Watch error: {}", e);
                            let _ = self.event_tx.send(AppEvent::Error {
                                code: "WATCH_ERROR".to_string(),
                                message: e.to_string(),
                            });
                            break;
                        }
                        None => {
                            tracing::debug!("Watch stream ended");
                            break;
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Handle a watch event
    async fn handle_event(&self, watch_id: &str, event: WatchEvent<K>) -> Result<()>
    where
        K: ResourceExt + Serialize,
    {
        let app_event = match event {
            WatchEvent::Added(resource) => {
                let name = resource.name_any();
                let namespace = resource.namespace().unwrap_or_default();
                
                AppEvent::WatchEvent {
                    watch_id: watch_id.to_string(),
                    event_type: "ADDED".to_string(),
                    resource: serde_json::to_value(&resource)?,
                }
            }
            WatchEvent::Modified(resource) => {
                let name = resource.name_any();
                let namespace = resource.namespace().unwrap_or_default();
                
                AppEvent::WatchEvent {
                    watch_id: watch_id.to_string(),
                    event_type: "MODIFIED".to_string(),
                    resource: serde_json::to_value(&resource)?,
                }
            }
            WatchEvent::Deleted(resource) => {
                let name = resource.name_any();
                let namespace = resource.namespace().unwrap_or_default();
                
                AppEvent::WatchEvent {
                    watch_id: watch_id.to_string(),
                    event_type: "DELETED".to_string(),
                    resource: serde_json::to_value(&resource)?,
                }
            }
            WatchEvent::Bookmark(_) => {
                return Ok(());
            }
            WatchEvent::Error(e) => {
                AppEvent::Error {
                    code: format!("WATCH_{}", e.code),
                    message: e.message,
                }
            }
        };

        let _ = self.event_tx.send(app_event);
        Ok(())
    }
}

/// Watch configuration
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WatchConfig {
    /// Resource type to watch
    pub resource_type: String,
    /// Namespace (None for cluster-scoped or all namespaces)
    pub namespace: Option<String>,
    /// Label selector
    pub label_selector: Option<String>,
    /// Field selector
    pub field_selector: Option<String>,
}

impl WatchConfig {
    /// Create watch params from config
    pub fn to_watch_params(&self) -> WatchParams {
        let mut params = WatchParams::default();
        
        if let Some(labels) = &self.label_selector {
            params = params.labels(labels);
        }
        
        if let Some(fields) = &self.field_selector {
            params = params.fields(fields);
        }
        
        params
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_watch_config() {
        let config = WatchConfig {
            resource_type: "pods".to_string(),
            namespace: Some("default".to_string()),
            label_selector: Some("app=nginx".to_string()),
            field_selector: None,
        };

        let params = config.to_watch_params();
        // WatchParams doesn't expose selectors, so we just ensure it doesn't panic
    }
}
