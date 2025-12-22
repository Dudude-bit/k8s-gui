//! Helper functions for parsing and formatting Kubernetes resource quantities

/// Parse CPU quantity to millicores (float)
/// Supports formats: "500m", "0.5", "2", "2.5"
pub fn parse_cpu_to_millicores(cpu_str: &str) -> Result<f64, String> {
    let cpu_str = cpu_str.trim();
    
    if cpu_str.ends_with('m') {
        // Millicores: "500m" -> 500.0
        let num_str = &cpu_str[..cpu_str.len() - 1];
        num_str.parse::<f64>()
            .map_err(|e| format!("Invalid CPU millicores format: {}", e))
            .map(|v| v / 1000.0) // Convert millicores to cores
    } else {
        // Cores: "2", "0.5", "2.5"
        cpu_str.parse::<f64>()
            .map_err(|e| format!("Invalid CPU cores format: {}", e))
    }
}

/// Parse memory quantity to bytes (u64)
/// Supports formats: "512Mi", "1Gi", "1024Ki", "1073741824"
pub fn parse_memory_to_bytes(mem_str: &str) -> Result<u64, String> {
    let mem_str = mem_str.trim();
    
    if mem_str.ends_with("Ki") {
        let num_str = &mem_str[..mem_str.len() - 2];
        let kib = num_str.parse::<f64>()
            .map_err(|e| format!("Invalid memory format: {}", e))?;
        Ok((kib * 1024.0) as u64)
    } else if mem_str.ends_with("Mi") {
        let num_str = &mem_str[..mem_str.len() - 2];
        let mib = num_str.parse::<f64>()
            .map_err(|e| format!("Invalid memory format: {}", e))?;
        Ok((mib * 1024.0 * 1024.0) as u64)
    } else if mem_str.ends_with("Gi") {
        let num_str = &mem_str[..mem_str.len() - 2];
        let gib = num_str.parse::<f64>()
            .map_err(|e| format!("Invalid memory format: {}", e))?;
        Ok((gib * 1024.0 * 1024.0 * 1024.0) as u64)
    } else if mem_str.ends_with("Ti") {
        let num_str = &mem_str[..mem_str.len() - 2];
        let tib = num_str.parse::<f64>()
            .map_err(|e| format!("Invalid memory format: {}", e))?;
        Ok((tib * 1024.0 * 1024.0 * 1024.0 * 1024.0) as u64)
    } else if mem_str.ends_with('K') {
        let num_str = &mem_str[..mem_str.len() - 1];
        let kb = num_str.parse::<f64>()
            .map_err(|e| format!("Invalid memory format: {}", e))?;
        Ok((kb * 1000.0) as u64)
    } else if mem_str.ends_with('M') {
        let num_str = &mem_str[..mem_str.len() - 1];
        let mb = num_str.parse::<f64>()
            .map_err(|e| format!("Invalid memory format: {}", e))?;
        Ok((mb * 1000.0 * 1000.0) as u64)
    } else if mem_str.ends_with('G') {
        let num_str = &mem_str[..mem_str.len() - 1];
        let gb = num_str.parse::<f64>()
            .map_err(|e| format!("Invalid memory format: {}", e))?;
        Ok((gb * 1000.0 * 1000.0 * 1000.0) as u64)
    } else {
        // Assume bytes
        mem_str.parse::<u64>()
            .map_err(|e| format!("Invalid memory format: {}", e))
    }
}

/// Format CPU from millicores to string representation
/// Returns format like "500m" for < 1 core, or "2" for >= 1 core
pub fn format_cpu_from_millicores(millicores: f64) -> String {
    if millicores < 1.0 {
        format!("{}m", (millicores * 1000.0) as u64)
    } else if millicores.fract() == 0.0 {
        format!("{}", millicores as u64)
    } else {
        format!("{}", millicores)
    }
}

/// Calculate utilization percentage
/// Returns percentage as f64 (0.0 to 100.0)
pub fn calculate_utilization_percentage(used: f64, total: f64) -> Option<f64> {
    if total > 0.0 {
        Some((used / total) * 100.0)
    } else {
        None
    }
}

/// Aggregate pod metrics (sum CPU and memory)
pub fn aggregate_pod_metrics(metrics: &[crate::metrics::PodMetrics]) -> (Option<String>, Option<String>) {
    let mut total_cpu_millicores = 0.0;
    let mut total_memory_bytes = 0u64;

    for metric in metrics {
        if let Some(cpu_str) = &metric.cpu_usage {
            if let Ok(millicores) = parse_cpu_to_millicores(cpu_str) {
                total_cpu_millicores += millicores;
            }
        }
        if let Some(mem_str) = &metric.memory_usage {
            if let Ok(bytes) = mem_str.parse::<u64>() {
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
        Some(format!("{}", total_memory_bytes))
    } else {
        None
    };

    (cpu_usage, memory_usage)
}

