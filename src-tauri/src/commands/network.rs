//! Network-related Tauri commands
//! 
//! Commands for managing Ingresses and Endpoints.

use crate::state::AppState;
use crate::utils::{format_k8s_age, normalize_namespace};
use k8s_openapi::api::core::v1::Endpoints;
use k8s_openapi::api::networking::v1::Ingress;
use kube::{Api, api::ListParams, ResourceExt};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Information about an Ingress rule path
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngressPath {
    pub path: String,
    pub path_type: String,
    pub backend_service: String,
    pub backend_port: String,
}

/// Information about an Ingress rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngressRule {
    pub host: String,
    pub paths: Vec<IngressPath>,
}

/// Information about an Ingress
#[derive(Debug, Clone, Serialize, Deserialize)]
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
pub struct EndpointTargetRef {
    pub kind: String,
    pub name: String,
    pub namespace: String,
}

/// Address in an endpoint subset
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointAddress {
    pub ip: String,
    pub hostname: Option<String>,
    pub node_name: Option<String>,
    pub target_ref: Option<EndpointTargetRef>,
}

/// Port in an endpoint subset
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointPort {
    pub name: Option<String>,
    pub port: i32,
    pub protocol: String,
}

/// Subset of endpoints
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointSubset {
    pub addresses: Vec<EndpointAddress>,
    pub not_ready_addresses: Vec<EndpointAddress>,
    pub ports: Vec<EndpointPort>,
}

/// Information about Endpoints
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointsInfo {
    pub name: String,
    pub namespace: String,
    pub subsets: Vec<EndpointSubset>,
    pub age: String,
}

/// List Ingresses
#[tauri::command]
pub async fn list_ingresses(
    state: State<'_, AppState>,
    namespace: Option<String>,
) -> Result<Vec<IngressInfo>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let ns = normalize_namespace(namespace, state.get_namespace(&context));
    
    let ingresses: Api<Ingress> = match ns {
        Some(ref namespace) => Api::namespaced((*client).clone(), namespace),
        None => Api::all((*client).clone()),
    };
    let ingress_list = ingresses.list(&ListParams::default()).await.map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for ingress in ingress_list {
        let spec = ingress.spec.as_ref();
        let status = ingress.status.as_ref();
        
        // Parse rules
        let mut rules = Vec::new();
        if let Some(spec_rules) = spec.and_then(|s| s.rules.as_ref()) {
            for rule in spec_rules {
                let host = rule.host.clone().unwrap_or_else(|| "*".to_string());
                let mut paths = Vec::new();
                
                if let Some(http) = &rule.http {
                    for path in &http.paths {
                        let backend_service = path.backend.service.as_ref()
                            .map(|s| s.name.clone())
                            .unwrap_or_else(|| "unknown".to_string());
                        
                        let backend_port = path.backend.service.as_ref()
                            .and_then(|s| s.port.as_ref())
                            .map(|p| {
                                p.name.clone().unwrap_or_else(|| {
                                    p.number.map(|n| n.to_string()).unwrap_or_else(|| "?".to_string())
                                })
                            })
                            .unwrap_or_else(|| "?".to_string());
                        
                        paths.push(IngressPath {
                            path: path.path.clone().unwrap_or_else(|| "/".to_string()),
                            path_type: path.path_type.clone(),
                            backend_service,
                            backend_port,
                        });
                    }
                }
                
                rules.push(IngressRule { host, paths });
            }
        }
        
        // Get load balancer IPs
        let load_balancer_ips = status
            .and_then(|s| s.load_balancer.as_ref())
            .and_then(|lb| lb.ingress.as_ref())
            .map(|ingresses| {
                ingresses.iter()
                    .filter_map(|i| i.ip.clone().or_else(|| i.hostname.clone()))
                    .collect()
            })
            .unwrap_or_default();
        
        // Get TLS hosts
        let tls_hosts = spec
            .and_then(|s| s.tls.as_ref())
            .map(|tls_list| {
                tls_list.iter()
                    .flat_map(|tls| tls.hosts.clone().unwrap_or_default())
                    .collect()
            })
            .unwrap_or_default();
        
        result.push(IngressInfo {
            name: ingress.name_any(),
            namespace: ingress.namespace().unwrap_or_default(),
            class_name: spec.and_then(|s| s.ingress_class_name.clone()),
            rules,
            load_balancer_ips,
            tls_hosts,
            age: format_k8s_age(ingress.metadata.creation_timestamp.as_ref()),
        });
    }
    
    Ok(result)
}

/// List Endpoints
#[tauri::command]
pub async fn list_endpoints(
    state: State<'_, AppState>,
    namespace: Option<String>,
) -> Result<Vec<EndpointsInfo>, String> {
    let context = state
        .get_current_context()
        .ok_or_else(|| "No cluster connected".to_string())?;

    let client = state
        .client_manager
        .get_client(&context)
        .ok_or_else(|| "Client not found".to_string())?;

    let ns = normalize_namespace(namespace, state.get_namespace(&context));
    
    let endpoints: Api<Endpoints> = match ns {
        Some(ref namespace) => Api::namespaced((*client).clone(), namespace),
        None => Api::all((*client).clone()),
    };
    let endpoints_list = endpoints.list(&ListParams::default()).await.map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for ep in endpoints_list {
        let mut subsets = Vec::new();
        
        // Extract metadata before consuming subsets
        let name = ep.name_any();
        let ns = ep.namespace().unwrap_or_default();
        let age = format_k8s_age(ep.metadata.creation_timestamp.as_ref());
        
        if let Some(ep_subsets) = ep.subsets {
            for subset in ep_subsets {
                // Parse addresses
                let addresses = subset.addresses.unwrap_or_default().iter().map(|addr| {
                    EndpointAddress {
                        ip: addr.ip.clone(),
                        hostname: addr.hostname.clone(),
                        node_name: addr.node_name.clone(),
                        target_ref: addr.target_ref.as_ref().map(|tr| EndpointTargetRef {
                            kind: tr.kind.clone().unwrap_or_default(),
                            name: tr.name.clone().unwrap_or_default(),
                            namespace: tr.namespace.clone().unwrap_or_default(),
                        }),
                    }
                }).collect();
                
                // Parse not ready addresses
                let not_ready_addresses = subset.not_ready_addresses.unwrap_or_default().iter().map(|addr| {
                    EndpointAddress {
                        ip: addr.ip.clone(),
                        hostname: addr.hostname.clone(),
                        node_name: addr.node_name.clone(),
                        target_ref: addr.target_ref.as_ref().map(|tr| EndpointTargetRef {
                            kind: tr.kind.clone().unwrap_or_default(),
                            name: tr.name.clone().unwrap_or_default(),
                            namespace: tr.namespace.clone().unwrap_or_default(),
                        }),
                    }
                }).collect();
                
                // Parse ports
                let ports = subset.ports.unwrap_or_default().iter().map(|port| {
                    EndpointPort {
                        name: port.name.clone(),
                        port: port.port,
                        protocol: port.protocol.clone().unwrap_or_else(|| "TCP".to_string()),
                    }
                }).collect();
                
                subsets.push(EndpointSubset {
                    addresses,
                    not_ready_addresses,
                    ports,
                });
            }
        }
        
        result.push(EndpointsInfo {
            name,
            namespace: ns,
            subsets,
            age,
        });
    }
    
    Ok(result)
}
