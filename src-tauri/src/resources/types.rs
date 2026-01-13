//! Resource type definitions for frontend communication

use chrono::{DateTime, Utc};
use k8s_openapi::api::apps::v1::Deployment;
use k8s_openapi::api::core::v1::{
    ConfigMap, Container, EnvVar, EnvVarSource as K8sEnvVarSource, Event, Namespace, Node,
    NodeCondition, Pod, PodCondition, PodStatus, Secret, Service,
};
use k8s_openapi::apimachinery::pkg::api::resource::Quantity;
use kube::ResourceExt;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::resources::serialization::OwnerReference;
use crate::utils::{format_cpu, parse_cpu, parse_memory};

/// Extract owner references from Kubernetes metadata
pub fn extract_owner_references(
    owner_refs: Option<&Vec<k8s_openapi::apimachinery::pkg::apis::meta::v1::OwnerReference>>,
) -> Vec<OwnerReference> {
    owner_refs
        .map(|refs| {
            refs.iter()
                .map(|r| OwnerReference {
                    api_version: r.api_version.clone(),
                    kind: r.kind.clone(),
                    name: r.name.clone(),
                    uid: r.uid.clone(),
                    controller: r.controller,
                    block_owner_deletion: r.block_owner_deletion,
                })
                .collect()
        })
        .unwrap_or_default()
}

// ============= Environment Variable Types =============

/// Environment variable information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVarInfo {
    pub name: String,
    pub value: Option<String>,
    pub value_from: Option<EnvVarSourceInfo>,
}

/// Environment variable source reference
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVarSourceInfo {
    pub source_type: EnvVarSourceType,
    pub name: Option<String>,
    pub key: Option<String>,
    pub field_path: Option<String>,
    pub resource: Option<String>,
    pub optional: Option<bool>,
}

/// Environment variable source type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EnvVarSourceType {
    ConfigMapKeyRef,
    SecretKeyRef,
    FieldRef,
    ResourceFieldRef,
}

/// EnvFrom source reference (bulk import from ConfigMap/Secret)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvFromInfo {
    pub prefix: Option<String>,
    pub config_map_ref: Option<String>,
    pub secret_ref: Option<String>,
    pub optional: Option<bool>,
}

impl From<&EnvVar> for EnvVarInfo {
    fn from(env: &EnvVar) -> Self {
        Self {
            name: env.name.clone(),
            value: env.value.clone(),
            value_from: env.value_from.as_ref().map(EnvVarSourceInfo::from),
        }
    }
}

impl From<&K8sEnvVarSource> for EnvVarSourceInfo {
    fn from(source: &K8sEnvVarSource) -> Self {
        if let Some(cm_ref) = &source.config_map_key_ref {
            return Self {
                source_type: EnvVarSourceType::ConfigMapKeyRef,
                name: Some(cm_ref.name.clone()),
                key: Some(cm_ref.key.clone()),
                field_path: None,
                resource: None,
                optional: cm_ref.optional,
            };
        }
        if let Some(secret_ref) = &source.secret_key_ref {
            return Self {
                source_type: EnvVarSourceType::SecretKeyRef,
                name: Some(secret_ref.name.clone()),
                key: Some(secret_ref.key.clone()),
                field_path: None,
                resource: None,
                optional: secret_ref.optional,
            };
        }
        if let Some(field_ref) = &source.field_ref {
            return Self {
                source_type: EnvVarSourceType::FieldRef,
                name: None,
                key: None,
                field_path: Some(field_ref.field_path.clone()),
                resource: None,
                optional: None,
            };
        }
        if let Some(resource_ref) = &source.resource_field_ref {
            return Self {
                source_type: EnvVarSourceType::ResourceFieldRef,
                name: resource_ref.container_name.clone(),
                key: None,
                field_path: None,
                resource: Some(resource_ref.resource.clone()),
                optional: None,
            };
        }
        // Fallback (shouldn't happen with valid K8s data)
        Self {
            source_type: EnvVarSourceType::FieldRef,
            name: None,
            key: None,
            field_path: None,
            resource: None,
            optional: None,
        }
    }
}

fn extract_env_vars(container: &Container) -> Vec<EnvVarInfo> {
    container
        .env
        .as_ref()
        .map(|envs| envs.iter().map(EnvVarInfo::from).collect())
        .unwrap_or_default()
}

fn extract_env_from(container: &Container) -> Vec<EnvFromInfo> {
    container
        .env_from
        .as_ref()
        .map(|env_froms| {
            env_froms
                .iter()
                .map(|ef| EnvFromInfo {
                    prefix: ef.prefix.clone(),
                    config_map_ref: ef.config_map_ref.as_ref().map(|r| r.name.clone()),
                    secret_ref: ef.secret_ref.as_ref().map(|r| r.name.clone()),
                    optional: ef
                        .config_map_ref
                        .as_ref()
                        .and_then(|r| r.optional)
                        .or_else(|| ef.secret_ref.as_ref().and_then(|r| r.optional)),
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Simplified pod information for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PodInfo {
    pub name: String,
    pub namespace: String,
    pub uid: String,
    pub status: PodStatusInfo,
    pub node_name: Option<String>,
    pub pod_ip: Option<String>,
    pub host_ip: Option<String>,
    pub containers: Vec<ContainerInfo>,
    pub labels: BTreeMap<String, String>,
    pub annotations: BTreeMap<String, String>,
    pub created_at: Option<DateTime<Utc>>,
    pub restart_count: i32,
    // Resource requests/limits (from spec)
    pub cpu_requests: Option<String>, // aggregated from all containers
    pub cpu_limits: Option<String>,   // aggregated from all containers
    pub memory_requests: Option<String>, // aggregated from all containers
    pub memory_limits: Option<String>, // aggregated from all containers
    // Owner references for related resources
    pub owner_references: Vec<OwnerReference>,
}

impl From<&Pod> for PodInfo {
    fn from(pod: &Pod) -> Self {
        let status = pod.status.as_ref();
        let spec = pod.spec.as_ref();

        let containers = spec
            .map(|s| {
                s.containers
                    .iter()
                    .map(|c| ContainerInfo::from_container(c, status))
                    .collect()
            })
            .unwrap_or_default();

        let restart_count = status
            .and_then(|s| s.container_statuses.as_ref())
            .map_or(0, |cs| cs.iter().map(|c| c.restart_count).sum());

        // Aggregate resource requests and limits from all containers
        let (cpu_requests, cpu_limits, memory_requests, memory_limits) =
            spec.map_or((None, None, None, None), |s| {
                let mut total_cpu_requests_millicores = 0.0f64;
                let mut total_cpu_limits_millicores = 0.0f64;
                let mut total_memory_requests_bytes = 0u64;
                let mut total_memory_limits_bytes = 0u64;

                for container in &s.containers {
                    if let Some(resources) = &container.resources {
                        if let Some(requests) = &resources.requests {
                            if let Some(cpu) = requests.get("cpu") {
                                total_cpu_requests_millicores += parse_cpu(&cpu.0);
                            }
                            if let Some(memory) = requests.get("memory") {
                                total_memory_requests_bytes += parse_memory(&memory.0);
                            }
                        }
                        if let Some(limits) = &resources.limits {
                            if let Some(cpu) = limits.get("cpu") {
                                total_cpu_limits_millicores += parse_cpu(&cpu.0);
                            }
                            if let Some(memory) = limits.get("memory") {
                                total_memory_limits_bytes += parse_memory(&memory.0);
                            }
                        }
                    }
                }

                // Format aggregated values
                let cpu_requests = if total_cpu_requests_millicores > 0.0 {
                    Some(format_cpu(total_cpu_requests_millicores))
                } else {
                    None
                };
                let cpu_limits = if total_cpu_limits_millicores > 0.0 {
                    Some(format_cpu(total_cpu_limits_millicores))
                } else {
                    None
                };
                let memory_requests = if total_memory_requests_bytes > 0 {
                    Some(format!("{total_memory_requests_bytes}"))
                } else {
                    None
                };
                let memory_limits = if total_memory_limits_bytes > 0 {
                    Some(format!("{total_memory_limits_bytes}"))
                } else {
                    None
                };

                (cpu_requests, cpu_limits, memory_requests, memory_limits)
            });

        Self {
            name: pod.name_any(),
            namespace: pod.namespace().unwrap_or_default(),
            uid: pod.uid().unwrap_or_default(),
            status: PodStatusInfo::from_pod_status(status),
            node_name: spec.and_then(|s| s.node_name.clone()),
            pod_ip: status.and_then(|s| s.pod_ip.clone()),
            host_ip: status.and_then(|s| s.host_ip.clone()),
            containers,
            labels: pod.labels().clone(),
            annotations: pod.annotations().clone(),
            created_at: pod.creation_timestamp().map(|t| t.0),
            restart_count,
            cpu_requests,
            cpu_limits,
            memory_requests,
            memory_limits,
            owner_references: extract_owner_references(pod.metadata.owner_references.as_ref()),
        }
    }
}


/// Pod status information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PodStatusInfo {
    pub phase: String,
    pub ready: bool,
    pub conditions: Vec<ConditionInfo>,
    pub message: Option<String>,
    pub reason: Option<String>,
}

impl PodStatusInfo {
    fn from_pod_status(status: Option<&PodStatus>) -> Self {
        let status = match status {
            Some(s) => s,
            None => {
                return Self {
                    phase: "Unknown".to_string(),
                    ready: false,
                    conditions: vec![],
                    message: None,
                    reason: None,
                }
            }
        };

        let ready = status.conditions.as_ref().is_some_and(|conds| {
            conds
                .iter()
                .any(|c| c.type_ == "Ready" && c.status == "True")
        });

        let conditions = status
            .conditions
            .as_ref()
            .map(|conds| conds.iter().map(ConditionInfo::from).collect())
            .unwrap_or_default();

        Self {
            phase: status
                .phase
                .clone()
                .unwrap_or_else(|| "Unknown".to_string()),
            ready,
            conditions,
            message: status.message.clone(),
            reason: status.reason.clone(),
        }
    }
}

/// Condition information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionInfo {
    pub type_: String,
    pub status: String,
    pub reason: Option<String>,
    pub message: Option<String>,
    pub last_transition_time: Option<DateTime<Utc>>,
}

impl From<&PodCondition> for ConditionInfo {
    fn from(cond: &PodCondition) -> Self {
        Self {
            type_: cond.type_.clone(),
            status: cond.status.clone(),
            reason: cond.reason.clone(),
            message: cond.message.clone(),
            last_transition_time: cond.last_transition_time.as_ref().map(|t| t.0),
        }
    }
}

impl From<&NodeCondition> for ConditionInfo {
    fn from(cond: &NodeCondition) -> Self {
        Self {
            type_: cond.type_.clone(),
            status: cond.status.clone(),
            reason: cond.reason.clone(),
            message: cond.message.clone(),
            last_transition_time: cond.last_transition_time.as_ref().map(|t| t.0),
        }
    }
}

/// Container information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerInfo {
    pub name: String,
    pub image: String,
    pub ready: bool,
    pub state: ContainerState,
    pub restart_count: i32,
    pub ports: Vec<ContainerPortInfo>,
    pub env: Vec<EnvVarInfo>,
    pub env_from: Vec<EnvFromInfo>,
}

impl ContainerInfo {
    pub fn from_container(container: &Container, pod_status: Option<&PodStatus>) -> Self {
        let container_status = pod_status
            .and_then(|s| s.container_statuses.as_ref())
            .and_then(|cs| cs.iter().find(|c| c.name == container.name));

        let (ready, state, restart_count) = if let Some(cs) = container_status {
            let state = if cs.state.as_ref().and_then(|s| s.running.as_ref()).is_some() {
                ContainerState::Running
            } else if let Some(waiting) = cs.state.as_ref().and_then(|s| s.waiting.as_ref()) {
                ContainerState::Waiting {
                    reason: waiting.reason.clone(),
                }
            } else if let Some(terminated) = cs.state.as_ref().and_then(|s| s.terminated.as_ref()) {
                ContainerState::Terminated {
                    exit_code: terminated.exit_code,
                    reason: terminated.reason.clone(),
                }
            } else {
                ContainerState::Unknown
            };

            (cs.ready, state, cs.restart_count)
        } else {
            (false, ContainerState::Unknown, 0)
        };

        let ports = container
            .ports
            .as_ref()
            .map(|ps| {
                ps.iter()
                    .map(|p| ContainerPortInfo {
                        name: p.name.clone(),
                        container_port: p.container_port,
                        protocol: p.protocol.clone().unwrap_or_else(|| "TCP".to_string()),
                    })
                    .collect()
            })
            .unwrap_or_default();

        Self {
            name: container.name.clone(),
            image: container.image.clone().unwrap_or_default(),
            ready,
            state,
            restart_count,
            ports,
            env: extract_env_vars(container),
            env_from: extract_env_from(container),
        }
    }
}

/// Container state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ContainerState {
    Running,
    Waiting {
        reason: Option<String>,
    },
    Terminated {
        exit_code: i32,
        reason: Option<String>,
    },
    Unknown,
}

/// Container port information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerPortInfo {
    pub name: Option<String>,
    pub container_port: i32,
    pub protocol: String,
}

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
    // Owner references for related resources
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
            owner_references: extract_owner_references(deployment.metadata.owner_references.as_ref()),
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

/// Service information for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceInfo {
    pub name: String,
    pub namespace: String,
    pub uid: String,
    pub type_: String,
    pub session_affinity: String,
    pub cluster_ip: Option<String>,
    pub external_ips: Vec<String>,
    pub ports: Vec<ServicePortInfo>,
    pub selector: BTreeMap<String, String>,
    pub labels: BTreeMap<String, String>,
    pub annotations: BTreeMap<String, String>,
    pub created_at: Option<DateTime<Utc>>,
}

/// Service port information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServicePortInfo {
    pub name: Option<String>,
    pub port: i32,
    pub target_port: String,
    pub node_port: Option<i32>,
    pub protocol: String,
}

impl From<&Service> for ServiceInfo {
    fn from(service: &Service) -> Self {
        let spec = service.spec.as_ref();

        let ports = spec
            .and_then(|s| s.ports.as_ref())
            .map(|ps| {
                ps.iter()
                    .map(|p| ServicePortInfo {
                        name: p.name.clone(),
                        port: p.port,
                        target_port: p
                            .target_port
                            .as_ref()
                            .map(|tp| match tp {
                                k8s_openapi::apimachinery::pkg::util::intstr::IntOrString::Int(i) => {
                                    i.to_string()
                                }
                                k8s_openapi::apimachinery::pkg::util::intstr::IntOrString::String(s) => {
                                    s.clone()
                                }
                            })
                            .unwrap_or_default(),
                        node_port: p.node_port,
                        protocol: p.protocol.clone().unwrap_or_else(|| "TCP".to_string()),
                    })
                    .collect()
            })
            .unwrap_or_default();

        Self {
            name: service.name_any(),
            namespace: service.namespace().unwrap_or_default(),
            uid: service.uid().unwrap_or_default(),
            type_: spec
                .and_then(|s| s.type_.clone())
                .unwrap_or_else(|| "ClusterIP".to_string()),
            session_affinity: spec
                .and_then(|s| s.session_affinity.clone())
                .unwrap_or_else(|| "None".to_string()),
            cluster_ip: spec.and_then(|s| s.cluster_ip.clone()),
            external_ips: spec
                .and_then(|s| s.external_ips.clone())
                .unwrap_or_default(),
            ports,
            selector: spec.and_then(|s| s.selector.clone()).unwrap_or_default(),
            labels: service.labels().clone(),
            annotations: service.annotations().clone(),
            created_at: service.creation_timestamp().map(|t| t.0),
        }
    }
}

/// Node information for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeInfo {
    pub name: String,
    pub uid: String,
    pub status: NodeStatusInfo,
    pub roles: Vec<String>,
    pub version: String,
    pub os: String,
    pub arch: String,
    pub container_runtime: String,
    pub labels: BTreeMap<String, String>,
    pub taints: Vec<TaintInfo>,
    pub capacity: ResourceQuantities,
    pub allocatable: ResourceQuantities,
    pub created_at: Option<DateTime<Utc>>,
}

/// Node status information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeStatusInfo {
    pub ready: bool,
    pub conditions: Vec<ConditionInfo>,
    pub addresses: Vec<NodeAddressInfo>,
}

/// Node address information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeAddressInfo {
    pub type_: String,
    pub address: String,
}

/// Taint information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaintInfo {
    pub key: String,
    pub value: Option<String>,
    pub effect: String,
}

/// Resource quantities
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResourceQuantities {
    pub cpu: Option<String>,
    pub memory: Option<String>,
    pub pods: Option<String>,
    pub ephemeral_storage: Option<String>,
}

impl From<&Node> for NodeInfo {
    fn from(node: &Node) -> Self {
        let status = node.status.as_ref();
        let spec = node.spec.as_ref();

        let node_info = status.and_then(|s| s.node_info.as_ref());

        let ready = status
            .and_then(|s| s.conditions.as_ref())
            .is_some_and(|conds| {
                conds
                    .iter()
                    .any(|c| c.type_ == "Ready" && c.status == "True")
            });

        let conditions = status
            .and_then(|s| s.conditions.as_ref())
            .map(|conds| conds.iter().map(ConditionInfo::from).collect())
            .unwrap_or_default();

        let addresses = status
            .and_then(|s| s.addresses.as_ref())
            .map(|addrs| {
                addrs
                    .iter()
                    .map(|a| NodeAddressInfo {
                        type_: a.type_.clone(),
                        address: a.address.clone(),
                    })
                    .collect()
            })
            .unwrap_or_default();

        let roles: Vec<String> = node
            .labels()
            .iter()
            .filter_map(|(k, _)| {
                if k.starts_with("node-role.kubernetes.io/") {
                    Some(k.trim_start_matches("node-role.kubernetes.io/").to_string())
                } else {
                    None
                }
            })
            .collect();

        let taints = spec
            .and_then(|s| s.taints.as_ref())
            .map(|ts| {
                ts.iter()
                    .map(|t| TaintInfo {
                        key: t.key.clone(),
                        value: t.value.clone(),
                        effect: t.effect.clone(),
                    })
                    .collect()
            })
            .unwrap_or_default();

        let capacity = status
            .and_then(|s| s.capacity.as_ref())
            .map(|c| ResourceQuantities {
                cpu: c.get("cpu").map(|q| q.0.clone()),
                memory: c.get("memory").map(|q| q.0.clone()),
                pods: c.get("pods").map(|q| q.0.clone()),
                ephemeral_storage: c.get("ephemeral-storage").map(|q| q.0.clone()),
            })
            .unwrap_or_default();

        let allocatable = status
            .and_then(|s| s.allocatable.as_ref())
            .map(|a| ResourceQuantities {
                cpu: a.get("cpu").map(|q| q.0.clone()),
                memory: a.get("memory").map(|q| q.0.clone()),
                pods: a.get("pods").map(|q| q.0.clone()),
                ephemeral_storage: a.get("ephemeral-storage").map(|q| q.0.clone()),
            })
            .unwrap_or_default();

        Self {
            name: node.name_any(),
            uid: node.uid().unwrap_or_default(),
            status: NodeStatusInfo {
                ready,
                conditions,
                addresses,
            },
            roles,
            version: node_info
                .map(|ni| ni.kubelet_version.clone())
                .unwrap_or_default(),
            os: node_info.map(|ni| ni.os_image.clone()).unwrap_or_default(),
            arch: node_info
                .map(|ni| ni.architecture.clone())
                .unwrap_or_default(),
            container_runtime: node_info
                .map(|ni| ni.container_runtime_version.clone())
                .unwrap_or_default(),
            labels: node.labels().clone(),
            taints,
            capacity,
            allocatable,
            created_at: node.creation_timestamp().map(|t| t.0),
        }
    }
}

/// Namespace information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamespaceInfo {
    pub name: String,
    pub uid: String,
    pub status: String,
    pub labels: BTreeMap<String, String>,
    pub created_at: Option<DateTime<Utc>>,
}

impl From<&Namespace> for NamespaceInfo {
    fn from(ns: &Namespace) -> Self {
        Self {
            name: ns.name_any(),
            uid: ns.uid().unwrap_or_default(),
            status: ns
                .status
                .as_ref()
                .and_then(|s| s.phase.clone())
                .unwrap_or_else(|| "Active".to_string()),
            labels: ns.labels().clone(),
            created_at: ns.creation_timestamp().map(|t| t.0),
        }
    }
}

/// `ConfigMap` information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigMapInfo {
    pub name: String,
    pub namespace: String,
    pub uid: String,
    pub data_keys: Vec<String>,
    pub labels: BTreeMap<String, String>,
    pub annotations: BTreeMap<String, String>,
    pub created_at: Option<DateTime<Utc>>,
}

impl From<&ConfigMap> for ConfigMapInfo {
    fn from(cm: &ConfigMap) -> Self {
        Self {
            name: cm.name_any(),
            namespace: cm.namespace().unwrap_or_default(),
            uid: cm.uid().unwrap_or_default(),
            data_keys: cm
                .data
                .as_ref()
                .map(|d| d.keys().cloned().collect())
                .unwrap_or_default(),
            labels: cm.labels().clone(),
            annotations: cm.annotations().clone(),
            created_at: cm.creation_timestamp().map(|t| t.0),
        }
    }
}

/// Secret information (without sensitive data)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretInfo {
    pub name: String,
    pub namespace: String,
    pub uid: String,
    pub type_: String,
    pub data_keys: Vec<String>,
    pub labels: BTreeMap<String, String>,
    pub annotations: BTreeMap<String, String>,
    pub created_at: Option<DateTime<Utc>>,
}

impl From<&Secret> for SecretInfo {
    fn from(secret: &Secret) -> Self {
        Self {
            name: secret.name_any(),
            namespace: secret.namespace().unwrap_or_default(),
            uid: secret.uid().unwrap_or_default(),
            type_: secret.type_.clone().unwrap_or_else(|| "Opaque".to_string()),
            data_keys: secret
                .data
                .as_ref()
                .map(|d| d.keys().cloned().collect())
                .unwrap_or_default(),
            labels: secret.labels().clone(),
            annotations: secret.annotations().clone(),
            created_at: secret.creation_timestamp().map(|t| t.0),
        }
    }
}

/// Event information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventInfo {
    pub name: String,
    pub namespace: String,
    pub uid: String,
    pub type_: String,
    pub reason: Option<String>,
    pub message: Option<String>,
    pub source: Option<String>,
    pub involved_object: InvolvedObjectInfo,
    pub count: Option<i32>,
    pub first_timestamp: Option<DateTime<Utc>>,
    pub last_timestamp: Option<DateTime<Utc>>,
}

/// Involved object information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvolvedObjectInfo {
    pub kind: String,
    pub name: String,
    pub namespace: Option<String>,
    pub uid: Option<String>,
}

impl From<&Event> for EventInfo {
    fn from(event: &Event) -> Self {
        Self {
            name: event.name_any(),
            namespace: event.namespace().unwrap_or_default(),
            uid: event.uid().unwrap_or_default(),
            type_: event.type_.clone().unwrap_or_default(),
            reason: event.reason.clone(),
            message: event.message.clone(),
            source: event.source.as_ref().and_then(|s| s.component.clone()),
            involved_object: InvolvedObjectInfo {
                kind: event.involved_object.kind.clone().unwrap_or_default(),
                name: event.involved_object.name.clone().unwrap_or_default(),
                namespace: event.involved_object.namespace.clone(),
                uid: event.involved_object.uid.clone(),
            },
            count: event.count,
            first_timestamp: event.first_timestamp.as_ref().map(|t| t.0),
            last_timestamp: event.last_timestamp.as_ref().map(|t| t.0),
        }
    }
}
