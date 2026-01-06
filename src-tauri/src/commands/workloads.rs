//! Workload resource commands (`StatefulSets`, `DaemonSets`, Jobs, `CronJobs`)

use crate::error::Result;
use crate::resources::{CronJobInfo, DaemonSetInfo, JobInfo, StatefulSetInfo};
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
        .iter()
        .map(StatefulSetInfo::from)
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
        .iter()
        .map(DaemonSetInfo::from)
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
        .iter()
        .map(JobInfo::from)
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
        .iter()
        .map(CronJobInfo::from)
        .collect())
}
