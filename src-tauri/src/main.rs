//! Main entry point for K8s GUI application

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use k8s_gui_lib::{commands, state::AppState};
use tauri::{Emitter, Manager};
use k8s_gui_common::init_tracing;

/// Auth server URL baked at build time.
///
/// Build will fail if `VITE_AUTH_SERVER_URL` is not set.
const AUTH_SERVER_URL: &str =
    env!("VITE_AUTH_SERVER_URL", "VITE_AUTH_SERVER_URL must be set at build time");

fn main() {
    // Install rustls crypto provider before any TLS operations
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    // Initialize tracing
    init_tracing();

    tracing::info!("Starting K8s GUI application");

    // Use the baked-in auth server URL
    let license_client =
        k8s_gui_lib::auth::license_client::LicenseClient::new(AUTH_SERVER_URL.to_string());

    tauri::Builder::default()
        .manage(license_client)
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Initialize application state
            let state = AppState::new()?;

            // Subscribe to events and forward to frontend
            let mut event_rx = state.subscribe();
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                use k8s_gui_lib::state::AppEvent;

                while let Ok(event) = event_rx.recv().await {
                    let event_name = match &event {
                        AppEvent::LogMessage { .. } => "log-line",
                        AppEvent::TerminalOutput { .. } => "terminal-output",
                        AppEvent::TerminalClosed { .. } => "terminal-closed",
                        AppEvent::PortForwardStatus { .. } => "port-forward-status",
                        AppEvent::ConnectionStatusChanged { .. } => "connection-status",
                        AppEvent::AuthUrlRequested { .. } => "auth-url-requested",
                        AppEvent::AuthFlowCompleted { .. } => "auth-flow-completed",
                        AppEvent::AuthFlowCancelled { .. } => "auth-flow-cancelled",
                        AppEvent::ResourceCreated { .. } => "resource-created",
                        AppEvent::ResourceUpdated { .. } => "resource-updated",
                        AppEvent::ResourceDeleted { .. } => "resource-deleted",
                        AppEvent::Error { .. } => "app-error",
                    };

                    // Transform event payload for frontend
                    let payload = match &event {
                        AppEvent::LogMessage { stream_id, pod, container, message, timestamp } => {
                            serde_json::json!({
                                "stream_id": stream_id,
                                "line": format!("{} {}", timestamp.clone().unwrap_or_default(), message),
                                "pod": pod,
                                "container": container,
                                "message": message,
                                "timestamp": timestamp
                            })
                        },
                        AppEvent::TerminalOutput { session_id, data } => {
                            serde_json::json!({
                                "session_id": session_id,
                                "data": data
                            })
                        },
                        AppEvent::TerminalClosed { session_id, status } => {
                            serde_json::json!({
                                "session_id": session_id,
                                "status": status
                            })
                        },
                        AppEvent::PortForwardStatus { id, pod, namespace, local_port, remote_port, status, message, attempt } => {
                            serde_json::json!({
                                "id": id,
                                "pod": pod,
                                "namespace": namespace,
                                "local_port": local_port,
                                "remote_port": remote_port,
                                "status": status,
                                "message": message,
                                "attempt": attempt
                            })
                        },
                        AppEvent::AuthUrlRequested { context, url, flow, session_id } => {
                            serde_json::json!({
                                "context": context,
                                "url": url,
                                "flow": flow,
                                "session_id": session_id
                            })
                        },
                        AppEvent::AuthFlowCompleted { session_id, context, success, message } => {
                            serde_json::json!({
                                "session_id": session_id,
                                "context": context,
                                "success": success,
                                "message": message
                            })
                        },
                        AppEvent::AuthFlowCancelled { session_id, context, message } => {
                            serde_json::json!({
                                "session_id": session_id,
                                "context": context,
                                "message": message
                            })
                        },
                        _ => serde_json::to_value(&event).unwrap_or_default(),
                    };

                    if let Err(e) = app_handle.emit(event_name, payload) {
                        tracing::error!("Failed to emit event {}: {}", event_name, e);
                    }
                }
            });

            app.manage(state);

            tracing::info!("Application state initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Cluster management
            commands::cluster::list_contexts,
            commands::cluster::get_current_context,
            commands::cluster::switch_context,
            commands::cluster::connect_cluster,
            commands::cluster::disconnect_cluster,
            commands::cluster::get_cluster_info,

            // Namespace management
            commands::namespace::list_namespaces,

            // Generic resource management
            commands::resources::list_resources,


            // Pod commands
            commands::pods::list_pods,
            commands::pods::get_pod,
            commands::pods::delete_pod,
            commands::pods::restart_pod,

            // Deployment commands
            commands::deployments::list_deployments,
            commands::deployments::get_deployment,
            commands::deployments::delete_deployment,
            commands::deployments::scale_deployment,
            commands::deployments::restart_deployment,
            commands::deployments::update_deployment_image,
            commands::deployments::get_deployment_pods,
            commands::deployments::get_rollout_status,

            // Service commands
            commands::services::list_services,
            commands::services::get_service,
            commands::services::delete_service,

            // Port-forward commands
            commands::port_forward::port_forward_pod,
            commands::port_forward::stop_port_forward,
            commands::port_forward::list_port_forwards,

            // ConfigMap commands
            commands::config_resources::list_configmaps,
            commands::config_resources::get_configmap,
            commands::config_resources::get_configmap_data,
            commands::config_resources::delete_configmap,

            // Secret commands
            commands::config_resources::list_secrets,
            commands::config_resources::get_secret,
            commands::config_resources::get_secret_yaml,
            commands::config_resources::delete_secret,

            // Node commands
            commands::nodes::list_nodes,
            commands::nodes::get_node,
            commands::nodes::get_node_pods,
            commands::nodes::cordon_node,
            commands::nodes::uncordon_node,
            commands::nodes::drain_node,

            // Event commands
            commands::events::list_events,

            // Log commands
            commands::logs::get_pod_logs,
            commands::logs::stop_log_stream,
            commands::logs::stream_pod_logs,

            // Terminal/Exec commands
            commands::terminal::terminal_input,
            commands::terminal::terminal_resize,
            commands::terminal::close_terminal,
            commands::terminal::open_shell,

            // Plugin commands
            commands::plugins::list_helm_releases,

            // Settings commands
            commands::settings::get_app_info,
            commands::settings::clear_cache,

            // Registry commands
            commands::registry::set_registry_credentials,
            commands::registry::delete_registry_credentials,
            commands::registry::get_registry_auth_status,
            commands::registry::import_docker_config,
            commands::registry::search_registry_images,

            // Authentication commands
            commands::auth::cancel_auth_session,

            // License and user authentication commands
            commands::license::login_user,
            commands::license::logout_user,
            commands::license::register_user,
            commands::license::check_license_status,
            commands::license::activate_license,
            commands::license::is_license_valid,
            commands::license::get_user_profile,
            commands::license::update_user_profile,
            commands::license::get_payment_history,

            // Storage commands
            commands::storage::list_persistent_volumes,
            commands::storage::get_persistent_volume,
            commands::storage::delete_persistent_volume,
            commands::storage::list_persistent_volume_claims,
            commands::storage::get_persistent_volume_claim,
            commands::storage::delete_persistent_volume_claim,
            commands::storage::list_storage_classes,
            commands::storage::get_storage_class,
            commands::storage::delete_storage_class,

            // Network commands
            commands::network::list_ingresses,
            commands::network::get_ingress,
            commands::network::delete_ingress,
            commands::network::list_endpoints,
            commands::network::get_endpoints,
            commands::network::delete_endpoints,

            // Stats commands
            commands::stats::get_cluster_stats,

            // Metrics API
            commands::metrics::get_pods_metrics,
            commands::metrics::get_nodes_metrics,
            commands::metrics::get_cluster_metrics,

            // Workloads commands
            commands::workloads::list_statefulsets,
            commands::workloads::list_daemonsets,
            commands::workloads::list_jobs,
            commands::workloads::list_cronjobs,

            // Validation commands
            commands::validation::validate_email_command,
            commands::validation::validate_password_command,
            commands::validation::validate_license_key_command,

            // Manifest commands
            commands::manifest::validate_manifest,
            commands::manifest::apply_manifest,
            commands::manifest::delete_manifest,
            commands::manifest::get_manifest,

            // Logging commands
            commands::logging::log_frontend_event,
            commands::logging::log_frontend_events_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
