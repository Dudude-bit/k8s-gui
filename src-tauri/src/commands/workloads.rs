//! Workload resource commands (`StatefulSets`, `DaemonSets`, Jobs, `CronJobs`)

use crate::error::Result;
use crate::resources::{CronJobInfo, DaemonSetInfo, JobInfo, StatefulSetInfo, StatefulSetReplicaInfo};
use crate::state::AppState;
use k8s_openapi::api::apps::v1::{DaemonSet, StatefulSet};
use k8s_openapi::api::batch::v1::{CronJob, Job};
use tauri::State;

use crate::commands::filters::ResourceFilters;

// ============= StatefulSet =============

#[tauri::command]
pub async fn list_statefulsets(
    filters: Option<ResourceFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<StatefulSetInfo>> {
    let filters = filters.unwrap_or_default();

    let list = crate::commands::helpers::list_resources::<StatefulSet>(
        filters.namespace,
        state,
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    )
    .await?;

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

#[tauri::command]
pub async fn list_daemonsets(
    filters: Option<ResourceFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<DaemonSetInfo>> {
    let filters = filters.unwrap_or_default();

    let list = crate::commands::helpers::list_resources::<DaemonSet>(
        filters.namespace,
        state,
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    )
    .await?;

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

#[tauri::command]
pub async fn list_jobs(
    filters: Option<ResourceFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<JobInfo>> {
    let filters = filters.unwrap_or_default();

    let list = crate::commands::helpers::list_resources::<Job>(
        filters.namespace,
        state,
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    )
    .await?;

    Ok(list
        .items
        .into_iter()
        .map(|job| {
            let meta = job.metadata;
            let spec = job.spec.unwrap_or_default();
            let status = job.status.unwrap_or_default();

            let job_status = if status.succeeded.unwrap_or(0) > 0 && status.active.unwrap_or(0) == 0
            {
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

#[tauri::command]
pub async fn list_cronjobs(
    filters: Option<ResourceFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<CronJobInfo>> {
    let filters = filters.unwrap_or_default();

    let list = crate::commands::helpers::list_resources::<CronJob>(
        filters.namespace,
        state,
        filters.label_selector.as_deref(),
        filters.field_selector.as_deref(),
        filters.limit,
    )
    .await?;

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
                active: status.active.as_ref().map_or(0, |a| a.len() as i32),
                last_schedule: status.last_schedule_time.map(|t| t.0.to_rfc3339()),
                created_at: meta.creation_timestamp.map(|t| t.0.to_rfc3339()),
            }
        })
        .collect())
}
