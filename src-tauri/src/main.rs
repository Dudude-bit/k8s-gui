//! Main entry point for K8s GUI application

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use k8s_gui_lib::{commands, state::AppState};
use tauri::{Manager, Emitter};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

fn main() {
    // Install rustls crypto provider before any TLS operations
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    // Initialize tracing
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting K8s GUI application");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
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
                        AppEvent::ResourceCreated { .. } => "resource-created",
                        AppEvent::ResourceUpdated { .. } => "resource-updated",
                        AppEvent::ResourceDeleted { .. } => "resource-deleted",
                        AppEvent::Error { .. } => "app-error",
                        AppEvent::WatchEvent { .. } => "watch-event",
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
            commands::namespace::get_current_namespace,
            commands::namespace::switch_namespace,
            
            // Generic resource management
            commands::resources::list_resources,
            commands::resources::get_resource,
            commands::resources::create_resource,
            commands::resources::update_resource,
            commands::resources::delete_resource,
            commands::resources::watch_resources,
            commands::resources::stop_watch,
            
            // Pod commands
            commands::pods::list_pods,
            commands::pods::get_pod,
            commands::pods::get_pod_yaml,
            commands::pods::delete_pod,
            commands::pods::get_pod_containers,
            commands::pods::get_container_statuses,
            commands::pods::restart_pod,
            
            // Deployment commands
            commands::deployments::list_deployments,
            commands::deployments::get_deployment,
            commands::deployments::get_deployment_yaml,
            commands::deployments::delete_deployment,
            commands::deployments::scale_deployment,
            commands::deployments::restart_deployment,
            commands::deployments::update_deployment_image,
            commands::deployments::get_deployment_pods,
            commands::deployments::get_rollout_status,
            
            // Service commands
            commands::services::list_services,
            commands::services::get_service,
            commands::services::get_service_yaml,
            commands::services::delete_service,
            commands::services::get_service_endpoints,
            commands::services::get_service_pods,
            commands::services::port_forward_service,
            commands::services::stop_service_port_forward,

            // Port-forward commands
            commands::port_forward::port_forward_pod,
            commands::port_forward::stop_port_forward,
            commands::port_forward::list_port_forwards,
            
            // ConfigMap commands
            commands::config_resources::list_configmaps,
            commands::config_resources::get_configmap,
            commands::config_resources::get_configmap_data,
            commands::config_resources::get_configmap_yaml,
            commands::config_resources::create_configmap,
            commands::config_resources::update_configmap,
            commands::config_resources::delete_configmap,
            
            // Secret commands
            commands::config_resources::list_secrets,
            commands::config_resources::get_secret,
            commands::config_resources::get_secret_data,
            commands::config_resources::get_secret_yaml,
            commands::config_resources::create_secret,
            commands::config_resources::update_secret,
            commands::config_resources::delete_secret,
            
            // Node commands
            commands::nodes::list_nodes,
            commands::nodes::get_node,
            commands::nodes::get_node_yaml,
            commands::nodes::get_node_resources,
            commands::nodes::get_node_conditions,
            commands::nodes::get_node_pods,
            commands::nodes::cordon_node,
            commands::nodes::uncordon_node,
            commands::nodes::drain_node,
            
            // Event commands
            commands::events::list_events,
            commands::events::list_all_events,
            commands::events::list_warning_events,
            commands::events::get_resource_events,
            commands::events::get_pod_events,
            commands::events::get_deployment_events,
            commands::events::get_node_events,
            commands::events::watch_events,
            commands::events::stop_watch_events,
            commands::events::get_event_summary,
            
            // Log commands
            commands::logs::stream_pod_logs,
            commands::logs::get_pod_logs,
            commands::logs::stop_log_stream,
            commands::logs::search_pod_logs,
            commands::logs::get_multi_container_logs,
            commands::logs::download_pod_logs,
            
            // Terminal/Exec commands
            commands::terminal::exec_in_pod,
            commands::terminal::terminal_input,
            commands::terminal::terminal_resize,
            commands::terminal::close_terminal,
            commands::terminal::list_terminal_sessions,
            commands::terminal::open_shell,
            commands::terminal::run_command_in_pod,
            commands::terminal::copy_from_pod,
            commands::terminal::copy_to_pod,
            
            // Plugin commands
            commands::plugins::list_plugins,
            commands::plugins::get_plugin,
            commands::plugins::enable_plugin,
            commands::plugins::disable_plugin,
            commands::plugins::discover_plugins,
            commands::plugins::execute_plugin,
            commands::plugins::list_kubectl_plugins,
            commands::plugins::execute_kubectl_plugin,
            commands::plugins::list_helm_releases,
            commands::plugins::get_helm_release,
            commands::plugins::get_helm_values,
            commands::plugins::get_helm_manifest,
            commands::plugins::get_helm_history,
            commands::plugins::rollback_helm_release,
            commands::plugins::uninstall_helm_release,
            commands::plugins::get_context_menu_items,
            commands::plugins::execute_context_menu_action,
            commands::plugins::get_resource_renderers,
            commands::plugins::render_resource,
            
            // Settings commands
            commands::settings::get_config,
            commands::settings::update_config,
            commands::settings::reset_config,
            commands::settings::get_theme,
            commands::settings::update_theme,
            commands::settings::get_kubernetes_config,
            commands::settings::update_kubernetes_config,
            commands::settings::get_cache_config,
            commands::settings::update_cache_config,
            commands::settings::clear_cache,
            commands::settings::get_plugin_config,
            commands::settings::update_plugin_config,
            commands::settings::get_logging_config,
            commands::settings::update_logging_config,
            commands::settings::get_keyboard_shortcuts,
            commands::settings::update_keyboard_shortcut,
            commands::settings::reset_keyboard_shortcuts,
            commands::settings::export_settings,
            commands::settings::import_settings,
            commands::settings::get_app_info,
            
            // Authentication commands
            commands::auth::get_auth_status,
            commands::auth::auth_with_kubeconfig,
            commands::auth::auth_with_token,
            commands::auth::auth_with_certificate,
            commands::auth::start_oidc_auth,
            commands::auth::complete_oidc_auth,
            commands::auth::auth_with_eks,
            commands::auth::list_eks_clusters,
            commands::auth::refresh_auth,
            commands::auth::save_credentials,
            commands::auth::delete_credentials,
            commands::auth::logout,
            
            // Storage commands
            commands::storage::list_persistent_volumes,
            commands::storage::list_persistent_volume_claims,
            commands::storage::list_storage_classes,
            
            // Network commands
            commands::network::list_ingresses,
            commands::network::list_endpoints,
            
            // Stats commands
            commands::stats::get_cluster_stats,
            
            // Workloads commands
            commands::workloads::list_statefulsets,
            commands::workloads::list_daemonsets,
            commands::workloads::list_jobs,
            commands::workloads::list_cronjobs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
