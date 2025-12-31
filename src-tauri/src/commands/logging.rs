//! Logging commands
use crate::error::Result;
use serde_json::Value;

fn log_frontend(level: &str, message: &str, context: Option<&str>, data: Option<Value>) {
    let message = match context {
        Some(ctx) if !ctx.is_empty() => format!("[{}] {}", ctx, message),
        _ => message.to_string(),
    };

    match level.to_lowercase().as_str() {
        "debug" => {
            if let Some(d) = data {
                tracing::debug!(target: "frontend", data = ?d, "{}", message);
            } else {
                tracing::debug!(target: "frontend", "{}", message);
            }
        }
        "info" | "log" => {
            if let Some(d) = data {
                tracing::info!(target: "frontend", data = ?d, "{}", message);
            } else {
                tracing::info!(target: "frontend", "{}", message);
            }
        }
        "warn" => {
            if let Some(d) = data {
                tracing::warn!(target: "frontend", data = ?d, "{}", message);
            } else {
                tracing::warn!(target: "frontend", "{}", message);
            }
        }
        "error" => {
            if let Some(d) = data {
                tracing::error!(target: "frontend", data = ?d, "{}", message);
            } else {
                tracing::error!(target: "frontend", "{}", message);
            }
        }
        _ => {
            tracing::info!(target: "frontend", "{} (unknown level: {})", message, level);
        }
    }
}

/// Log a structured frontend event to the backend tracing system
#[tauri::command]
pub fn log_frontend_event(
    level: String,
    message: String,
    context: Option<String>,
    data: Option<Value>,
) -> Result<()> {
    log_frontend(&level, &message, context.as_deref(), data);
    Ok(())
}
