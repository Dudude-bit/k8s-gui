//! kubectl-compatible plugin discovery and execution

use crate::error::{Error, PluginError, Result};
use crate::plugins::{PluginContext, PluginInfo, PluginResult, PluginType};
use crate::shell::ShellCommand;
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

/// kubectl plugin manager
pub struct KubectlPluginManager {
    /// Discovered plugins
    plugins: HashMap<String, KubectlPlugin>,
}

/// kubectl plugin information
#[derive(Debug, Clone)]
pub struct KubectlPlugin {
    /// Plugin name (without kubectl- prefix)
    pub name: String,
    /// Path to the executable
    pub path: PathBuf,
    /// Whether it's executable
    pub executable: bool,
}

impl KubectlPluginManager {
    /// Create a new kubectl plugin manager
    #[must_use]
    pub fn new() -> Self {
        Self {
            plugins: HashMap::new(),
        }
    }

    /// Discover kubectl plugins in PATH
    pub fn discover(&mut self) -> Result<Vec<KubectlPlugin>> {
        // Use generic PluginDiscovery to find kubectl plugins
        let mut discovery = crate::cli::PluginDiscovery::new("kubectl-");
        let plugin_infos = discovery.discover()?;

        let mut discovered = Vec::new();

        for info in plugin_infos {
            let plugin = KubectlPlugin {
                name: info.name.clone(),
                path: info.path.clone(),
                executable: info.executable,
            };

            // Don't override if already found (first in PATH wins)
            if !self.plugins.contains_key(&info.name) {
                self.plugins.insert(info.name.clone(), plugin.clone());
                discovered.push(plugin);
            }
        }

        tracing::info!("Discovered {} kubectl plugins", discovered.len());
        Ok(discovered)
    }

    /// List all discovered plugins
    #[must_use]
    pub fn list(&self) -> Vec<&KubectlPlugin> {
        self.plugins.values().collect()
    }

    /// Get a plugin by name
    #[must_use]
    pub fn get(&self, name: &str) -> Option<&KubectlPlugin> {
        self.plugins.get(name)
    }

    /// Execute a kubectl plugin
    pub async fn execute(
        &self,
        name: &str,
        args: &[String],
        context: &PluginContext,
    ) -> Result<PluginResult> {
        let plugin = self
            .plugins
            .get(name)
            .ok_or_else(|| Error::Plugin(PluginError::NotFound(name.to_string())))?;

        plugin.execute(args, context).await
    }
}

impl Default for KubectlPluginManager {
    fn default() -> Self {
        Self::new()
    }
}

impl KubectlPlugin {
    /// Execute the plugin
    pub async fn execute(&self, args: &[String], context: &PluginContext) -> Result<PluginResult> {
        if !self.executable {
            return Err(Error::Plugin(PluginError::ExecutionFailed(format!(
                "Plugin {} is not executable",
                self.name
            ))));
        }

        let mut cmd = ShellCommand::new(&self.path)
            .args(args)
            .timeout(Duration::from_secs(context.timeout_secs));

        // Set environment
        cmd = cmd.env(
            "KUBECONFIG",
            context.kubeconfig_path.as_deref().unwrap_or(""),
        );

        for (key, value) in &context.env {
            cmd = cmd.env(key, value);
        }

        // Set working directory
        if let Some(work_dir) = &context.work_dir {
            cmd = cmd.current_dir(work_dir);
        }

        let output = cmd.run().await.map_err(|e| match e {
            crate::shell::ShellError::Timeout(_) => Error::Plugin(PluginError::Timeout),
            _ => Error::Plugin(PluginError::ExecutionFailed(e.to_string())),
        })?;

        Ok(PluginResult {
            exit_code: output.exit_code,
            stdout: output.stdout,
            stderr: output.stderr,
            data: None,
        })
    }

    /// Get plugin info
    #[must_use]
    pub fn info(&self) -> PluginInfo {
        PluginInfo {
            name: self.name.clone(),
            plugin_type: PluginType::KubectlCommand,
            version: "unknown".to_string(),
            description: format!("kubectl plugin: {}", self.name),
            author: None,
            path: Some(self.path.to_string_lossy().to_string()),
            enabled: self.executable,
            supported_resources: vec![],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_kubectl_plugin_manager() {
        let manager = KubectlPluginManager::new();
        assert!(manager.list().is_empty());
    }
}
