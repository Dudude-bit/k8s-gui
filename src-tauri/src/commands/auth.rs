//! Authentication commands

use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Authentication result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResultResponse {
    pub success: bool,
    pub context: Option<String>,
    pub error: Option<String>,
}

/// Cancel an active auth session
#[tauri::command]
pub fn cancel_auth_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if let Some(session) = state.remove_auth_session(&session_id) {
        let _ = session.cancel_tx.send(());
        state.emit(crate::state::AppEvent::AuthFlowCancelled {
            session_id,
            context: session.context,
            message: Some("Authentication cancelled.".to_string()),
        });
    }
    Ok(())
}
