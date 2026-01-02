use super::sea_orm_active_enums::{PaymentStatus, SubscriptionType};

impl std::fmt::Display for SubscriptionType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let value = match self {
            SubscriptionType::Monthly => "monthly",
            SubscriptionType::Lifetime => "lifetime",
        };
        f.write_str(value)
    }
}

impl std::fmt::Display for PaymentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let value = match self {
            PaymentStatus::Pending => "pending",
            PaymentStatus::Completed => "completed",
            PaymentStatus::Failed => "failed",
            PaymentStatus::Refunded => "refunded",
        };
        f.write_str(value)
    }
}
