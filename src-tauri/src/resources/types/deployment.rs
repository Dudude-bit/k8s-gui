//! Deployment-specific types: `DeploymentInfo`, `DeploymentContainerInfo`,
//! `DeploymentContainerResources`, `ReplicaInfo`.

use chrono::{DateTime, Utc};
use k8s_openapi::api::apps::v1::Deployment;
use k8s_openapi::api::core::v1::Container;
use k8s_openapi::apimachinery::pkg::api::resource::Quantity;
use kube::ResourceExt;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::resources::serialization::OwnerReference;

use super::common::{
    extract_env_from, extract_env_vars, extract_owner_references, ConditionInfo, EnvFromInfo,
    EnvVarInfo,
};

/// Deployment information for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentInfo {
    pub name: String,
    pub namespace: String,
    pub uid: String,
    pub replicas: ReplicaInfo,
    pub strategy: Option<String>,
    pub containers: Vec<DeploymentContainerInfo>,
    pub labels: BTreeMap<String, String>,
    pub annotations: BTreeMap<String, String>,
    pub created_at: Option<DateTime<Utc>>,
    pub conditions: Vec<ConditionInfo>,
    pub owner_references: Vec<OwnerReference>,
}

/// Deployment container specification for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentContainerInfo {
    pub name: String,
    pub image: String,
    pub ports: Vec<i32>,
    pub resources: DeploymentContainerResources,
    pub env: Vec<EnvVarInfo>,
    pub env_from: Vec<EnvFromInfo>,
}

/// Container resource requests/limits
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentContainerResources {
    pub requests: BTreeMap<String, String>,
    pub limits: BTreeMap<String, String>,
}

/// Replica information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplicaInfo {
    pub desired: i32,
    pub ready: i32,
    pub available: i32,
    pub updated: i32,
}

impl From<&Deployment> for DeploymentInfo {
    fn from(deployment: &Deployment) -> Self {
        let status = deployment.status.as_ref();
        let spec = deployment.spec.as_ref();

        let replicas = ReplicaInfo {
            desired: spec.and_then(|s| s.replicas).unwrap_or(0),
            ready: status.and_then(|s| s.ready_replicas).unwrap_or(0),
            available: status.and_then(|s| s.available_replicas).unwrap_or(0),
            updated: status.and_then(|s| s.updated_replicas).unwrap_or(0),
        };

        let conditions = status
            .and_then(|s| s.conditions.as_ref())
            .map(|conds| {
                conds
                    .iter()
                    .map(|c| ConditionInfo {
                        type_: c.type_.clone(),
                        status: c.status.clone(),
                        reason: c.reason.clone(),
                        message: c.message.clone(),
                        last_transition_time: c.last_transition_time.as_ref().map(|t| t.0),
                    })
                    .collect()
            })
            .unwrap_or_default();

        let containers = spec
            .and_then(|s| s.template.spec.as_ref())
            .map(|s| {
                s.containers
                    .iter()
                    .map(DeploymentContainerInfo::from)
                    .collect()
            })
            .unwrap_or_default();

        Self {
            name: deployment.name_any(),
            namespace: deployment.namespace().unwrap_or_default(),
            uid: deployment.uid().unwrap_or_default(),
            replicas,
            strategy: spec
                .and_then(|s| s.strategy.as_ref())
                .and_then(|s| s.type_.clone()),
            containers,
            labels: deployment.labels().clone(),
            annotations: deployment.annotations().clone(),
            created_at: deployment.creation_timestamp().map(|t| t.0),
            conditions,
            owner_references: extract_owner_references(
                deployment.metadata.owner_references.as_ref(),
            ),
        }
    }
}

impl From<&Container> for DeploymentContainerInfo {
    fn from(container: &Container) -> Self {
        let ports = container
            .ports
            .as_ref()
            .map(|ports| ports.iter().map(|p| p.container_port).collect())
            .unwrap_or_default();

        let resources = DeploymentContainerResources {
            requests: map_quantities(
                container
                    .resources
                    .as_ref()
                    .and_then(|r| r.requests.as_ref()),
            ),
            limits: map_quantities(container.resources.as_ref().and_then(|r| r.limits.as_ref())),
        };

        Self {
            name: container.name.clone(),
            image: container.image.clone().unwrap_or_default(),
            ports,
            resources,
            env: extract_env_vars(container),
            env_from: extract_env_from(container),
        }
    }
}

fn map_quantities(input: Option<&BTreeMap<String, Quantity>>) -> BTreeMap<String, String> {
    input
        .map(|values| {
            values
                .iter()
                .map(|(key, value)| (key.clone(), value.0.clone()))
                .collect()
        })
        .unwrap_or_default()
}
