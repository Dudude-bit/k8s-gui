//! "Find references" — given a ConfigMap or Secret, scan workloads
//! and ingresses for env vars / envFrom / volumes / imagePullSecrets
//! / TLS that target it.

use crate::commands::helpers::ResourceContext;
use crate::error::Result;
use crate::state::AppState;
use k8s_openapi::api::apps::v1::{DaemonSet, Deployment, StatefulSet};
use k8s_openapi::api::batch::v1::{CronJob, Job};
use k8s_openapi::api::core::v1::{EnvFromSource, EnvVar, Pod, PodSpec, VolumeMount};
use k8s_openapi::api::networking::v1::Ingress;
use kube::api::ListParams;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResourceReference {
    pub kind: String,
    pub name: String,
    pub namespace: String,
    pub container_name: Option<String>,
    pub key: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VolumeReference {
    pub kind: String,
    pub name: String,
    pub namespace: String,
    pub container_name: Option<String>,
    pub mount_path: String,
    pub sub_path: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IngressReference {
    pub name: String,
    pub namespace: String,
    pub hosts: Vec<String>,
}

#[derive(Debug, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResourceReferences {
    pub env_vars: Vec<ResourceReference>,
    pub env_from: Vec<ResourceReference>,
    pub volumes: Vec<VolumeReference>,
    pub image_pull_secrets: Vec<ResourceReference>,
    pub tls_ingress: Vec<IngressReference>,
}

/// Get resources that reference a Secret or `ConfigMap`
#[tauri::command]
pub async fn get_resource_references(
    resource_type: String,
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<ResourceReferences> {
    crate::validation::validate_dns_subdomain(&name)?;
    let ctx = ResourceContext::for_command(&state, namespace.clone())?;
    let ns = ctx
        .namespace
        .clone()
        .unwrap_or_else(|| "default".to_string());
    let is_secret = resource_type.to_lowercase() == "secret";
    let target_name = name.clone();

    // Create all APIs
    let pods_api: kube::Api<Pod> = kube::Api::namespaced(ctx.client.clone(), &ns);
    let deploy_api: kube::Api<Deployment> = kube::Api::namespaced(ctx.client.clone(), &ns);
    let sts_api: kube::Api<StatefulSet> = kube::Api::namespaced(ctx.client.clone(), &ns);
    let ds_api: kube::Api<DaemonSet> = kube::Api::namespaced(ctx.client.clone(), &ns);
    let job_api: kube::Api<Job> = kube::Api::namespaced(ctx.client.clone(), &ns);
    let cj_api: kube::Api<CronJob> = kube::Api::namespaced(ctx.client.clone(), &ns);
    let ingress_api: kube::Api<Ingress> = kube::Api::namespaced(ctx.client.clone(), &ns);

    let params = ListParams::default();

    // Fetch all resources in parallel
    let (pods_res, deploys_res, stss_res, dss_res, jobs_res, cjs_res, ingresses_res) = tokio::join!(
        pods_api.list(&params),
        deploy_api.list(&params),
        sts_api.list(&params),
        ds_api.list(&params),
        job_api.list(&params),
        cj_api.list(&params),
        ingress_api.list(&params),
    );

    let mut refs = ResourceReferences::default();

    // Process Pods
    if let Ok(pods) = pods_res {
        for pod in pods.items {
            if let Some(spec) = &pod.spec {
                let pod_name = pod.metadata.name.clone().unwrap_or_default();
                check_pod_spec(
                    spec,
                    "Pod",
                    &pod_name,
                    &ns,
                    &target_name,
                    is_secret,
                    &mut refs,
                );
            }
        }
    }

    // Process Deployments
    if let Ok(deploys) = deploys_res {
        for deploy in deploys.items {
            if let Some(spec) = deploy.spec.as_ref().and_then(|s| s.template.spec.as_ref()) {
                let deploy_name = deploy.metadata.name.clone().unwrap_or_default();
                check_pod_spec(
                    spec,
                    "Deployment",
                    &deploy_name,
                    &ns,
                    &target_name,
                    is_secret,
                    &mut refs,
                );
            }
        }
    }

    // Process StatefulSets
    if let Ok(stss) = stss_res {
        for sts in stss.items {
            if let Some(spec) = sts.spec.as_ref().and_then(|s| s.template.spec.as_ref()) {
                let sts_name = sts.metadata.name.clone().unwrap_or_default();
                check_pod_spec(
                    spec,
                    "StatefulSet",
                    &sts_name,
                    &ns,
                    &target_name,
                    is_secret,
                    &mut refs,
                );
            }
        }
    }

    // Process DaemonSets
    if let Ok(dss) = dss_res {
        for ds in dss.items {
            if let Some(spec) = ds.spec.as_ref().and_then(|s| s.template.spec.as_ref()) {
                let ds_name = ds.metadata.name.clone().unwrap_or_default();
                check_pod_spec(
                    spec,
                    "DaemonSet",
                    &ds_name,
                    &ns,
                    &target_name,
                    is_secret,
                    &mut refs,
                );
            }
        }
    }

    // Process Jobs
    if let Ok(jobs) = jobs_res {
        for job in jobs.items {
            if let Some(spec) = job.spec.as_ref().and_then(|s| s.template.spec.as_ref()) {
                let job_name = job.metadata.name.clone().unwrap_or_default();
                check_pod_spec(
                    spec,
                    "Job",
                    &job_name,
                    &ns,
                    &target_name,
                    is_secret,
                    &mut refs,
                );
            }
        }
    }

    // Process CronJobs
    if let Ok(cjs) = cjs_res {
        for cj in cjs.items {
            if let Some(spec) = cj
                .spec
                .as_ref()
                .and_then(|s| s.job_template.spec.as_ref())
                .and_then(|s| s.template.spec.as_ref())
            {
                let cj_name = cj.metadata.name.clone().unwrap_or_default();
                check_pod_spec(
                    spec,
                    "CronJob",
                    &cj_name,
                    &ns,
                    &target_name,
                    is_secret,
                    &mut refs,
                );
            }
        }
    }

    // Process Ingress TLS (only for secrets)
    if is_secret {
        if let Ok(ingresses) = ingresses_res {
            for ingress in ingresses.items {
                if let Some(spec) = &ingress.spec {
                    if let Some(tls_configs) = &spec.tls {
                        for tls in tls_configs {
                            if tls.secret_name.as_ref() == Some(&target_name) {
                                refs.tls_ingress.push(IngressReference {
                                    name: ingress.metadata.name.clone().unwrap_or_default(),
                                    namespace: ns.clone(),
                                    hosts: tls.hosts.clone().unwrap_or_default(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(refs)
}

fn check_pod_spec(
    spec: &PodSpec,
    kind: &str,
    resource_name: &str,
    resource_ns: &str,
    target_name: &str,
    is_secret: bool,
    refs: &mut ResourceReferences,
) {
    // Helper to check a container's env vars and envFrom
    let check_container_env = |container_name: &str,
                               env: Option<&Vec<EnvVar>>,
                               env_from: Option<&Vec<EnvFromSource>>,
                               refs: &mut ResourceReferences| {
        // Check env vars
        if let Some(env) = env {
            for e in env {
                if let Some(value_from) = &e.value_from {
                    let matches = if is_secret {
                        value_from
                            .secret_key_ref
                            .as_ref()
                            .map(|r| r.name == target_name)
                            .unwrap_or(false)
                    } else {
                        value_from
                            .config_map_key_ref
                            .as_ref()
                            .map(|r| r.name == target_name)
                            .unwrap_or(false)
                    };
                    if matches {
                        let key = if is_secret {
                            value_from.secret_key_ref.as_ref().map(|r| r.key.clone())
                        } else {
                            value_from
                                .config_map_key_ref
                                .as_ref()
                                .map(|r| r.key.clone())
                        };
                        refs.env_vars.push(ResourceReference {
                            kind: kind.to_string(),
                            name: resource_name.to_string(),
                            namespace: resource_ns.to_string(),
                            container_name: Some(container_name.to_string()),
                            key,
                        });
                    }
                }
            }
        }

        // Check envFrom
        if let Some(env_from) = env_from {
            for ef in env_from {
                let matches = if is_secret {
                    ef.secret_ref
                        .as_ref()
                        .map(|r| r.name == target_name)
                        .unwrap_or(false)
                } else {
                    ef.config_map_ref
                        .as_ref()
                        .map(|r| r.name == target_name)
                        .unwrap_or(false)
                };
                if matches {
                    refs.env_from.push(ResourceReference {
                        kind: kind.to_string(),
                        name: resource_name.to_string(),
                        namespace: resource_ns.to_string(),
                        container_name: Some(container_name.to_string()),
                        key: None,
                    });
                }
            }
        }
    };

    // Check regular containers
    for container in spec.containers.iter() {
        check_container_env(
            &container.name,
            container.env.as_ref(),
            container.env_from.as_ref(),
            refs,
        );
    }

    // Check init containers
    if let Some(init_containers) = &spec.init_containers {
        for container in init_containers.iter() {
            check_container_env(
                &container.name,
                container.env.as_ref(),
                container.env_from.as_ref(),
                refs,
            );
        }
    }

    // Check ephemeral containers
    if let Some(ephemeral_containers) = &spec.ephemeral_containers {
        for container in ephemeral_containers.iter() {
            check_container_env(
                &container.name,
                container.env.as_ref(),
                container.env_from.as_ref(),
                refs,
            );
        }
    }

    // Check volumes
    if let Some(volumes) = &spec.volumes {
        for vol in volumes {
            let matches = if is_secret {
                vol.secret
                    .as_ref()
                    .and_then(|s| s.secret_name.as_ref())
                    .map(|n| n == target_name)
                    .unwrap_or(false)
            } else {
                vol.config_map
                    .as_ref()
                    .map(|c| c.name == target_name)
                    .unwrap_or(false)
            };
            if matches {
                // Helper to find mount paths in a container
                let find_mounts =
                    |container_name: &str,
                     volume_mounts: Option<&Vec<VolumeMount>>,
                     refs: &mut ResourceReferences| {
                        if let Some(mounts) = volume_mounts {
                            for mount in mounts {
                                if mount.name == vol.name {
                                    refs.volumes.push(VolumeReference {
                                        kind: kind.to_string(),
                                        name: resource_name.to_string(),
                                        namespace: resource_ns.to_string(),
                                        container_name: Some(container_name.to_string()),
                                        mount_path: mount.mount_path.clone(),
                                        sub_path: mount.sub_path.clone(),
                                    });
                                }
                            }
                        }
                    };

                // Check regular containers
                for container in spec.containers.iter() {
                    find_mounts(&container.name, container.volume_mounts.as_ref(), refs);
                }

                // Check init containers
                if let Some(init_containers) = &spec.init_containers {
                    for container in init_containers.iter() {
                        find_mounts(&container.name, container.volume_mounts.as_ref(), refs);
                    }
                }

                // Check ephemeral containers
                if let Some(ephemeral_containers) = &spec.ephemeral_containers {
                    for container in ephemeral_containers.iter() {
                        find_mounts(&container.name, container.volume_mounts.as_ref(), refs);
                    }
                }
            }
        }
    }

    // Check imagePullSecrets (only for secrets)
    if is_secret {
        if let Some(pull_secrets) = &spec.image_pull_secrets {
            for ps in pull_secrets {
                if ps.name == target_name {
                    refs.image_pull_secrets.push(ResourceReference {
                        kind: kind.to_string(),
                        name: resource_name.to_string(),
                        namespace: resource_ns.to_string(),
                        container_name: None,
                        key: None,
                    });
                }
            }
        }
    }
}
