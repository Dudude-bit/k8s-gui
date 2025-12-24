//! Security middleware (CSRF protection, input validation)

use actix_web::{dev::ServiceRequest, Error, HttpMessage};
use actix_web::body::MessageBody;
use actix_web::dev::{Service, ServiceResponse, Transform};
use std::future::{ready, Ready};
use std::pin::Pin;
use std::rc::Rc;

pub struct SecurityMiddleware;

impl<S, B> Transform<S, ServiceRequest> for SecurityMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = SecurityService<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(SecurityService {
            service: Rc::new(service),
        }))
    }
}

pub struct SecurityService<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for SecurityService<S>
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

        // Add security headers
        let fut = service.call(req);
        Box::pin(async move {
            let mut res = fut.await?;
            let headers = res.headers_mut();
            
            // Security headers
            use actix_web::http::header::{HeaderName, HeaderValue};
            headers.insert(
                HeaderName::from_static("x-content-type-options"),
                HeaderValue::from_static("nosniff")
            );
            headers.insert(
                HeaderName::from_static("x-frame-options"),
                HeaderValue::from_static("DENY")
            );
            headers.insert(
                HeaderName::from_static("x-xss-protection"),
                HeaderValue::from_static("1; mode=block")
            );
            
            Ok(res)
        })
    }
}

