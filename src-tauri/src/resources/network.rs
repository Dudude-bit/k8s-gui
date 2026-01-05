//! Network resource types

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
