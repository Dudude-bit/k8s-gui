//! Workload resource types

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
