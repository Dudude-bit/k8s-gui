//! Helper functions for parsing and formatting Kubernetes resource quantities

use crate::error::{Error, Result};
use crate::utils::quantities::{
    calculate_utilization, format_cpu, format_memory, parse_cpu, parse_memory,
};

/// Parse CPU quantity to millicores (float)
/// Supports formats: "500m", "0.5", "2", "2.5", "100n", "1000000u"
pub fn parse_cpu_to_millicores(cpu_str: &str) -> Result<f64> {
    let trimmed = cpu_str.trim();
    if trimmed.is_empty() {
        return Err(Error::InvalidInput("CPU value is empty".to_string()));
    }

    let (number, _suffix) = trimmed
        .strip_suffix('m')
        .map(|s| (s, "m"))
        .or_else(|| trimmed.strip_suffix('n').map(|s| (s, "n")))
        .or_else(|| trimmed.strip_suffix('u').map(|s| (s, "u")))
        .unwrap_or((trimmed, ""));

    number
        .parse::<f64>()
        .map_err(|e| Error::InvalidInput(format!("Invalid CPU format: {e}")))
        .map(|_| parse_cpu(trimmed))
}

/// Parse memory quantity to bytes (u64)
/// Supports formats: "512Mi", "1Gi", "1024Ki", "1073741824", "100M", "1G"
pub fn parse_memory_to_bytes(mem_str: &str) -> Result<u64> {
    let trimmed = mem_str.trim();
    if trimmed.is_empty() {
        return Err(Error::InvalidInput("Memory value is empty".to_string()));
    }

    let mut number_end = 0;
    for (i, c) in trimmed.char_indices() {
        if c.is_ascii_digit() || c == '.' || c == '-' {
            number_end = i + c.len_utf8();
        } else {
            break;
        }
    }

    if number_end == 0 {
        return Err(Error::InvalidInput("Invalid memory format".to_string()));
    }

    let number = &trimmed[..number_end];
    number
        .parse::<f64>()
        .map_err(|e| Error::InvalidInput(format!("Invalid memory format: {e}")))
        .map(|_| parse_memory(trimmed))
}

/// Format CPU from millicores to string representation
/// Returns format like "500m" for < 1000 millicores, or "2" for >= 1000 millicores
#[must_use]
pub fn format_cpu_from_millicores(millicores: f64) -> String {
    format_cpu(millicores)
}

/// Calculate utilization percentage
/// Returns percentage as f64 (0.0 to 100.0)
#[must_use]
pub fn calculate_utilization_percentage(used: f64, total: f64) -> Option<f64> {
    calculate_utilization(used, total)
}

/// Aggregate pod metrics (sum CPU and memory)
#[must_use]
pub fn aggregate_pod_metrics(
    metrics: &[crate::metrics::PodMetrics],
) -> (Option<String>, Option<String>) {
    let mut total_cpu_millicores = 0.0;
    let mut total_memory_bytes = 0u64;

    for metric in metrics {
        if let Some(cpu_str) = &metric.cpu_usage {
            if let Ok(millicores) = parse_cpu_to_millicores(cpu_str) {
                total_cpu_millicores += millicores;
            }
        }
        if let Some(mem_str) = &metric.memory_usage {
            if let Ok(bytes) = parse_memory_to_bytes(mem_str) {
                total_memory_bytes += bytes;
            }
        }
    }

    let cpu_usage = if total_cpu_millicores > 0.0 {
        Some(format_cpu_from_millicores(total_cpu_millicores))
    } else {
        None
    };

    let memory_usage = if total_memory_bytes > 0 {
        Some(format_memory(total_memory_bytes))
    } else {
        None
    };

    (cpu_usage, memory_usage)
}
