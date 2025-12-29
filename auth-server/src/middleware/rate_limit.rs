//! Rate limiting middleware

use actix_web::{dev::ServiceRequest, Error, HttpMessage};
use actix_web::body::MessageBody;
use actix_web::dev::{Service, ServiceResponse, Transform};
use dashmap::DashMap;
use std::future::{ready, Ready};
use std::pin::Pin;
use std::rc::Rc;
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Clone)]
pub struct RateLimiter {
    requests: Arc<DashMap<String, Vec<Instant>>>,
    max_requests: u32,
    window_seconds: u64,
}

impl RateLimiter {
    pub fn new(max_requests: u32, window_seconds: u64) -> Self {
        Self {
            requests: Arc::new(DashMap::new()),
            max_requests,
            window_seconds,
        }
    }

    pub fn check_rate_limit(&self, key: &str) -> bool {
        let now = Instant::now();
        let window = Duration::from_secs(self.window_seconds);

        // Clean up old entries
        let mut entries = self.requests.entry(key.to_string()).or_insert_with(Vec::new);
        entries.retain(|&time| now.duration_since(time) < window);

        if entries.len() >= self.max_requests as usize {
            return false;
        }

        entries.push(now);
        true
    }
}

pub struct RateLimitMiddleware {
    limiter: RateLimiter,
}

impl RateLimitMiddleware {
    pub fn new(max_requests: u32, window_seconds: u64) -> Self {
        Self {
            limiter: RateLimiter::new(max_requests, window_seconds),
        }
    }
}

impl<S, B> Transform<S, ServiceRequest> for RateLimitMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = RateLimitService<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(RateLimitService {
            service: Rc::new(service),
            limiter: self.limiter.clone(),
        }))
    }
}

pub struct RateLimitService<S> {
    service: Rc<S>,
    limiter: RateLimiter,
}

impl<S, B> Service<ServiceRequest> for RateLimitService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = Pin<Box<dyn std::future::Future<Output = Result<Self::Response, Self::Error>>>>;

    actix_web::dev::forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = self.service.clone();
        let limiter = self.limiter.clone();

        // Get IP address from request
        // Check X-Forwarded-For header first (for reverse proxy scenarios)
        // then fall back to peer address
        let ip = req.headers()
            .get("X-Forwarded-For")
            .and_then(|h| h.to_str().ok())
            .and_then(|s| s.split(',').next()) // Take first IP in chain
            .map(|s| s.trim().to_string())
            .or_else(|| {
                req.connection_info().peer_addr().map(|s| s.to_string())
            })
            .unwrap_or_else(|| "unknown".to_string());

        // Check rate limit
        if !limiter.check_rate_limit(&ip) {
            return Box::pin(async move {
                Err(actix_web::error::ErrorTooManyRequests("Rate limit exceeded"))
            });
        }

        let fut = service.call(req);
        Box::pin(async move {
            fut.await
        })
    }
}

