//! Plugin traits for extensibility
//! 
//! Defines the core traits that plugins must implement.

use crate::error::Result;
use crate::resources::GenericResource;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Trait for kubectl-compatible command plugins
#[async_trait]
pub trait PluginCommand: Send + Sync {
    /// Get command name
    fn name(&self) -> &str;

    /// Get command description
    fn description(&self) -> &str;

    /// Get command usage
    fn usage(&self) -> &str;

    /// Execute the command
    async fn execute(&self, args: &[String], context: &PluginContext) -> Result<super::PluginResult>;

    /// Get command flags
    fn flags(&self) -> Vec<CommandFlag> {
        vec![]
    }

    /// Validate arguments before execution
    fn validate_args(&self, _args: &[String]) -> Result<()> {
        Ok(())
    }
}

/// Command flag definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandFlag {
    pub name: String,
    pub short: Option<char>,
    pub description: String,
    pub required: bool,
    pub default_value: Option<String>,
}

/// Context menu item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextMenuItem {
    /// Item ID
    pub id: String,
    /// Display label
    pub label: String,
    /// Icon (optional)
    pub icon: Option<String>,
    /// Keyboard shortcut
    pub shortcut: Option<String>,
    /// Whether item is dangerous (shows confirmation)
    pub dangerous: bool,
    /// Sub-menu items
    pub submenu: Vec<ContextMenuItem>,
}

impl ContextMenuItem {
    /// Create a new context menu item
    #[must_use] 
    pub fn new(id: &str, label: &str) -> Self {
        Self {
            id: id.to_string(),
            label: label.to_string(),
            icon: None,
            shortcut: None,
            dangerous: false,
            submenu: vec![],
        }
    }

    /// Set icon
    #[must_use] 
    pub fn with_icon(mut self, icon: &str) -> Self {
        self.icon = Some(icon.to_string());
        self
    }

    /// Set shortcut
    #[must_use] 
    pub fn with_shortcut(mut self, shortcut: &str) -> Self {
        self.shortcut = Some(shortcut.to_string());
        self
    }

    /// Mark as dangerous
    #[must_use] 
    pub fn dangerous(mut self) -> Self {
        self.dangerous = true;
        self
    }

    /// Add submenu
    #[must_use] 
    pub fn with_submenu(mut self, items: Vec<ContextMenuItem>) -> Self {
        self.submenu = items;
        self
    }
}

/// Trait for context menu extensions
#[async_trait]
pub trait ContextMenuExtension: Send + Sync {
    /// Get extension name
    fn name(&self) -> &str;

    /// Get supported resource kinds
    fn supported_kinds(&self) -> Vec<String>;

    /// Get context menu items for a resource
    async fn get_menu_items(&self, resource: &GenericResource) -> Result<Vec<ContextMenuItem>>;

    /// Execute a menu item action
    async fn execute_action(
        &self,
        action_id: &str,
        resource: &GenericResource,
        context: &PluginContext,
    ) -> Result<super::PluginResult>;
}

/// Rendered resource view
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderedResource {
    /// Title for the view
    pub title: String,
    /// Summary fields
    pub summary: Vec<ResourceField>,
    /// Detail sections
    pub sections: Vec<ResourceSection>,
    /// Actions available for this resource
    pub actions: Vec<ResourceAction>,
    /// Custom HTML (optional)
    pub custom_html: Option<String>,
}

/// Resource field
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceField {
    pub label: String,
    pub value: String,
    pub value_type: FieldValueType,
}

/// Field value type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FieldValueType {
    Text,
    Link,
    Code,
    Badge,
    Status,
    DateTime,
}

/// Resource section
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceSection {
    pub title: String,
    pub fields: Vec<ResourceField>,
    pub collapsed: bool,
}

/// Resource action
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceAction {
    pub id: String,
    pub label: String,
    pub icon: Option<String>,
    pub primary: bool,
    pub dangerous: bool,
}

/// Trait for custom resource renderers
#[async_trait]
pub trait ResourceRenderer: Send + Sync {
    /// Get renderer name
    fn name(&self) -> &str;

    /// Get supported API groups and kinds
    fn supported_resources(&self) -> Vec<(String, String)>; // (api_group, kind)

    /// Check if this renderer can handle a resource
    fn can_render(&self, api_version: &str, kind: &str) -> bool;

    /// Render a resource for display
    async fn render(&self, resource: &GenericResource) -> Result<RenderedResource>;

    /// Get custom actions for a resource
    async fn get_actions(&self, _resource: &GenericResource) -> Result<Vec<ResourceAction>> {
        Ok(vec![])
    }

    /// Execute a custom action
    async fn execute_action(
        &self,
        _action_id: &str,
        _resource: &GenericResource,
        _context: &PluginContext,
    ) -> Result<super::PluginResult> {
        Err(crate::error::Error::Plugin(
            crate::error::PluginError::ExecutionFailed("Action not implemented".to_string()),
        ))
    }
}

/// Plugin execution context
#[derive(Debug, Clone)]
pub struct PluginContext {
    /// Current Kubernetes context
    pub kube_context: String,
    /// Current namespace
    pub namespace: String,
    /// Kubeconfig path
    pub kubeconfig_path: Option<String>,
    /// Environment variables
    pub env: HashMap<String, String>,
    /// Working directory
    pub work_dir: Option<String>,
    /// Timeout in seconds
    pub timeout_secs: u64,
}

impl Default for PluginContext {
    fn default() -> Self {
        Self {
            kube_context: String::new(),
            namespace: "default".to_string(),
            kubeconfig_path: None,
            env: HashMap::new(),
            work_dir: None,
            timeout_secs: 60,
        }
    }
}

impl PluginContext {
    /// Create a new plugin context
    #[must_use] 
    pub fn new(kube_context: &str, namespace: &str) -> Self {
        Self {
            kube_context: kube_context.to_string(),
            namespace: namespace.to_string(),
            ..Default::default()
        }
    }

    /// Set kubeconfig path
    #[must_use] 
    pub fn with_kubeconfig(mut self, path: &str) -> Self {
        self.kubeconfig_path = Some(path.to_string());
        self
    }

    /// Add environment variable
    #[must_use] 
    pub fn with_env(mut self, key: &str, value: &str) -> Self {
        self.env.insert(key.to_string(), value.to_string());
        self
    }

    /// Set timeout
    #[must_use] 
    pub fn with_timeout(mut self, secs: u64) -> Self {
        self.timeout_secs = secs;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_menu_item() {
        let item = ContextMenuItem::new("delete", "Delete Pod")
            .with_icon("trash")
            .with_shortcut("Ctrl+D")
            .dangerous();

        assert_eq!(item.id, "delete");
        assert!(item.dangerous);
    }

    #[test]
    fn test_plugin_context() {
        let ctx = PluginContext::new("prod-cluster", "production")
            .with_kubeconfig("/home/user/.kube/config")
            .with_timeout(120);

        assert_eq!(ctx.kube_context, "prod-cluster");
        assert_eq!(ctx.namespace, "production");
        assert_eq!(ctx.timeout_secs, 120);
    }
}
