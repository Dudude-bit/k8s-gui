//! Helm commands.
//!
//! Two distinct stacks:
//! - `secret` reads Helm-3 release secrets directly from the
//!   Kubernetes API (list / detail / history) — no helm binary
//!   required.
//! - `cli` shells out to the helm binary for everything that
//!   mutates state (install / upgrade / rollback / uninstall /
//!   repos / search) plus the search and `check_helm_availability`
//!   probe.
//!
//! `manager` owns the global `Lazy<Mutex<CliToolManager<HelmTool>>>`
//! singleton so `commands::settings` can call `reload_helm_manager`
//! when CLI paths change.

mod cli;
mod manager;
mod secret;
mod types;

pub use cli::{
    add_helm_repo, check_helm_availability, helm_install, helm_rollback, helm_search_charts,
    helm_uninstall, helm_upgrade, list_helm_repos, remove_helm_repo, update_helm_repos,
};
pub use manager::{helm_manager, reload_helm_manager};
pub use secret::{get_helm_history, get_helm_release_detail, list_helm_releases_native};
pub use types::{
    HelmChartSearchResult, HelmInstallOptions, HelmRelease, HelmReleaseDetail, HelmRepository,
    HelmRevision,
};
