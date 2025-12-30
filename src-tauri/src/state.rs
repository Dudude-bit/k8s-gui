//! Application state management
//! 
//! This module manages the global application state including active connections,
//! cached data, and plugin registry.

use crate::auth::AuthManager;
use crate::cache::ResourceCache;
use crate::client::K8sClientManager;
use crate::config::AppConfig;
use crate::error::Result;
use crate::plugins::PluginManager;
use dashmap::DashMap;
use parking_lot::RwLock;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::broadcast;
use uuid::Uuid;

/// Events that can be broadcast to frontend
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", content = "data")]
pub enum AppEvent {
    /// Resource was created
    ResourceCreated {
        kind: String,
        name: String,
        namespace: String,
    },
    /// Resource was updated
    ResourceUpdated {
        kind: String,
        name: String,
        namespace: String,
    },
    /// Resource was deleted
    ResourceDeleted {
        kind: String,
        name: String,
        namespace: String,
    },
    /// Connection status changed
    ConnectionStatusChanged {
        context: String,
        connected: bool,
    },
    /// Log message received
    LogMessage {
        stream_id: String,
        pod: String,
        container: String,
        message: String,
        timestamp: Option<String>,
    },
    /// Terminal output received
    TerminalOutput {
        session_id: String,
        data: String,
    },
    /// Terminal session closed
    TerminalClosed {
        session_id: String,
        status: Option<String>,
    },
    /// Port-forward status update
    PortForwardStatus {
        id: String,
        pod: String,
        namespace: String,
        local_port: u16,
        remote_port: u16,
        status: String,
        message: Option<String>,
        attempt: Option<u32>,
    },
    /// Auth URL requested for interactive login
    AuthUrlRequested {
        context: String,
        url: String,
        flow: String,
        session_id: Option<String>,
    },
    /// Auth flow completed
    AuthFlowCompleted {
        session_id: String,
        context: String,
        success: bool,
        message: Option<String>,
    },
    /// Auth flow cancelled
    AuthFlowCancelled {
        session_id: String,
        context: String,
        message: Option<String>,
    },
    /// Error occurred
    Error {
        code: String,
        message: String,
    },
    /// Watch event
    WatchEvent {
        watch_id: String,
        event_type: String,
        resource: serde_json::Value,
    },
}

/// Session information for active connections
#[derive(Debug, Clone)]
pub struct Session {
    pub id: String,
    pub context: String,
    pub namespace: String,
    pub connected_at: chrono::DateTime<chrono::Utc>,
}

/// Terminal session information
#[derive(Debug, Clone)]
pub struct TerminalSession {
    pub id: String,
    pub pod: String,
    pub container: String,
    pub namespace: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Port-forward session information
#[derive(Debug, Clone)]
pub struct PortForwardSession {
    pub id: String,
    pub context: String,
    pub pod: String,
    pub namespace: String,
    pub local_port: u16,
    pub remote_port: u16,
    pub auto_reconnect: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Auth session control for interactive flows
#[derive(Debug)]
pub struct AuthSessionControl {
    pub context: String,
    pub flow: String,
    pub cancel_tx: tokio::sync::oneshot::Sender<()>,
}

/// Watch subscription information
#[derive(Debug)]
pub struct WatchSubscription {
    pub id: String,
    pub resource_type: String,
    pub namespace: Option<String>,
    pub cancel_tx: tokio::sync::oneshot::Sender<()>,
}

/// Log stream information
#[derive(Debug)]
pub struct LogStream {
    pub id: String,
    pub pod: String,
    pub container: String,
    pub namespace: String,
    pub cancel_tx: tokio::sync::oneshot::Sender<()>,
}

/// Global application state
pub struct AppState {
    /// Application configuration
    pub config: Arc<RwLock<AppConfig>>,
    
    /// Kubernetes client manager
    pub client_manager: Arc<K8sClientManager>,
    
    /// Authentication manager
    pub auth_manager: Arc<AuthManager>,
    
    /// Plugin manager
    pub plugin_manager: Arc<PluginManager>,
    
    /// Resource cache
    pub cache: Arc<ResourceCache>,
    
    /// Active sessions by context
    pub sessions: DashMap<String, Session>,
    
    /// Current active context
    pub current_context: Arc<RwLock<Option<String>>>,
    
    /// Current namespace per context
    pub namespaces: DashMap<String, String>,
    
    /// Active terminal sessions
    pub terminal_sessions: DashMap<String, TerminalSession>,
    
    /// Terminal input channels
    pub terminal_inputs: DashMap<String, tokio::sync::mpsc::Sender<String>>,

    /// Active port-forward sessions
    pub port_forward_sessions: Arc<DashMap<String, PortForwardSession>>,

    /// Port-forward cancel controls
    pub port_forward_controls: Arc<DashMap<String, tokio::sync::oneshot::Sender<()>>>,
    
    /// Active watch subscriptions
    pub watch_subscriptions: DashMap<String, WatchSubscription>,
    
    /// Active log streams
    pub log_streams: DashMap<String, LogStream>,
    
    /// Event broadcaster
    pub event_tx: broadcast::Sender<AppEvent>,

    /// Active auth sessions
    pub auth_sessions: DashMap<String, AuthSessionControl>,

    /// Monotonic counter for connection attempts
    pub connect_generation: AtomicU64,
}

impl AppState {
    /// Create a new application state
    pub fn new() -> Result<Self> {
        let config = AppConfig::load()?;
        let (event_tx, _) = broadcast::channel(1000);
        
        let client_manager = Arc::new(K8sClientManager::new());
        let auth_manager = Arc::new(AuthManager::new());
        let plugin_manager = Arc::new(PluginManager::new()?);
        let cache = Arc::new(ResourceCache::new(config.cache.ttl_seconds));
        
        Ok(Self {
            config: Arc::new(RwLock::new(config)),
            client_manager,
            auth_manager,
            plugin_manager,
            cache,
            sessions: DashMap::new(),
            current_context: Arc::new(RwLock::new(None)),
            namespaces: DashMap::new(),
            terminal_sessions: DashMap::new(),
            terminal_inputs: DashMap::new(),
            port_forward_sessions: Arc::new(DashMap::new()),
            port_forward_controls: Arc::new(DashMap::new()),
            watch_subscriptions: DashMap::new(),
            log_streams: DashMap::new(),
            event_tx,
            auth_sessions: DashMap::new(),
            connect_generation: AtomicU64::new(0),
        })
    }

    /// Subscribe to application events
    pub fn subscribe(&self) -> broadcast::Receiver<AppEvent> {
        self.event_tx.subscribe()
    }

    /// Increment and return the current connection attempt generation
    pub fn next_connect_generation(&self) -> u64 {
        self.connect_generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    /// Check if the generation is still the latest
    pub fn is_latest_connect_generation(&self, generation: u64) -> bool {
        self.connect_generation.load(Ordering::SeqCst) == generation
    }

    /// Emit an event to all subscribers
    pub fn emit(&self, event: AppEvent) {
        let _ = self.event_tx.send(event);
    }

    /// Create a new auth session
    pub fn create_auth_session(
        &self,
        context: &str,
        flow: &str,
    ) -> (String, tokio::sync::oneshot::Receiver<()>) {
        let session_id = Uuid::new_v4().to_string();
        let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel();
        let session = AuthSessionControl {
            context: context.to_string(),
            flow: flow.to_string(),
            cancel_tx,
        };
        self.auth_sessions.insert(session_id.clone(), session);
        (session_id, cancel_rx)
    }

    /// Remove an auth session
    pub fn remove_auth_session(&self, session_id: &str) -> Option<AuthSessionControl> {
        self.auth_sessions
            .remove(session_id)
            .map(|(_, session)| session)
    }

    /// Cancel all auth sessions for a context
    pub fn cancel_auth_sessions_for_context(&self, context: &str) -> Vec<String> {
        let session_ids: Vec<String> = self
            .auth_sessions
            .iter()
            .filter_map(|entry| {
                if entry.value().context == context {
                    Some(entry.key().clone())
                } else {
                    None
                }
            })
            .collect();
        for session_id in &session_ids {
            if let Some((_, session)) = self.auth_sessions.remove(session_id) {
                let _ = session.cancel_tx.send(());
            }
        }
        session_ids
    }

    /// Get current context
    pub fn get_current_context(&self) -> Option<String> {
        self.current_context.read().clone()
    }

    /// Set current context
    pub fn set_current_context(&self, context: Option<String>) {
        *self.current_context.write() = context;
    }

    /// Get current namespace for a context
    pub fn get_namespace(&self, context: &str) -> String {
        self.namespaces
            .get(context).map_or_else(|| "default".to_string(), |n| n.clone())
    }

    /// Set namespace for a context
    pub fn set_namespace(&self, context: &str, namespace: &str) {
        self.namespaces.insert(context.to_string(), namespace.to_string());
    }

    /// Create a new session
    pub fn create_session(&self, context: &str) -> Session {
        let session = Session {
            id: Uuid::new_v4().to_string(),
            context: context.to_string(),
            namespace: self.get_namespace(context),
            connected_at: chrono::Utc::now(),
        };
        self.sessions.insert(context.to_string(), session.clone());
        session
    }

    /// Remove a session
    pub fn remove_session(&self, context: &str) {
        self.sessions.remove(context);
    }

    /// Generate a new terminal session ID
    pub fn new_terminal_session_id(&self) -> String {
        Uuid::new_v4().to_string()
    }

    /// Generate a new watch ID
    pub fn new_watch_id(&self) -> String {
        Uuid::new_v4().to_string()
    }

    /// Generate a new log stream ID
    pub fn new_log_stream_id(&self) -> String {
        Uuid::new_v4().to_string()
    }

    /// Cancel all active watches
    pub async fn cancel_all_watches(&self) {
        let keys: Vec<_> = self.watch_subscriptions.iter().map(|r| r.key().clone()).collect();
        for key in keys {
            if let Some((_, sub)) = self.watch_subscriptions.remove(&key) {
                let _ = sub.cancel_tx.send(());
            }
        }
    }

    /// Cancel all log streams
    pub async fn cancel_all_log_streams(&self) {
        let keys: Vec<_> = self.log_streams.iter().map(|r| r.key().clone()).collect();
        for key in keys {
            if let Some((_, stream)) = self.log_streams.remove(&key) {
                let _ = stream.cancel_tx.send(());
            }
        }
    }

    /// Get application statistics
    pub fn stats(&self) -> AppStats {
        AppStats {
            active_sessions: self.sessions.len(),
            active_terminal_sessions: self.terminal_sessions.len(),
            active_watches: self.watch_subscriptions.len(),
            active_log_streams: self.log_streams.len(),
            cache_entries: self.cache.len(),
        }
    }
}

/// Application statistics
#[derive(Debug, Clone, serde::Serialize)]
pub struct AppStats {
    pub active_sessions: usize,
    pub active_terminal_sessions: usize,
    pub active_watches: usize,
    pub active_log_streams: usize,
    pub cache_entries: usize,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new().expect("Failed to create default AppState")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_management() {
        let state = AppState::new().unwrap();
        
        let session = state.create_session("test-context");
        assert_eq!(session.context, "test-context");
        assert!(state.sessions.contains_key("test-context"));
        
        state.remove_session("test-context");
        assert!(!state.sessions.contains_key("test-context"));
    }

    #[test]
    fn test_namespace_management() {
        let state = AppState::new().unwrap();
        
        assert_eq!(state.get_namespace("test"), "default");
        
        state.set_namespace("test", "kube-system");
        assert_eq!(state.get_namespace("test"), "kube-system");
    }

    #[test]
    fn test_event_subscription() {
        let state = AppState::new().unwrap();
        let mut rx = state.subscribe();
        
        state.emit(AppEvent::ConnectionStatusChanged {
            context: "test".to_string(),
            connected: true,
        });
        
        // Event should be received
        let event = rx.try_recv();
        assert!(event.is_ok());
    }
}
