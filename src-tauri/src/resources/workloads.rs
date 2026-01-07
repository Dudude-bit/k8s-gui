//! Workload resource types

use k8s_openapi::api::apps::v1::{
    DaemonSet, DaemonSetCondition, StatefulSet, StatefulSetCondition,
};
use k8s_openapi::api::batch::v1::{CronJob, Job, JobCondition};
use kube::ResourceExt;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use super::{ConditionInfo, DeploymentContainerInfo};

// ============= StatefulSet =============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatefulSetReplicaInfo {
    pub desired: i32,
    pub ready: i32,
    pub current: i32,
}

/// Basic StatefulSet info for list views
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

/// Detailed StatefulSet info for detail view
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatefulSetDetailInfo {
    pub name: String,
    pub namespace: String,
    pub uid: String,
    pub replicas: StatefulSetReplicaInfo,
    pub service_name: Option<String>,
    pub pod_management_policy: Option<String>,
    pub update_strategy: Option<String>,
    pub containers: Vec<DeploymentContainerInfo>,
    pub labels: BTreeMap<String, String>,
    pub annotations: BTreeMap<String, String>,
    pub conditions: Vec<ConditionInfo>,
    pub created_at: Option<String>,
}

impl From<&StatefulSet> for StatefulSetDetailInfo {
    fn from(ss: &StatefulSet) -> Self {
        let spec = ss.spec.as_ref();
        let status = ss.status.as_ref();

        let containers = spec
            .and_then(|s| s.template.spec.as_ref())
            .map(|pod_spec| {
                pod_spec
                    .containers
                    .iter()
                    .map(DeploymentContainerInfo::from)
                    .collect()
            })
            .unwrap_or_default();

        let conditions = status
            .and_then(|s| s.conditions.as_ref())
            .map(|conds| conds.iter().map(ConditionInfo::from).collect())
            .unwrap_or_default();

        Self {
            name: ss.name_any(),
            namespace: ss.namespace().unwrap_or_default(),
            uid: ss.uid().unwrap_or_default(),
            replicas: StatefulSetReplicaInfo {
                desired: spec.and_then(|s| s.replicas).unwrap_or(0),
                ready: status.and_then(|s| s.ready_replicas).unwrap_or(0),
                current: status.and_then(|s| s.current_replicas).unwrap_or(0),
            },
            service_name: spec.map(|s| s.service_name.clone()),
            pod_management_policy: spec.and_then(|s| s.pod_management_policy.clone()),
            update_strategy: spec
                .and_then(|s| s.update_strategy.as_ref())
                .and_then(|s| s.type_.clone()),
            containers,
            labels: ss.labels().clone(),
            annotations: ss.annotations().clone(),
            conditions,
            created_at: ss.creation_timestamp().map(|t| t.0.to_rfc3339()),
        }
    }
}

impl From<&StatefulSetCondition> for ConditionInfo {
    fn from(cond: &StatefulSetCondition) -> Self {
        Self {
            type_: cond.type_.clone(),
            status: cond.status.clone(),
            reason: cond.reason.clone(),
            message: cond.message.clone(),
            last_transition_time: cond.last_transition_time.as_ref().map(|t| t.0),
        }
    }
}

// ============= DaemonSet =============

/// Basic DaemonSet info for list views
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

/// Detailed DaemonSet info for detail view
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonSetDetailInfo {
    pub name: String,
    pub namespace: String,
    pub uid: String,
    pub desired: i32,
    pub current: i32,
    pub ready: i32,
    pub up_to_date: i32,
    pub available: i32,
    pub update_strategy: Option<String>,
    pub containers: Vec<DeploymentContainerInfo>,
    pub labels: BTreeMap<String, String>,
    pub annotations: BTreeMap<String, String>,
    pub selector: BTreeMap<String, String>,
    pub conditions: Vec<ConditionInfo>,
    pub created_at: Option<String>,
}

impl From<&DaemonSet> for DaemonSetDetailInfo {
    fn from(ds: &DaemonSet) -> Self {
        let spec = ds.spec.as_ref();
        let status = ds.status.as_ref();

        let containers = spec
            .and_then(|s| s.template.spec.as_ref())
            .map(|pod_spec| {
                pod_spec
                    .containers
                    .iter()
                    .map(DeploymentContainerInfo::from)
                    .collect()
            })
            .unwrap_or_default();

        let conditions = status
            .and_then(|s| s.conditions.as_ref())
            .map(|conds| conds.iter().map(ConditionInfo::from).collect())
            .unwrap_or_default();

        let selector = spec
            .and_then(|s| s.selector.match_labels.clone())
            .unwrap_or_default();

        Self {
            name: ds.name_any(),
            namespace: ds.namespace().unwrap_or_default(),
            uid: ds.uid().unwrap_or_default(),
            desired: status.map(|s| s.desired_number_scheduled).unwrap_or(0),
            current: status.map(|s| s.current_number_scheduled).unwrap_or(0),
            ready: status.map(|s| s.number_ready).unwrap_or(0),
            up_to_date: status.and_then(|s| s.updated_number_scheduled).unwrap_or(0),
            available: status.and_then(|s| s.number_available).unwrap_or(0),
            update_strategy: spec
                .and_then(|s| s.update_strategy.as_ref())
                .and_then(|s| s.type_.clone()),
            containers,
            labels: ds.labels().clone(),
            annotations: ds.annotations().clone(),
            selector,
            conditions,
            created_at: ds.creation_timestamp().map(|t| t.0.to_rfc3339()),
        }
    }
}

impl From<&DaemonSetCondition> for ConditionInfo {
    fn from(cond: &DaemonSetCondition) -> Self {
        Self {
            type_: cond.type_.clone(),
            status: cond.status.clone(),
            reason: cond.reason.clone(),
            message: cond.message.clone(),
            last_transition_time: cond.last_transition_time.as_ref().map(|t| t.0),
        }
    }
}

// ============= Job =============

/// Basic Job info for list views
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

/// Detailed Job info for detail view
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobDetailInfo {
    pub name: String,
    pub namespace: String,
    pub uid: String,
    pub completions: Option<i32>,
    pub parallelism: Option<i32>,
    pub backoff_limit: Option<i32>,
    pub active_deadline_seconds: Option<i64>,
    pub succeeded: i32,
    pub failed: i32,
    pub active: i32,
    pub status: String,
    pub start_time: Option<String>,
    pub completion_time: Option<String>,
    pub containers: Vec<DeploymentContainerInfo>,
    pub labels: BTreeMap<String, String>,
    pub annotations: BTreeMap<String, String>,
    pub conditions: Vec<ConditionInfo>,
    pub created_at: Option<String>,
}

impl From<&Job> for JobDetailInfo {
    fn from(job: &Job) -> Self {
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

        let containers = spec
            .and_then(|s| s.template.spec.as_ref())
            .map(|pod_spec| {
                pod_spec
                    .containers
                    .iter()
                    .map(DeploymentContainerInfo::from)
                    .collect()
            })
            .unwrap_or_default();

        let conditions = status
            .and_then(|s| s.conditions.as_ref())
            .map(|conds| conds.iter().map(ConditionInfo::from).collect())
            .unwrap_or_default();

        Self {
            name: job.name_any(),
            namespace: job.namespace().unwrap_or_default(),
            uid: job.uid().unwrap_or_default(),
            completions: spec.and_then(|s| s.completions),
            parallelism: spec.and_then(|s| s.parallelism),
            backoff_limit: spec.and_then(|s| s.backoff_limit),
            active_deadline_seconds: spec.and_then(|s| s.active_deadline_seconds),
            succeeded,
            failed,
            active,
            status: job_status.to_string(),
            start_time: status
                .and_then(|s| s.start_time.as_ref())
                .map(|t| t.0.to_rfc3339()),
            completion_time: status
                .and_then(|s| s.completion_time.as_ref())
                .map(|t| t.0.to_rfc3339()),
            containers,
            labels: job.labels().clone(),
            annotations: job.annotations().clone(),
            conditions,
            created_at: job.creation_timestamp().map(|t| t.0.to_rfc3339()),
        }
    }
}

impl From<&JobCondition> for ConditionInfo {
    fn from(cond: &JobCondition) -> Self {
        Self {
            type_: cond.type_.clone(),
            status: cond.status.clone(),
            reason: cond.reason.clone(),
            message: cond.message.clone(),
            last_transition_time: cond.last_transition_time.as_ref().map(|t| t.0),
        }
    }
}

// ============= CronJob =============

/// Basic CronJob info for list views
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
                .unwrap_or_else(String::new),
            suspend: spec.and_then(|s| s.suspend).unwrap_or(false),
            active: status
                .and_then(|s| s.active.as_ref())
                .map_or(0, |a| a.len() as i32),
            last_schedule: status
                .and_then(|s| s.last_schedule_time.as_ref())
                .map(|t| t.0.to_rfc3339()),
            created_at: meta.creation_timestamp.as_ref().map(|t| t.0.to_rfc3339()),
        }
    }
}

/// Detailed CronJob info for detail view
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CronJobDetailInfo {
    pub name: String,
    pub namespace: String,
    pub uid: String,
    pub schedule: String,
    pub timezone: Option<String>,
    pub suspend: bool,
    pub concurrency_policy: Option<String>,
    pub starting_deadline_seconds: Option<i64>,
    pub successful_jobs_history_limit: Option<i32>,
    pub failed_jobs_history_limit: Option<i32>,
    pub active: i32,
    pub last_schedule: Option<String>,
    pub last_successful_time: Option<String>,
    pub containers: Vec<DeploymentContainerInfo>,
    pub labels: BTreeMap<String, String>,
    pub annotations: BTreeMap<String, String>,
    pub created_at: Option<String>,
}

impl From<&CronJob> for CronJobDetailInfo {
    fn from(cj: &CronJob) -> Self {
        let spec = cj.spec.as_ref();
        let status = cj.status.as_ref();

        let containers = spec
            .and_then(|s| s.job_template.spec.as_ref())
            .and_then(|job_spec| job_spec.template.spec.as_ref())
            .map(|pod_spec| {
                pod_spec
                    .containers
                    .iter()
                    .map(DeploymentContainerInfo::from)
                    .collect()
            })
            .unwrap_or_default();

        Self {
            name: cj.name_any(),
            namespace: cj.namespace().unwrap_or_default(),
            uid: cj.uid().unwrap_or_default(),
            schedule: spec
                .map(|s| s.schedule.clone())
                .unwrap_or_else(String::new),
            timezone: spec.and_then(|s| s.time_zone.clone()),
            suspend: spec.and_then(|s| s.suspend).unwrap_or(false),
            concurrency_policy: spec.and_then(|s| s.concurrency_policy.clone()),
            starting_deadline_seconds: spec.and_then(|s| s.starting_deadline_seconds),
            successful_jobs_history_limit: spec.and_then(|s| s.successful_jobs_history_limit),
            failed_jobs_history_limit: spec.and_then(|s| s.failed_jobs_history_limit),
            active: status
                .and_then(|s| s.active.as_ref())
                .map_or(0, |a| a.len() as i32),
            last_schedule: status
                .and_then(|s| s.last_schedule_time.as_ref())
                .map(|t| t.0.to_rfc3339()),
            last_successful_time: status
                .and_then(|s| s.last_successful_time.as_ref())
                .map(|t| t.0.to_rfc3339()),
            containers,
            labels: cj.labels().clone(),
            annotations: cj.annotations().clone(),
            created_at: cj.creation_timestamp().map(|t| t.0.to_rfc3339()),
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
