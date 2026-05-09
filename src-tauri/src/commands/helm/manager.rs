//! Global helm CLI manager singleton — wrapped in an async Mutex
//! so `reload_helm_manager` can swap the inner tool when CLI paths
//! change without invalidating outstanding handles.

use crate::cli::helm::HelmTool;
use crate::cli::CliToolManager;
use once_cell::sync::Lazy;
use tokio::sync::Mutex;

static HELM: Lazy<Mutex<CliToolManager<HelmTool>>> = Lazy::new(|| {
    let tool = HelmTool::with_default_config();
    Mutex::new(CliToolManager::new(tool))
});

/// Get the global helm manager for internal use
pub async fn helm_manager() -> tokio::sync::MutexGuard<'static, CliToolManager<HelmTool>> {
    HELM.lock().await
}

/// Reload helm manager with fresh configuration
///
/// This should be called when CLI paths configuration changes
/// to ensure the manager uses the updated custom path.
pub async fn reload_helm_manager() {
    let mut manager = HELM.lock().await;
    let tool = HelmTool::with_default_config();
    manager.reload(tool);
}
