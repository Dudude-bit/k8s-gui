//! kubectl-compatible plugin discovery and execution

use crate::error::{Error, PluginError, Result};
use crate::plugins::{PluginContext, PluginInfo, PluginResult, PluginType};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

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
        let path_var = std::env::var("PATH").unwrap_or_default();
        let paths: Vec<&str> = path_var.split(':').collect();

        let mut discovered = Vec::new();

        for path in paths {
            let dir = Path::new(path);
            if !dir.is_dir() {
                continue;
            }

            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let file_name = entry.file_name();
                    let name = file_name.to_string_lossy();

                    if name.starts_with("kubectl-") {
                        let plugin_name = name.trim_start_matches("kubectl-").replace('-', "_"); // kubectl uses - as separator, convert to _

                        let path = entry.path();
                        let executable = is_executable(&path);

                        if executable {
                            let plugin = KubectlPlugin {
                                name: plugin_name.clone(),
                                path: path.clone(),
                                executable,
                            };

                            // Don't override if already found (first in PATH wins)
                            if !self.plugins.contains_key(&plugin_name) {
                                self.plugins.insert(plugin_name.clone(), plugin.clone());
                                discovered.push(plugin);
                            }
                        }
                    }
                }
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

        let mut cmd = Command::new(&self.path);
        cmd.args(args);

        // Set environment
        cmd.env(
            "KUBECONFIG",
            context.kubeconfig_path.as_deref().unwrap_or(""),
        );

        for (key, value) in &context.env {
            cmd.env(key, value);
        }

        // Set working directory
        if let Some(work_dir) = &context.work_dir {
            cmd.current_dir(work_dir);
        }

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let timeout_duration = Duration::from_secs(context.timeout_secs);

        let result = timeout(timeout_duration, async {
            let output = cmd.output().await?;
            Ok::<_, std::io::Error>(output)
        })
        .await
        .map_err(|_| Error::Plugin(PluginError::Timeout))?
        .map_err(|e| Error::Plugin(PluginError::ExecutionFailed(e.to_string())))?;

        Ok(PluginResult {
            exit_code: result.status.code(),
            stdout: String::from_utf8_lossy(&result.stdout).to_string(),
            stderr: String::from_utf8_lossy(&result.stderr).to_string(),
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

/// Check if a file is executable
#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    if let Ok(metadata) = std::fs::metadata(path) {
        let permissions = metadata.permissions();
        permissions.mode() & 0o111 != 0
    } else {
        false
    }
}

#[cfg(windows)]
fn is_executable(path: &Path) -> bool {
    // On Windows, check for .exe, .bat, .cmd extensions
    path.extension()
        .map(|ext| {
            let ext = ext.to_string_lossy().to_lowercase();
            ext == "exe" || ext == "bat" || ext == "cmd"
        })
        .unwrap_or(false)
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
