//! Rate limiting utilities
//!
//! This module provides thread-safe, in-memory rate limiting for API endpoints.
//! It uses DashMap for concurrent access and supports sliding window rate limiting.
//!
//! # Features
//!
//! - Configurable request limits per time window
//! - Per-key (e.g., per-IP) tracking
//! - Automatic cleanup of expired entries
//! - Pre-configured limiters for common endpoints (login, registration)

use dashmap::DashMap;
use std::time::{Duration, Instant};

/// Rate limiter configuration
#[derive(Debug, Clone)]
pub struct RateLimiterConfig {
    /// Maximum number of requests allowed in the window
    pub max_requests: u32,
    /// Time window duration
    pub window: Duration,
}

impl Default for RateLimiterConfig {
    fn default() -> Self {
        Self {
            max_requests: 5,
            window: Duration::from_secs(60), // 5 requests per minute
        }
    }
}

/// Entry for tracking rate limit state
#[derive(Debug, Clone)]
struct RateLimitEntry {
    count: u32,
    window_start: Instant,
}

/// Thread-safe rate limiter using DashMap
pub struct RateLimiter {
    entries: DashMap<String, RateLimitEntry>,
    config: RateLimiterConfig,
}

impl RateLimiter {
    pub fn new(config: RateLimiterConfig) -> Self {
        Self {
            entries: DashMap::new(),
            config,
        }
    }

    /// Check if a request from the given key should be allowed.
    /// Returns Ok(remaining) if allowed, Err(retry_after_secs) if rate limited.
    pub fn check(&self, key: &str) -> Result<u32, u64> {
        let now = Instant::now();

        let mut entry = self
            .entries
            .entry(key.to_string())
            .or_insert_with(|| RateLimitEntry {
                count: 0,
                window_start: now,
            });

        // Check if window has expired
        if now.duration_since(entry.window_start) >= self.config.window {
            // Reset the window
            entry.count = 1;
            entry.window_start = now;
            return Ok(self.config.max_requests - 1);
        }

        // Check if rate limit exceeded
        if entry.count >= self.config.max_requests {
            let elapsed = now.duration_since(entry.window_start);
            let retry_after = self.config.window.saturating_sub(elapsed);
            return Err(retry_after.as_secs() + 1); // +1 to ensure window has passed
        }

        // Increment counter and allow
        entry.count += 1;
        Ok(self.config.max_requests - entry.count)
    }

    /// Clean up expired entries to prevent memory leaks
    /// Should be called periodically
    pub fn cleanup(&self) {
        let now = Instant::now();
        self.entries
            .retain(|_, entry| now.duration_since(entry.window_start) < self.config.window * 2);
    }
}

/// Pre-configured rate limiters for different endpoints
pub struct RateLimiters {
    /// Rate limiter for login attempts (5 per minute per IP)
    pub login: RateLimiter,
    /// Rate limiter for registration (3 per minute per IP)
    pub register: RateLimiter,
}

impl Default for RateLimiters {
    fn default() -> Self {
        Self::new()
    }
}

impl RateLimiters {
    pub fn new() -> Self {
        Self {
            login: RateLimiter::new(RateLimiterConfig {
                max_requests: 5,
                window: Duration::from_secs(60), // 5 per minute
            }),
            register: RateLimiter::new(RateLimiterConfig {
                max_requests: 3,
                window: Duration::from_secs(60), // 3 per minute
            }),
        }
    }

    /// Clean up all rate limiters
    pub fn cleanup_all(&self) {
        self.login.cleanup();
        self.register.cleanup();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limiter_allows_within_limit() {
        let limiter = RateLimiter::new(RateLimiterConfig {
            max_requests: 3,
            window: Duration::from_secs(60),
        });

        assert!(limiter.check("test").is_ok());
        assert!(limiter.check("test").is_ok());
        assert!(limiter.check("test").is_ok());
    }

    #[test]
    fn test_rate_limiter_blocks_over_limit() {
        let limiter = RateLimiter::new(RateLimiterConfig {
            max_requests: 2,
            window: Duration::from_secs(60),
        });

        assert!(limiter.check("test").is_ok());
        assert!(limiter.check("test").is_ok());
        assert!(limiter.check("test").is_err());
    }

    #[test]
    fn test_rate_limiter_separate_keys() {
        let limiter = RateLimiter::new(RateLimiterConfig {
            max_requests: 1,
            window: Duration::from_secs(60),
        });

        assert!(limiter.check("key1").is_ok());
        assert!(limiter.check("key1").is_err());
        assert!(limiter.check("key2").is_ok()); // Different key, should be allowed
    }
}
