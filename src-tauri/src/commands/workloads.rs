//! Workload resource commands (StatefulSets, DaemonSets, Jobs, CronJobs)

use crate::commands::helpers::ListContext;
use crate::error::Result;
use crate::state::AppState;
use k8s_openapi::api::apps::v1::{DaemonSet, StatefulSet};
use k8s_openapi::api::batch::v1::{CronJob, Job};
use kube::api::ListParams;
use serde::{Deserialize, Serialize};
use tauri::State;

// ============= StatefulSet =============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatefulSetReplicaInfo {
    pub desired: i32,
    pub ready: i32,
    pub current: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatefulSetInfo {
    pub name: String,
    pub namespace: String,
    pub replicas: StatefulSetReplicaInfo,
    pub created_at: Option<String>,
}

#[tauri::command]
pub async fn list_statefulsets(
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<StatefulSetInfo>> {
    let ctx = ListContext::new(&state, namespace)?;
    let api: kube::Api<StatefulSet> = ctx.api();
    let list = api.list(&ListParams::default()).await?;

    Ok(list
        .items
        .into_iter()
        .map(|ss| {
            let meta = ss.metadata;
            let spec = ss.spec.unwrap_or_default();
            let status = ss.status.unwrap_or_default();

            StatefulSetInfo {
                name: meta.name.unwrap_or_default(),
                namespace: meta.namespace.unwrap_or_default(),
                replicas: StatefulSetReplicaInfo {
                    desired: spec.replicas.unwrap_or(0),
                    ready: status.ready_replicas.unwrap_or(0),
                    current: status.current_replicas.unwrap_or(0),
                },
                created_at: meta.creation_timestamp.map(|t| t.0.to_rfc3339()),
            }
        })
        .collect())
}

// ============= DaemonSet =============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonSetInfo {
    pub name: String,
    pub namespace: String,
    pub desired: i32,
    pub current: i32,
    pub ready: i32,
    pub created_at: Option<String>,
}

#[tauri::command]
pub async fn list_daemonsets(
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<DaemonSetInfo>> {
    let ctx = ListContext::new(&state, namespace)?;
    let api: kube::Api<DaemonSet> = ctx.api();
    let list = api.list(&ListParams::default()).await?;

    Ok(list
        .items
        .into_iter()
        .map(|ds| {
            let meta = ds.metadata;
            let status = ds.status.unwrap_or_default();

            DaemonSetInfo {
                name: meta.name.unwrap_or_default(),
                namespace: meta.namespace.unwrap_or_default(),
                desired: status.desired_number_scheduled,
                current: status.current_number_scheduled,
                ready: status.number_ready,
                created_at: meta.creation_timestamp.map(|t| t.0.to_rfc3339()),
            }
        })
        .collect())
}

// ============= Job =============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobInfo {
    pub name: String,
    pub namespace: String,
    pub completions: Option<i32>,
    pub succeeded: i32,
    pub failed: i32,
    pub active: i32,
    pub status: String,
    pub created_at: Option<String>,
}

#[tauri::command]
pub async fn list_jobs(
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<JobInfo>> {
    let ctx = ListContext::new(&state, namespace)?;
    let api: kube::Api<Job> = ctx.api();
    let list = api.list(&ListParams::default()).await?;

    Ok(list
        .items
        .into_iter()
        .map(|job| {
            let meta = job.metadata;
            let spec = job.spec.unwrap_or_default();
            let status = job.status.unwrap_or_default();

            let job_status =
                if status.succeeded.unwrap_or(0) > 0 && status.active.unwrap_or(0) == 0 {
                    "Complete"
                } else if status.failed.unwrap_or(0) > 0 {
                    "Failed"
                } else if status.active.unwrap_or(0) > 0 {
                    "Running"
                } else {
                    "Pending"
                };

            JobInfo {
                name: meta.name.unwrap_or_default(),
                namespace: meta.namespace.unwrap_or_default(),
                completions: spec.completions,
                succeeded: status.succeeded.unwrap_or(0),
                failed: status.failed.unwrap_or(0),
                active: status.active.unwrap_or(0),
                status: job_status.to_string(),
                created_at: meta.creation_timestamp.map(|t| t.0.to_rfc3339()),
            }
        })
        .collect())
}

// ============= CronJob =============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronJobInfo {
    pub name: String,
    pub namespace: String,
    pub schedule: String,
    pub suspend: bool,
    pub active: i32,
    pub last_schedule: Option<String>,
    pub created_at: Option<String>,
}

#[tauri::command]
pub async fn list_cronjobs(
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<CronJobInfo>> {
    let ctx = ListContext::new(&state, namespace)?;
    let api: kube::Api<CronJob> = ctx.api();
    let list = api.list(&ListParams::default()).await?;

    Ok(list
        .items
        .into_iter()
        .map(|cj| {
            let meta = cj.metadata;
            let spec = cj.spec.unwrap_or_default();
            let status = cj.status.unwrap_or_default();

            CronJobInfo {
                name: meta.name.unwrap_or_default(),
                namespace: meta.namespace.unwrap_or_default(),
                schedule: spec.schedule,
                suspend: spec.suspend.unwrap_or(false),
                active: status.active.as_ref().map(|a| a.len() as i32).unwrap_or(0),
                last_schedule: status.last_schedule_time.map(|t| t.0.to_rfc3339()),
                created_at: meta.creation_timestamp.map(|t| t.0.to_rfc3339()),
            }
        })
        .collect())
}
