//! kubectl CLI availability check using unified CLI infrastructure

use crate::cli::kubectl::KubectlTool;
use crate::cli::{CliAvailability, CliToolManager};
use crate::error::Result;
use once_cell::sync::Lazy;
use tokio::sync::Mutex;

/// Global kubectl manager singleton with async Mutex for reload support
static KUBECTL: Lazy<Mutex<CliToolManager<KubectlTool>>> = Lazy::new(|| {
    let tool = KubectlTool::with_default_config();
    Mutex::new(CliToolManager::new(tool))
});

/// Check if kubectl CLI is available
///
/// This command checks whether kubectl is available on the system,
/// returns version information, and lists all paths that were searched.
#[tauri::command]
pub async fn check_kubectl_availability() -> Result<CliAvailability> {
    let manager = KUBECTL.lock().await;
    Ok(manager.check_availability().await)
}

/// Get the global kubectl manager for internal use
///
/// This allows other modules to execute kubectl commands without
/// duplicating path resolution logic.
pub async fn kubectl_manager() -> tokio::sync::MutexGuard<'static, CliToolManager<KubectlTool>> {
    KUBECTL.lock().await
}

/// Reload kubectl manager with fresh configuration
///
/// This should be called when CLI paths configuration changes
/// to ensure the manager uses the updated custom path.
pub async fn reload_kubectl_manager() {
    let mut manager = KUBECTL.lock().await;
    let tool = KubectlTool::with_default_config();
    manager.reload(tool);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_check_kubectl_availability() {
        // This test will succeed or fail based on system kubectl installation
        let result = check_kubectl_availability().await;
        assert!(result.is_ok());

        let availability = result.unwrap();
        // Should have searched at least one path
        assert!(!availability.searched_paths.is_empty());
    }

    #[tokio::test]
    async fn test_kubectl_manager_singleton() {
        // Test that we can acquire the manager lock multiple times
        {
            let _manager1 = kubectl_manager().await;
            // Manager lock is released here
        }
        {
            let _manager2 = kubectl_manager().await;
            // Manager lock is released here
        }

        // Both calls should succeed without deadlock
        assert!(true);
    }
}
