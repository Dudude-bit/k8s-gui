//! Workload resource commands (`StatefulSets`, `DaemonSets`, Jobs, `CronJobs`)

use crate::error::Result;
use crate::resources::{
    CronJobDetailInfo, CronJobInfo, DaemonSetDetailInfo, DaemonSetInfo, JobDetailInfo, JobInfo,
    StatefulSetDetailInfo, StatefulSetInfo,
};
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

    Ok(list.items.iter().map(StatefulSetInfo::from).collect())
}

#[tauri::command]
pub async fn get_statefulset(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<StatefulSetDetailInfo> {
    crate::validation::validate_resource_name(&name)?;
    let ss: StatefulSet =
        crate::commands::helpers::get_resource(name, namespace, state).await?;
    Ok(StatefulSetDetailInfo::from(&ss))
}

#[tauri::command]
pub async fn get_statefulset_yaml(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    crate::validation::validate_resource_name(&name)?;
    crate::commands::helpers::get_resource_yaml::<StatefulSet>(name, namespace, state).await
}

#[tauri::command]
pub async fn delete_statefulset(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::validation::validate_resource_name(&name)?;
    crate::commands::helpers::delete_resource::<StatefulSet>(name, namespace, state, None).await
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

    Ok(list.items.iter().map(DaemonSetInfo::from).collect())
}

#[tauri::command]
pub async fn get_daemonset(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<DaemonSetDetailInfo> {
    crate::validation::validate_resource_name(&name)?;
    let ds: DaemonSet = crate::commands::helpers::get_resource(name, namespace, state).await?;
    Ok(DaemonSetDetailInfo::from(&ds))
}

#[tauri::command]
pub async fn get_daemonset_yaml(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    crate::validation::validate_resource_name(&name)?;
    crate::commands::helpers::get_resource_yaml::<DaemonSet>(name, namespace, state).await
}

#[tauri::command]
pub async fn delete_daemonset(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::validation::validate_resource_name(&name)?;
    crate::commands::helpers::delete_resource::<DaemonSet>(name, namespace, state, None).await
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

    Ok(list.items.iter().map(JobInfo::from).collect())
}

#[tauri::command]
pub async fn get_job(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<JobDetailInfo> {
    crate::validation::validate_resource_name(&name)?;
    let job: Job = crate::commands::helpers::get_resource(name, namespace, state).await?;
    Ok(JobDetailInfo::from(&job))
}

#[tauri::command]
pub async fn get_job_yaml(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    crate::validation::validate_resource_name(&name)?;
    crate::commands::helpers::get_resource_yaml::<Job>(name, namespace, state).await
}

#[tauri::command]
pub async fn delete_job(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::validation::validate_resource_name(&name)?;
    crate::commands::helpers::delete_resource::<Job>(name, namespace, state, None).await
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

    Ok(list.items.iter().map(CronJobInfo::from).collect())
}

#[tauri::command]
pub async fn get_cronjob(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<CronJobDetailInfo> {
    crate::validation::validate_resource_name(&name)?;
    let cj: CronJob = crate::commands::helpers::get_resource(name, namespace, state).await?;
    Ok(CronJobDetailInfo::from(&cj))
}

#[tauri::command]
pub async fn get_cronjob_yaml(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<String> {
    crate::validation::validate_resource_name(&name)?;
    crate::commands::helpers::get_resource_yaml::<CronJob>(name, namespace, state).await
}

#[tauri::command]
pub async fn delete_cronjob(
    name: String,
    namespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    crate::validation::validate_resource_name(&name)?;
    crate::commands::helpers::delete_resource::<CronJob>(name, namespace, state, None).await
}
