//! OIDC interactive authentication: spin up a localhost listener,
//! emit the auth URL to the frontend, exchange the callback code for
//! a token via `OidcAuth`.

use crate::auth::OidcAuth;
use crate::error::{AuthError, Error, Result};
use crate::state::{AppEvent, AppState};
use kube::config::AuthProviderConfig;
use std::collections::HashMap;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::time::Duration;
use url::Url;

/// Buffer size for OIDC callback reading
const OIDC_CALLBACK_BUFFER_SIZE: usize = 4096;

pub(super) async fn run_oidc_auth(
    state: &AppState,
    context: &str,
    provider: &AuthProviderConfig,
) -> Result<crate::auth::AuthResult> {
    let config = &provider.config;
    let issuer_url = config
        .get("idp-issuer-url")
        .ok_or_else(|| Error::Auth(AuthError::Oidc("Missing issuer URL".to_string())))?
        .clone();
    let client_id = config
        .get("client-id")
        .ok_or_else(|| Error::Auth(AuthError::Oidc("Missing client ID".to_string())))?
        .clone();
    let client_secret = config.get("client-secret").cloned();
    let scopes = parse_scopes(config);

    let auth = OidcAuth::new(issuer_url, client_id, client_secret, scopes);
    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let redirect_port = listener.local_addr()?.port();
    let redirect_uri = format!("http://127.0.0.1:{redirect_port}/callback");

    let auth_url = auth.generate_auth_url(&redirect_uri).await?;
    let (session_id, mut cancel_rx) = state.create_auth_session(context, "oidc");

    state.emit(AppEvent::AuthUrlRequested {
        context: context.to_string(),
        url: auth_url.url.clone(),
        flow: "oidc".to_string(),
        session_id: Some(session_id.clone()),
    });

    let callback_fut = wait_for_oidc_callback(listener);
    tokio::pin!(callback_fut);

    let callback_result = tokio::select! {
        result = &mut callback_fut => result,
        _ = &mut cancel_rx => {
            state.remove_auth_session(&session_id);
            state.emit(AppEvent::AuthFlowCancelled {
                session_id,
                context: context.to_string(),
                message: Some("Authentication cancelled.".to_string()),
            });
            return Err(Error::Auth(AuthError::Oidc("Authentication cancelled".to_string())));
        }
        () = tokio::time::sleep(Duration::from_secs(180)) => {
            state.remove_auth_session(&session_id);
            state.emit(AppEvent::AuthFlowCompleted {
                session_id,
                context: context.to_string(),
                success: false,
                message: Some("Authentication timed out.".to_string()),
            });
            return Err(Error::Timeout("Authentication timed out".to_string()));
        }
    };

    let callback = match callback_result {
        Ok(callback) => callback,
        Err(err) => {
            state.remove_auth_session(&session_id);
            state.emit(AppEvent::AuthFlowCompleted {
                session_id,
                context: context.to_string(),
                success: false,
                message: Some(err.to_string()),
            });
            return Err(err);
        }
    };

    if callback.state != auth_url.state {
        state.remove_auth_session(&session_id);
        state.emit(AppEvent::AuthFlowCompleted {
            session_id,
            context: context.to_string(),
            success: false,
            message: Some("OIDC state mismatch.".to_string()),
        });
        return Err(Error::Auth(AuthError::Oidc(
            "OIDC state mismatch".to_string(),
        )));
    }

    let auth_result = auth
        .exchange_code(&callback.code, &redirect_uri, &auth_url.code_verifier)
        .await?;

    state.remove_auth_session(&session_id);
    state.emit(AppEvent::AuthFlowCompleted {
        session_id,
        context: context.to_string(),
        success: true,
        message: None,
    });

    Ok(auth_result)
}

fn parse_scopes(config: &HashMap<String, String>) -> Vec<String> {
    config
        .get("extra-scopes")
        .map(|scopes| {
            scopes
                .split([',', ' '])
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.trim().to_string())
                .collect::<Vec<String>>()
        })
        .unwrap_or_default()
}

struct OidcCallback {
    code: String,
    state: String,
}

async fn wait_for_oidc_callback(listener: TcpListener) -> Result<OidcCallback> {
    let (mut socket, _) = listener.accept().await?;
    let mut buf = [0u8; OIDC_CALLBACK_BUFFER_SIZE];
    let n = socket.read(&mut buf).await?;
    if n == 0 {
        return Err(Error::Auth(AuthError::Oidc(
            "OIDC callback empty".to_string(),
        )));
    }
    let request = String::from_utf8_lossy(&buf[..n]);
    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/");
    let url = Url::parse(&format!("http://localhost{path}"))
        .map_err(|e| Error::Auth(AuthError::Oidc(format!("OIDC callback parse failed: {e}"))))?;

    let mut code = None;
    let mut state = None;
    for (key, value) in url.query_pairs() {
        if key == "code" {
            code = Some(value.to_string());
        }
        if key == "state" {
            state = Some(value.to_string());
        }
    }

    let body = "<html><body>Authentication complete. You can close this window.</body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = socket.write_all(response.as_bytes()).await;

    let code = code.ok_or_else(|| Error::Auth(AuthError::Oidc("Missing code".to_string())))?;
    let state = state.ok_or_else(|| Error::Auth(AuthError::Oidc("Missing state".to_string())))?;

    Ok(OidcCallback { code, state })
}
