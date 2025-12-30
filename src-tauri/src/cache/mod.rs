//! Resource cache with TTL support

use dashmap::DashMap;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

/// Cache entry with expiration
#[derive(Debug, Clone)]
struct CacheEntry<T> {
    value: T,
    created_at: Instant,
    ttl: Duration,
}

impl<T> CacheEntry<T> {
    fn is_expired(&self) -> bool {
        self.created_at.elapsed() > self.ttl
    }
}

/// Resource cache with TTL and size limits
pub struct ResourceCache {
    /// Cache storage
    cache: DashMap<String, CacheEntry<serde_json::Value>>,
    /// Default TTL in seconds
    default_ttl: Duration,
    /// Maximum entries
    max_entries: usize,
}

impl ResourceCache {
    /// Create a new cache with the specified TTL
    #[must_use]
    pub fn new(ttl_seconds: u64) -> Self {
        Self {
            cache: DashMap::new(),
            default_ttl: Duration::from_secs(ttl_seconds),
            max_entries: 1000,
        }
    }

    /// Create with custom settings
    #[must_use]
    pub fn with_settings(ttl_seconds: u64, max_entries: usize) -> Self {
        Self {
            cache: DashMap::new(),
            default_ttl: Duration::from_secs(ttl_seconds),
            max_entries,
        }
    }

    /// Generate cache key for a resource
    #[must_use]
    pub fn resource_key(kind: &str, namespace: Option<&str>, name: Option<&str>) -> String {
        match (namespace, name) {
            (Some(ns), Some(n)) => format!("{kind}:{ns}:{n}"),
            (Some(ns), None) => format!("{kind}:{ns}"),
            (None, Some(n)) => format!("{kind}::{n}"),
            (None, None) => kind.to_string(),
        }
    }

    /// Get a cached value
    #[must_use]
    pub fn get(&self, key: &str) -> Option<serde_json::Value> {
        if let Some(entry) = self.cache.get(key) {
            if entry.is_expired() {
                // Remove expired entry
                drop(entry);
                self.cache.remove(key);
            } else {
                return Some(entry.value.clone());
            }
        }
        None
    }

    /// Get a typed cached value
    #[must_use]
    pub fn get_typed<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Option<T> {
        self.get(key).and_then(|v| serde_json::from_value(v).ok())
    }

    /// Set a cached value with default TTL
    pub fn set(&self, key: &str, value: serde_json::Value) {
        self.set_with_ttl(key, value, self.default_ttl);
    }

    /// Set a typed value with default TTL
    pub fn set_typed<T: Serialize>(&self, key: &str, value: &T) {
        if let Ok(json) = serde_json::to_value(value) {
            self.set(key, json);
        }
    }

    /// Set a cached value with custom TTL
    pub fn set_with_ttl(&self, key: &str, value: serde_json::Value, ttl: Duration) {
        // Evict if at capacity
        if self.cache.len() >= self.max_entries {
            self.evict_expired();

            // If still at capacity, remove oldest entry
            if self.cache.len() >= self.max_entries {
                self.evict_oldest();
            }
        }

        let entry = CacheEntry {
            value,
            created_at: Instant::now(),
            ttl,
        };

        self.cache.insert(key.to_string(), entry);
    }

    /// Remove a cached value
    pub fn remove(&self, key: &str) {
        self.cache.remove(key);
    }

    /// Remove all entries matching a prefix
    pub fn remove_prefix(&self, prefix: &str) {
        let keys_to_remove: Vec<_> = self
            .cache
            .iter()
            .filter(|entry| entry.key().starts_with(prefix))
            .map(|entry| entry.key().clone())
            .collect();

        for key in keys_to_remove {
            self.cache.remove(&key);
        }
    }

    /// Clear all cached values
    pub fn clear(&self) {
        self.cache.clear();
    }

    /// Evict expired entries
    pub fn evict_expired(&self) {
        let keys_to_remove: Vec<_> = self
            .cache
            .iter()
            .filter(|entry| entry.is_expired())
            .map(|entry| entry.key().clone())
            .collect();

        for key in keys_to_remove {
            self.cache.remove(&key);
        }
    }

    /// Evict oldest entry
    fn evict_oldest(&self) {
        let oldest = self.cache.iter().min_by_key(|entry| entry.created_at);

        if let Some(entry) = oldest {
            let key = entry.key().clone();
            drop(entry);
            self.cache.remove(&key);
        }
    }

    /// Get cache size
    #[must_use]
    pub fn len(&self) -> usize {
        self.cache.len()
    }

    /// Check if cache is empty
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.cache.is_empty()
    }

    /// Get cache statistics
    #[must_use]
    pub fn stats(&self) -> CacheStats {
        let total = self.cache.len();
        let mut expired = 0;

        for entry in &self.cache {
            if entry.is_expired() {
                expired += 1;
            }
        }

        CacheStats {
            total_entries: total,
            expired_entries: expired,
            max_entries: self.max_entries,
            default_ttl_secs: self.default_ttl.as_secs(),
        }
    }

    /// Invalidate resources by kind
    pub fn invalidate_kind(&self, kind: &str) {
        self.remove_prefix(&format!("{kind}:"));
    }

    /// Invalidate resources by namespace
    pub fn invalidate_namespace(&self, namespace: &str) {
        let keys_to_remove: Vec<_> = self
            .cache
            .iter()
            .filter(|entry| entry.key().contains(&format!(":{namespace}:")))
            .map(|entry| entry.key().clone())
            .collect();

        for key in keys_to_remove {
            self.cache.remove(&key);
        }
    }
}

/// Cache statistics
#[derive(Debug, Clone, Serialize)]
pub struct CacheStats {
    pub total_entries: usize,
    pub expired_entries: usize,
    pub max_entries: usize,
    pub default_ttl_secs: u64,
}

/// Debouncer for API requests
pub struct Debouncer {
    last_call: RwLock<Option<Instant>>,
    delay: Duration,
}

impl Debouncer {
    /// Create a new debouncer with the specified delay
    #[must_use]
    pub fn new(delay_ms: u64) -> Self {
        Self {
            last_call: RwLock::new(None),
            delay: Duration::from_millis(delay_ms),
        }
    }

    /// Check if the action should be executed
    pub fn should_execute(&self) -> bool {
        let mut last = self.last_call.write();

        if let Some(last_time) = *last {
            if last_time.elapsed() < self.delay {
                return false;
            }
        }

        *last = Some(Instant::now());
        true
    }

    /// Reset the debouncer
    pub fn reset(&self) {
        *self.last_call.write() = None;
    }
}

/// Rate limiter for API requests
pub struct RateLimiter {
    /// Request count in current window
    count: RwLock<u32>,
    /// Window start time
    window_start: RwLock<Instant>,
    /// Maximum requests per window
    max_requests: u32,
    /// Window duration
    window: Duration,
}

impl RateLimiter {
    /// Create a new rate limiter
    #[must_use]
    pub fn new(max_requests: u32, window_seconds: u64) -> Self {
        Self {
            count: RwLock::new(0),
            window_start: RwLock::new(Instant::now()),
            max_requests,
            window: Duration::from_secs(window_seconds),
        }
    }

    /// Check if request is allowed
    pub fn allow(&self) -> bool {
        let mut count = self.count.write();
        let mut start = self.window_start.write();

        // Check if window has expired
        if start.elapsed() >= self.window {
            *start = Instant::now();
            *count = 1;
            return true;
        }

        // Check if under limit
        if *count < self.max_requests {
            *count += 1;
            return true;
        }

        false
    }

    /// Get remaining requests in current window
    pub fn remaining(&self) -> u32 {
        let count = self.count.read();
        let start = self.window_start.read();

        if start.elapsed() >= self.window {
            self.max_requests
        } else {
            self.max_requests.saturating_sub(*count)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_basic() {
        let cache = ResourceCache::new(60);

        cache.set("test", serde_json::json!({"foo": "bar"}));

        let value = cache.get("test").unwrap();
        assert_eq!(value["foo"], "bar");
    }

    #[test]
    fn test_cache_key_generation() {
        let key = ResourceCache::resource_key("Pod", Some("default"), Some("nginx"));
        assert_eq!(key, "Pod:default:nginx");

        let key = ResourceCache::resource_key("Namespace", None, Some("default"));
        assert_eq!(key, "Namespace::default");
    }

    #[test]
    fn test_debouncer() {
        let debouncer = Debouncer::new(100);

        assert!(debouncer.should_execute());
        assert!(!debouncer.should_execute());

        std::thread::sleep(Duration::from_millis(150));
        assert!(debouncer.should_execute());
    }

    #[test]
    fn test_rate_limiter() {
        let limiter = RateLimiter::new(3, 1);

        assert!(limiter.allow());
        assert!(limiter.allow());
        assert!(limiter.allow());
        assert!(!limiter.allow()); // Should be blocked

        assert_eq!(limiter.remaining(), 0);
    }
}
