//! Helm integration plugin
//! 
//! Provides Helm release management capabilities.

use crate::error::{Error, PluginError, Result};
use crate::plugins::{PluginContext, PluginInfo, PluginResult, PluginType};
use crate::plugins::traits::{
    ContextMenuExtension, ContextMenuItem, PluginCommand, ResourceRenderer,
    RenderedResource, ResourceField, ResourceSection, ResourceAction, FieldValueType,
};
use crate::resources::GenericResource;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

/// Helm release information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelmRelease {
    pub name: String,
    pub namespace: String,
    pub revision: String,
    pub updated: String,
    pub status: String,
    pub chart: String,
    pub app_version: String,
}

/// Helm chart information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelmChart {
    pub name: String,
    pub version: String,
    pub app_version: String,
    pub description: String,
}

/// Helm plugin for managing releases
pub struct HelmPlugin {
    /// Path to helm binary
    helm_path: String,
}

impl HelmPlugin {
    /// Create a new Helm plugin
    #[must_use] 
    pub fn new() -> Self {
        Self {
            helm_path: "helm".to_string(),
        }
    }

    /// Create with custom helm path
    #[must_use] 
    pub fn with_helm_path(path: &str) -> Self {
        Self {
            helm_path: path.to_string(),
        }
    }

    /// Execute helm command
    async fn exec_helm(&self, args: &[&str], context: &PluginContext) -> Result<PluginResult> {
        let mut cmd = Command::new(&self.helm_path);
        cmd.args(args);

        // Set kubeconfig
        if let Some(kubeconfig) = &context.kubeconfig_path {
            cmd.env("KUBECONFIG", kubeconfig);
        }

        // Set context and namespace
        cmd.arg("--kube-context").arg(&context.kube_context);
        
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

    /// List helm releases
    pub async fn list_releases(&self, namespace: Option<&str>, context: &PluginContext) -> Result<Vec<HelmRelease>> {
        let mut args = vec!["list", "--output", "json"];
        
        if let Some(ns) = namespace {
            args.push("--namespace");
            args.push(ns);
        } else {
            args.push("--all-namespaces");
        }

        let result = self.exec_helm(&args, context).await?;

        if !result.is_success() {
            return Err(Error::Plugin(PluginError::ExecutionFailed(result.stderr)));
        }

        let releases: Vec<HelmRelease> = serde_json::from_str(&result.stdout)
            .map_err(|e| Error::Plugin(PluginError::ExecutionFailed(
                format!("Failed to parse helm output: {e}")
            )))?;

        Ok(releases)
    }

    /// Get release history
    pub async fn get_history(&self, name: &str, namespace: &str, context: &PluginContext) -> Result<Vec<HelmRevision>> {
        let result = self.exec_helm(
            &["history", name, "--namespace", namespace, "--output", "json"],
            context,
        ).await?;

        if !result.is_success() {
            return Err(Error::Plugin(PluginError::ExecutionFailed(result.stderr)));
        }

        let history: Vec<HelmRevision> = serde_json::from_str(&result.stdout)
            .map_err(|e| Error::Plugin(PluginError::ExecutionFailed(
                format!("Failed to parse helm history: {e}")
            )))?;

        Ok(history)
    }

    /// Get release values
    pub async fn get_values(&self, name: &str, namespace: &str, context: &PluginContext) -> Result<String> {
        let result = self.exec_helm(
            &["get", "values", name, "--namespace", namespace, "--all"],
            context,
        ).await?;

        if !result.is_success() {
            return Err(Error::Plugin(PluginError::ExecutionFailed(result.stderr)));
        }

        Ok(result.stdout)
    }

    /// Upgrade release
    pub async fn upgrade(
        &self,
        name: &str,
        chart: &str,
        namespace: &str,
        values: Option<&str>,
        context: &PluginContext,
    ) -> Result<PluginResult> {
        let mut args = vec!["upgrade", name, chart, "--namespace", namespace, "--install"];

        if let Some(values_file) = values {
            args.push("--values");
            args.push(values_file);
        }

        self.exec_helm(&args, context).await
    }

    /// Rollback release
    pub async fn rollback(
        &self,
        name: &str,
        revision: &str,
        namespace: &str,
        context: &PluginContext,
    ) -> Result<PluginResult> {
        self.exec_helm(
            &["rollback", name, revision, "--namespace", namespace],
            context,
        ).await
    }

    /// Uninstall release
    pub async fn uninstall(&self, name: &str, namespace: &str, context: &PluginContext) -> Result<PluginResult> {
        self.exec_helm(
            &["uninstall", name, "--namespace", namespace],
            context,
        ).await
    }

    /// Get release manifest
    pub async fn get_manifest(&self, name: &str, namespace: &str, context: &PluginContext) -> Result<String> {
        let result = self.exec_helm(
            &["get", "manifest", name, "--namespace", namespace],
            context,
        ).await?;

        if !result.is_success() {
            return Err(Error::Plugin(PluginError::ExecutionFailed(result.stderr)));
        }

        Ok(result.stdout)
    }

    /// Get release notes
    pub async fn get_notes(&self, name: &str, namespace: &str, context: &PluginContext) -> Result<String> {
        let result = self.exec_helm(
            &["get", "notes", name, "--namespace", namespace],
            context,
        ).await?;

        if !result.is_success() {
            return Err(Error::Plugin(PluginError::ExecutionFailed(result.stderr)));
        }

        Ok(result.stdout)
    }
}

impl Default for HelmPlugin {
    fn default() -> Self {
        Self::new()
    }
}

/// Helm revision information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelmRevision {
    pub revision: i32,
    pub updated: String,
    pub status: String,
    pub chart: String,
    pub app_version: String,
    pub description: String,
}

#[async_trait]
impl PluginCommand for HelmPlugin {
    fn name(&self) -> &'static str {
        "helm"
    }

    fn description(&self) -> &'static str {
        "Helm release management"
    }

    fn usage(&self) -> &'static str {
        "helm [list|history|values|upgrade|rollback|uninstall] [options]"
    }

    async fn execute(&self, args: &[String], context: &PluginContext) -> Result<PluginResult> {
        if args.is_empty() {
            return Ok(PluginResult::error("No command specified".to_string()));
        }

        let command = &args[0];
        let remaining_args: Vec<&str> = args[1..].iter().map(std::string::String::as_str).collect();

        self.exec_helm(&[command.as_str()].into_iter().chain(remaining_args).collect::<Vec<_>>(), context).await
    }
}

#[async_trait]
impl ContextMenuExtension for HelmPlugin {
    fn name(&self) -> &'static str {
        "helm"
    }

    fn supported_kinds(&self) -> Vec<String> {
        // Helm plugin provides context menu for any resource that might be part of a Helm release
        vec![
            "Deployment".to_string(),
            "Service".to_string(),
            "ConfigMap".to_string(),
            "Secret".to_string(),
            "StatefulSet".to_string(),
            "DaemonSet".to_string(),
        ]
    }

    async fn get_menu_items(&self, resource: &GenericResource) -> Result<Vec<ContextMenuItem>> {
        // Check if resource has helm labels
        let has_helm_label = resource
            .metadata
            .labels
            .get("app.kubernetes.io/managed-by")
            .is_some_and(|v| v == "Helm");

        if !has_helm_label {
            return Ok(vec![]);
        }

        let release_name = resource
            .metadata
            .labels
            .get("app.kubernetes.io/instance")
            .cloned()
            .unwrap_or_default();

        Ok(vec![
            ContextMenuItem::new("helm-values", &format!("View Helm Values ({release_name})"))
                .with_icon("settings"),
            ContextMenuItem::new("helm-history", "View Helm History")
                .with_icon("history"),
            ContextMenuItem::new("helm-rollback", "Rollback Helm Release")
                .with_icon("undo")
                .dangerous(),
            ContextMenuItem::new("helm-uninstall", "Uninstall Helm Release")
                .with_icon("trash")
                .dangerous(),
        ])
    }

    async fn execute_action(
        &self,
        action_id: &str,
        resource: &GenericResource,
        context: &PluginContext,
    ) -> Result<PluginResult> {
        let release_name = resource
            .metadata
            .labels
            .get("app.kubernetes.io/instance")
            .ok_or_else(|| Error::Plugin(PluginError::ExecutionFailed(
                "Resource is not managed by Helm".to_string()
            )))?;

        let namespace = resource
            .metadata
            .namespace
            .as_ref()
            .ok_or_else(|| Error::Plugin(PluginError::ExecutionFailed(
                "Resource has no namespace".to_string()
            )))?;

        match action_id {
            "helm-values" => {
                let values = self.get_values(release_name, namespace, context).await?;
                Ok(PluginResult::success(values))
            }
            "helm-history" => {
                let history = self.get_history(release_name, namespace, context).await?;
                let json = serde_json::to_string_pretty(&history)?;
                Ok(PluginResult::success(json).with_data(serde_json::to_value(&history)?))
            }
            "helm-rollback" => {
                // Rollback to previous revision
                self.rollback(release_name, "0", namespace, context).await
            }
            "helm-uninstall" => {
                self.uninstall(release_name, namespace, context).await
            }
            _ => Err(Error::Plugin(PluginError::ExecutionFailed(
                format!("Unknown action: {action_id}")
            ))),
        }
    }
}

/// Helm release renderer for displaying release information
pub struct HelmReleaseRenderer;

#[async_trait]
impl ResourceRenderer for HelmReleaseRenderer {
    fn name(&self) -> &'static str {
        "helm-release"
    }

    fn supported_resources(&self) -> Vec<(String, String)> {
        vec![
            ("helm.sh".to_string(), "Release".to_string()),
        ]
    }

    fn can_render(&self, api_version: &str, kind: &str) -> bool {
        api_version.contains("helm") && kind == "Release"
    }

    async fn render(&self, resource: &GenericResource) -> Result<RenderedResource> {
        let spec = &resource.spec;
        
        let chart_name = spec.get("chart")
            .and_then(|c| c.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("unknown");

        let chart_version = spec.get("chart")
            .and_then(|c| c.get("version"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        Ok(RenderedResource {
            title: format!("Helm Release: {}", resource.metadata.name),
            summary: vec![
                ResourceField {
                    label: "Name".to_string(),
                    value: resource.metadata.name.clone(),
                    value_type: FieldValueType::Text,
                },
                ResourceField {
                    label: "Namespace".to_string(),
                    value: resource.metadata.namespace.clone().unwrap_or_default(),
                    value_type: FieldValueType::Badge,
                },
                ResourceField {
                    label: "Chart".to_string(),
                    value: format!("{chart_name}:{chart_version}"),
                    value_type: FieldValueType::Code,
                },
            ],
            sections: vec![
                ResourceSection {
                    title: "Chart Information".to_string(),
                    fields: vec![
                        ResourceField {
                            label: "Chart Name".to_string(),
                            value: chart_name.to_string(),
                            value_type: FieldValueType::Text,
                        },
                        ResourceField {
                            label: "Version".to_string(),
                            value: chart_version.to_string(),
                            value_type: FieldValueType::Badge,
                        },
                    ],
                    collapsed: false,
                },
            ],
            actions: vec![
                ResourceAction {
                    id: "upgrade".to_string(),
                    label: "Upgrade".to_string(),
                    icon: Some("arrow-up".to_string()),
                    primary: true,
                    dangerous: false,
                },
                ResourceAction {
                    id: "rollback".to_string(),
                    label: "Rollback".to_string(),
                    icon: Some("undo".to_string()),
                    primary: false,
                    dangerous: true,
                },
                ResourceAction {
                    id: "uninstall".to_string(),
                    label: "Uninstall".to_string(),
                    icon: Some("trash".to_string()),
                    primary: false,
                    dangerous: true,
                },
            ],
            custom_html: None,
        })
    }

    async fn get_actions(&self, _resource: &GenericResource) -> Result<Vec<ResourceAction>> {
        Ok(vec![
            ResourceAction {
                id: "view-values".to_string(),
                label: "View Values".to_string(),
                icon: Some("code".to_string()),
                primary: false,
                dangerous: false,
            },
            ResourceAction {
                id: "view-manifest".to_string(),
                label: "View Manifest".to_string(),
                icon: Some("file-code".to_string()),
                primary: false,
                dangerous: false,
            },
        ])
    }
}

/// Get plugin info for Helm
#[must_use] 
pub fn helm_plugin_info() -> PluginInfo {
    PluginInfo {
        name: "helm".to_string(),
        plugin_type: PluginType::Helm,
        version: "1.0.0".to_string(),
        description: "Helm release management integration".to_string(),
        author: Some("K8s GUI".to_string()),
        path: None,
        enabled: true,
        supported_resources: vec![
            "Deployment".to_string(),
            "Service".to_string(),
            "ConfigMap".to_string(),
            "StatefulSet".to_string(),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_helm_plugin_creation() {
        let plugin = HelmPlugin::new();
        assert_eq!(plugin.name(), "helm");
    }

    #[test]
    fn test_helm_release_deserialize() {
        let json = r#"[
            {
                "name": "nginx",
                "namespace": "default",
                "revision": "1",
                "updated": "2024-01-01 00:00:00",
                "status": "deployed",
                "chart": "nginx-1.0.0",
                "app_version": "1.25.0"
            }
        ]"#;

        let releases: Vec<HelmRelease> = serde_json::from_str(json).unwrap();
        assert_eq!(releases.len(), 1);
        assert_eq!(releases[0].name, "nginx");
    }
}
