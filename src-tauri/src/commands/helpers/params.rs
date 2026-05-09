//! Tiny stateless helpers for building kube `ListParams` and label
//! selector strings.

use kube::api::ListParams;
use std::collections::BTreeMap;

/// Build `ListParams` from optional selectors and limit
#[must_use]
pub fn build_list_params(
    label_selector: Option<&str>,
    field_selector: Option<&str>,
    limit: Option<i64>,
) -> ListParams {
    let mut params = ListParams::default();
    if let Some(labels) = label_selector {
        params = params.labels(labels);
    }
    if let Some(fields) = field_selector {
        params = params.fields(fields);
    }
    if let Some(limit) = limit {
        if limit > 0 {
            params = params.limit(limit as u32);
        }
    }
    params
}

/// Build a label selector string from key-value pairs
#[must_use]
pub fn build_label_selector(labels: &BTreeMap<String, String>) -> String {
    labels
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join(",")
}
