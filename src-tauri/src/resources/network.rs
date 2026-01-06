//! Network resource types

use crate::utils::format_k8s_age;
use k8s_openapi::api::core::v1::Endpoints;
use k8s_openapi::api::networking::v1::Ingress;
use kube::ResourceExt;
use serde::{Deserialize, Serialize};

/// Information about an Ingress rule path
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngressPath {
    pub path: String,
    pub path_type: String,
    pub backend_service: String,
    pub backend_port: String,
}

/// Information about an Ingress rule
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngressRule {
    pub host: String,
    pub paths: Vec<IngressPath>,
}

/// Information about an Ingress
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngressInfo {
    pub name: String,
    pub namespace: String,
    pub class_name: Option<String>,
    pub rules: Vec<IngressRule>,
    pub load_balancer_ips: Vec<String>,
    pub tls_hosts: Vec<String>,
    pub age: String,
}

impl From<&Ingress> for IngressInfo {
    fn from(ingress: &Ingress) -> Self {
        let spec = ingress.spec.as_ref();
        let status = ingress.status.as_ref();

        // Parse rules
        let rules = spec
            .and_then(|s| s.rules.as_ref())
            .map(|spec_rules| {
                spec_rules
                    .iter()
                    .map(|rule| {
                        let host = rule.host.clone().unwrap_or_else(|| "*".to_string());
                        let paths = rule
                            .http
                            .as_ref()
                            .map(|http| {
                                http.paths
                                    .iter()
                                    .map(|path| {
                                        let backend_service =
                                            path.backend.service.as_ref().map_or_else(
                                                || "unknown".to_string(),
                                                |s| s.name.clone(),
                                            );

                                        let backend_port = path
                                            .backend
                                            .service
                                            .as_ref()
                                            .and_then(|s| s.port.as_ref())
                                            .map(|p| {
                                                p.name.clone().unwrap_or_else(|| {
                                                    p.number.map_or_else(
                                                        || "?".to_string(),
                                                        |n| n.to_string(),
                                                    )
                                                })
                                            })
                                            .unwrap_or_else(|| "?".to_string());

                                        IngressPath {
                                            path: path
                                                .path
                                                .clone()
                                                .unwrap_or_else(|| "/".to_string()),
                                            path_type: path.path_type.clone(),
                                            backend_service,
                                            backend_port,
                                        }
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();

                        IngressRule { host, paths }
                    })
                    .collect()
            })
            .unwrap_or_default();

        let load_balancer_ips = status
            .and_then(|s| s.load_balancer.as_ref())
            .and_then(|lb| lb.ingress.as_ref())
            .map(|ingresses| {
                ingresses
                    .iter()
                    .filter_map(|i| i.ip.clone().or_else(|| i.hostname.clone()))
                    .collect()
            })
            .unwrap_or_default();

        let tls_hosts = spec
            .and_then(|s| s.tls.as_ref())
            .map(|tls_list| {
                tls_list
                    .iter()
                    .flat_map(|tls| tls.hosts.clone().unwrap_or_default())
                    .collect()
            })
            .unwrap_or_default();

        Self {
            name: ingress.name_any(),
            namespace: ingress.namespace().unwrap_or_default(),
            class_name: spec.and_then(|s| s.ingress_class_name.clone()),
            rules,
            load_balancer_ips,
            tls_hosts,
            age: format_k8s_age(ingress.metadata.creation_timestamp.as_ref()),
        }
    }
}

/// Target reference for an endpoint address
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointTargetRef {
    pub kind: String,
    pub name: String,
    pub namespace: String,
}

/// Address in an endpoint subset
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointAddress {
    pub ip: String,
    pub hostname: Option<String>,
    pub node_name: Option<String>,
    pub target_ref: Option<EndpointTargetRef>,
}

/// Port in an endpoint subset
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointPort {
    pub name: Option<String>,
    pub port: i32,
    pub protocol: String,
}

/// Subset of endpoints
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointSubset {
    pub addresses: Vec<EndpointAddress>,
    pub not_ready_addresses: Vec<EndpointAddress>,
    pub ports: Vec<EndpointPort>,
}

/// Information about Endpoints
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointsInfo {
    pub name: String,
    pub namespace: String,
    pub subsets: Vec<EndpointSubset>,
    pub age: String,
}

impl From<&Endpoints> for EndpointsInfo {
    fn from(ep: &Endpoints) -> Self {
        let name = ep.name_any();
        let ns = ep.namespace().unwrap_or_default();
        let age = format_k8s_age(ep.metadata.creation_timestamp.as_ref());

        let subsets = ep
            .subsets
            .as_ref()
            .map(|s| s.clone()) // Endpoints subsets are already structured, but we need to map to our structs
            .unwrap_or_default()
            .into_iter()
            .map(|subset| {
                let addresses = subset
                    .addresses
                    .unwrap_or_default()
                    .iter()
                    .map(|addr| EndpointAddress {
                        ip: addr.ip.clone(),
                        hostname: addr.hostname.clone(),
                        node_name: addr.node_name.clone(),
                        target_ref: addr.target_ref.as_ref().map(|tr| EndpointTargetRef {
                            kind: tr.kind.clone().unwrap_or_default(),
                            name: tr.name.clone().unwrap_or_default(),
                            namespace: tr.namespace.clone().unwrap_or_default(),
                        }),
                    })
                    .collect();

                let not_ready_addresses = subset
                    .not_ready_addresses
                    .unwrap_or_default()
                    .iter()
                    .map(|addr| EndpointAddress {
                        ip: addr.ip.clone(),
                        hostname: addr.hostname.clone(),
                        node_name: addr.node_name.clone(),
                        target_ref: addr.target_ref.as_ref().map(|tr| EndpointTargetRef {
                            kind: tr.kind.clone().unwrap_or_default(),
                            name: tr.name.clone().unwrap_or_default(),
                            namespace: tr.namespace.clone().unwrap_or_default(),
                        }),
                    })
                    .collect();

                let ports = subset
                    .ports
                    .unwrap_or_default()
                    .iter()
                    .map(|port| EndpointPort {
                        name: port.name.clone(),
                        port: port.port,
                        protocol: port.protocol.clone().unwrap_or_else(|| "TCP".to_string()),
                    })
                    .collect();

                EndpointSubset {
                    addresses,
                    not_ready_addresses,
                    ports,
                }
            })
            .collect();

        Self {
            name,
            namespace: ns,
            subsets,
            age,
        }
    }
}
