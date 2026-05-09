//! Settings and configuration commands.
//!
//! Split into:
//! - `helpers`: thin save_config / with_config / read_config wrappers
//! - `cloud`:   GCP + Azure + bindings + CLI paths
//! - `registry`: image-registry configurations
//! - `prefs`:   theme + YAML history + infra builder + recent +
//!              updater + cluster preferences + AppInfo

mod cloud;
pub mod helpers;
mod prefs;
mod registry;

pub use cloud::{
    delete_azure_profile, delete_context_binding, delete_gcp_profile, get_azure_profile,
    get_cli_paths, get_context_binding, get_gcp_profile, list_azure_profiles,
    list_context_bindings, list_gcp_profiles, save_azure_profile, save_cli_paths,
    save_context_binding, save_gcp_profile, test_azure_profile, test_gcp_profile, AzureProfileInfo,
    ContextBindingInfo, GcpProfileInfo,
};
pub use helpers::{read_config, save_config, with_config};
pub use prefs::{
    add_recent_item, add_yaml_history_entry, clear_infrastructure_state, get_all_yaml_history,
    get_app_info, get_cluster_preferences, get_infrastructure_state, get_recent_items,
    get_theme_config, get_updater_settings, get_yaml_history, save_cluster_preferences,
    save_infrastructure_state, save_theme_config, save_updater_settings, AppInfo, CacheConfig,
    InfrastructureBuilderStateDto, KeyboardShortcut, KubernetesConfig, LoggingConfig, PluginConfig,
    ThemeConfig, YamlHistoryEntryDto,
};
pub use registry::{
    delete_registry_config, list_registry_configs, save_registry_config, RegistryConfigInfo,
};
