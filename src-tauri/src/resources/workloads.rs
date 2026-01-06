//! Workload resource types

use k8s_openapi::api::apps::v1::{DaemonSet, StatefulSet};
use k8s_openapi::api::batch::v1::{CronJob, Job};
use serde::{Deserialize, Serialize};

// ============= StatefulSet =============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatefulSetReplicaInfo {
    pub desired: i32,
    pub ready: i32,
    pub current: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatefulSetInfo {
    pub name: String,
    pub namespace: String,
    pub replicas: StatefulSetReplicaInfo,
    pub created_at: Option<String>,
}

impl From<&StatefulSet> for StatefulSetInfo {
    fn from(ss: &StatefulSet) -> Self {
        let meta = &ss.metadata;
        let spec = ss.spec.as_ref();
        let status = ss.status.as_ref();

        Self {
            name: meta.name.clone().unwrap_or_default(),
            namespace: meta.namespace.clone().unwrap_or_default(),
            replicas: StatefulSetReplicaInfo {
                desired: spec.and_then(|s| s.replicas).unwrap_or(0),
                ready: status.and_then(|s| s.ready_replicas).unwrap_or(0),
                current: status.and_then(|s| s.current_replicas).unwrap_or(0),
            },
            created_at: meta.creation_timestamp.as_ref().map(|t| t.0.to_rfc3339()),
        }
    }
}

// ============= DaemonSet =============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonSetInfo {
    pub name: String,
    pub namespace: String,
    pub desired: i32,
    pub current: i32,
    pub ready: i32,
    pub created_at: Option<String>,
}

impl From<&DaemonSet> for DaemonSetInfo {
    fn from(ds: &DaemonSet) -> Self {
        let meta = &ds.metadata;
        let status = ds.status.as_ref();

        Self {
            name: meta.name.clone().unwrap_or_default(),
            namespace: meta.namespace.clone().unwrap_or_default(),
            desired: status.map(|s| s.desired_number_scheduled).unwrap_or(0),
            current: status.map(|s| s.current_number_scheduled).unwrap_or(0),
            ready: status.map(|s| s.number_ready).unwrap_or(0),
            created_at: meta.creation_timestamp.as_ref().map(|t| t.0.to_rfc3339()),
        }
    }
}

// ============= Job =============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

impl From<&Job> for JobInfo {
    fn from(job: &Job) -> Self {
        let meta = &job.metadata;
        let spec = job.spec.as_ref();
        let status = job.status.as_ref();

        let succeeded = status.and_then(|s| s.succeeded).unwrap_or(0);
        let active = status.and_then(|s| s.active).unwrap_or(0);
        let failed = status.and_then(|s| s.failed).unwrap_or(0);

        let job_status = if succeeded > 0 && active == 0 {
            "Complete"
        } else if failed > 0 {
            "Failed"
        } else if active > 0 {
            "Running"
        } else {
            "Pending"
        };

        Self {
            name: meta.name.clone().unwrap_or_default(),
            namespace: meta.namespace.clone().unwrap_or_default(),
            completions: spec.and_then(|s| s.completions),
            succeeded,
            failed,
            active,
            status: job_status.to_string(),
            created_at: meta.creation_timestamp.as_ref().map(|t| t.0.to_rfc3339()),
        }
    }
}

// ============= CronJob =============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CronJobInfo {
    pub name: String,
    pub namespace: String,
    pub schedule: String,
    pub suspend: bool,
    pub active: i32,
    pub last_schedule: Option<String>,
    pub created_at: Option<String>,
}

impl From<&CronJob> for CronJobInfo {
    fn from(cj: &CronJob) -> Self {
        let meta = &cj.metadata;
        let spec = cj.spec.as_ref();
        let status = cj.status.as_ref();

        Self {
            name: meta.name.clone().unwrap_or_default(),
            namespace: meta.namespace.clone().unwrap_or_default(),
            schedule: spec
                .map(|s| s.schedule.clone())
                .unwrap_or_else(|| "".to_string()),
            suspend: spec.and_then(|s| s.suspend).unwrap_or(false),
            active: status.and_then(|s| s.active.as_ref()).map_or(0, |a| a.len() as i32),
            last_schedule: status
                .and_then(|s| s.last_schedule_time.as_ref())
                .map(|t| t.0.to_rfc3339()),
            created_at: meta.creation_timestamp.as_ref().map(|t| t.0.to_rfc3339()),
        }
    }
}

// ============= Deployment Extras =============

/// Deployment condition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentCondition {
    pub condition_type: String,
    pub status: String,
    pub reason: Option<String>,
    pub message: Option<String>,
}

/// Rollout status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RolloutStatus {
    pub replicas: i32,
    pub ready_replicas: i32,
    pub updated_replicas: i32,
    pub available_replicas: i32,
    pub conditions: Vec<DeploymentCondition>,
}
