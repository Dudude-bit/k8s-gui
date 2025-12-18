//! Plugin manager for loading and managing all plugin types

use crate::error::{Error, PluginError, Result};
use crate::plugins::{
    traits::{ContextMenuExtension, PluginCommand, PluginContext, ResourceRenderer},
    kubectl::KubectlPluginManager,
    helm::{HelmPlugin, HelmReleaseRenderer, helm_plugin_info},
    PluginInfo, PluginResult, PluginType,
};
use crate::resources::GenericResource;
use dashmap::DashMap;
use std::sync::Arc;

/// Central plugin manager
pub struct PluginManager {
    /// kubectl plugin manager
    kubectl_manager: KubectlPluginManager,
    
    /// Command plugins
    command_plugins: DashMap<String, Arc<dyn PluginCommand>>,
    
    /// Context menu extensions
    context_menu_plugins: DashMap<String, Arc<dyn ContextMenuExtension>>,
    
    /// Resource renderers
    resource_renderers: DashMap<String, Arc<dyn ResourceRenderer>>,
    
    /// Plugin info cache
    plugin_info: DashMap<String, PluginInfo>,
}

impl PluginManager {
    /// Create a new plugin manager
    pub fn new() -> Result<Self> {
        let mut manager = Self {
            kubectl_manager: KubectlPluginManager::new(),
            command_plugins: DashMap::new(),
            context_menu_plugins: DashMap::new(),
            resource_renderers: DashMap::new(),
            plugin_info: DashMap::new(),
        };

        // Register built-in plugins
        manager.register_builtin_plugins()?;
        
        // Discover kubectl plugins
        manager.discover_kubectl_plugins()?;

        Ok(manager)
    }

    /// Register built-in plugins
    fn register_builtin_plugins(&mut self) -> Result<()> {
        // Register Helm plugin
        let helm_plugin = Arc::new(HelmPlugin::new());
        self.register_command_plugin(helm_plugin.clone())?;
        self.register_context_menu_plugin(helm_plugin)?;
        
        // Register Helm release renderer
        let helm_renderer = Arc::new(HelmReleaseRenderer);
        self.register_resource_renderer(helm_renderer)?;

        // Store plugin info
        self.plugin_info.insert("helm".to_string(), helm_plugin_info());

        Ok(())
    }

    /// Discover and register kubectl plugins
    fn discover_kubectl_plugins(&mut self) -> Result<()> {
        let plugins = self.kubectl_manager.discover()?;
        
        for plugin in plugins {
            self.plugin_info.insert(plugin.name.clone(), plugin.info());
        }

        Ok(())
    }

    /// Register a command plugin
    pub fn register_command_plugin(&self, plugin: Arc<dyn PluginCommand>) -> Result<()> {
        let name = plugin.name().to_string();
        tracing::info!("Registering command plugin: {}", name);
        self.command_plugins.insert(name, plugin);
        Ok(())
    }

    /// Register a context menu plugin
    pub fn register_context_menu_plugin(&self, plugin: Arc<dyn ContextMenuExtension>) -> Result<()> {
        let name = plugin.name().to_string();
        tracing::info!("Registering context menu plugin: {}", name);
        self.context_menu_plugins.insert(name, plugin);
        Ok(())
    }

    /// Register a resource renderer
    pub fn register_resource_renderer(&self, renderer: Arc<dyn ResourceRenderer>) -> Result<()> {
        let name = renderer.name().to_string();
        tracing::info!("Registering resource renderer: {}", name);
        self.resource_renderers.insert(name, renderer);
        Ok(())
    }

    /// List all plugins
    pub fn list_plugins(&self) -> Vec<PluginInfo> {
        self.plugin_info.iter().map(|r| r.value().clone()).collect()
    }

    /// Get plugin info by name
    pub fn get_plugin_info(&self, name: &str) -> Option<PluginInfo> {
        self.plugin_info.get(name).map(|r| r.value().clone())
    }

    /// Execute a command plugin
    pub async fn execute_command(
        &self,
        name: &str,
        args: &[String],
        context: &PluginContext,
    ) -> Result<PluginResult> {
        // First check registered command plugins
        if let Some(plugin) = self.command_plugins.get(name) {
            return plugin.execute(args, context).await;
        }

        // Then check kubectl plugins
        if self.kubectl_manager.get(name).is_some() {
            return self.kubectl_manager.execute(name, args, context).await;
        }

        Err(Error::Plugin(PluginError::NotFound(name.to_string())))
    }

    /// Get context menu items for a resource
    pub async fn get_context_menu_items(
        &self,
        resource: &GenericResource,
    ) -> Result<Vec<(String, Vec<super::traits::ContextMenuItem>)>> {
        let mut all_items = Vec::new();

        for plugin in self.context_menu_plugins.iter() {
            let supported = plugin.supported_kinds();
            if supported.is_empty() || supported.contains(&resource.kind) {
                match plugin.get_menu_items(resource).await {
                    Ok(items) if !items.is_empty() => {
                        all_items.push((plugin.name().to_string(), items));
                    }
                    Ok(_) => {}
                    Err(e) => {
                        tracing::warn!(
                            "Plugin {} failed to get menu items: {}",
                            plugin.name(),
                            e
                        );
                    }
                }
            }
        }

        Ok(all_items)
    }

    /// Execute a context menu action
    pub async fn execute_context_menu_action(
        &self,
        plugin_name: &str,
        action_id: &str,
        resource: &GenericResource,
        context: &PluginContext,
    ) -> Result<PluginResult> {
        let plugin = self
            .context_menu_plugins
            .get(plugin_name)
            .ok_or_else(|| Error::Plugin(PluginError::NotFound(plugin_name.to_string())))?;

        plugin.execute_action(action_id, resource, context).await
    }

    /// Find a renderer for a resource
    pub fn find_renderer(&self, api_version: &str, kind: &str) -> Option<Arc<dyn ResourceRenderer>> {
        for renderer in self.resource_renderers.iter() {
            if renderer.can_render(api_version, kind) {
                return Some(renderer.clone());
            }
        }
        None
    }

    /// Render a resource using an appropriate renderer
    pub async fn render_resource(
        &self,
        resource: &GenericResource,
    ) -> Result<Option<super::traits::RenderedResource>> {
        if let Some(renderer) = self.find_renderer(&resource.api_version, &resource.kind) {
            let rendered = renderer.render(resource).await?;
            return Ok(Some(rendered));
        }
        Ok(None)
    }

    /// Reload plugins
    pub fn reload(&mut self) -> Result<()> {
        tracing::info!("Reloading plugins...");
        
        // Rediscover kubectl plugins
        self.kubectl_manager = KubectlPluginManager::new();
        self.discover_kubectl_plugins()?;
        
        tracing::info!("Plugins reloaded");
        Ok(())
    }

    /// Enable a plugin
    pub fn enable_plugin(&self, name: &str) -> Result<()> {
        if let Some(mut info) = self.plugin_info.get_mut(name) {
            info.enabled = true;
            Ok(())
        } else {
            Err(Error::Plugin(PluginError::NotFound(name.to_string())))
        }
    }

    /// Disable a plugin
    pub fn disable_plugin(&self, name: &str) -> Result<()> {
        if let Some(mut info) = self.plugin_info.get_mut(name) {
            info.enabled = false;
            Ok(())
        } else {
            Err(Error::Plugin(PluginError::NotFound(name.to_string())))
        }
    }

    /// Check if a plugin is enabled
    pub fn is_enabled(&self, name: &str) -> bool {
        self.plugin_info
            .get(name)
            .map(|info| info.enabled)
            .unwrap_or(false)
    }

    /// Get plugin count
    pub fn plugin_count(&self) -> PluginCount {
        let kubectl_count = self.kubectl_manager.list().len();
        let command_count = self.command_plugins.len();
        let context_menu_count = self.context_menu_plugins.len();
        let renderer_count = self.resource_renderers.len();

        PluginCount {
            kubectl: kubectl_count,
            command: command_count,
            context_menu: context_menu_count,
            renderer: renderer_count,
            total: kubectl_count + command_count + context_menu_count + renderer_count,
        }
    }
}

/// Plugin count statistics
#[derive(Debug, Clone, serde::Serialize)]
pub struct PluginCount {
    pub kubectl: usize,
    pub command: usize,
    pub context_menu: usize,
    pub renderer: usize,
    pub total: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plugin_manager_creation() {
        let manager = PluginManager::new().unwrap();
        let count = manager.plugin_count();
        
        // Should have at least the built-in helm plugin
        assert!(count.total > 0);
    }

    #[test]
    fn test_plugin_enable_disable() {
        let manager = PluginManager::new().unwrap();
        
        // Helm should be enabled by default
        assert!(manager.is_enabled("helm"));
        
        // Disable it
        manager.disable_plugin("helm").unwrap();
        assert!(!manager.is_enabled("helm"));
        
        // Enable it again
        manager.enable_plugin("helm").unwrap();
        assert!(manager.is_enabled("helm"));
    }

    #[test]
    fn test_list_plugins() {
        let manager = PluginManager::new().unwrap();
        let plugins = manager.list_plugins();
        
        // Should have helm plugin
        assert!(plugins.iter().any(|p| p.name == "helm"));
    }
}
