//! SeaORM entity definitions (generated) with local extensions.

#[allow(unused_imports)]
pub mod generated;
mod extensions;

#[allow(unused_imports)]
pub use generated::*;
pub use generated::licenses::Model as License;
pub use generated::payments::Model as Payment;
pub use generated::sea_orm_active_enums::{PaymentStatus, SubscriptionType};
