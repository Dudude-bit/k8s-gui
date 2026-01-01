use crate::db::entities::payments;
use crate::db::entities::sea_orm_active_enums::PaymentStatus;
use chrono::Utc;
use sea_orm::entity::prelude::{DateTimeWithTimeZone, Decimal};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, DbErr, EntityTrait, PaginatorTrait,
    QueryFilter, QueryOrder, QuerySelect, Set,
};
use uuid::Uuid;

pub async fn find_by_user_id(
    db: &DatabaseConnection,
    user_id: Uuid,
    limit: i64,
    offset: i64,
) -> Result<Vec<payments::Model>, DbErr> {
    payments::Entity::find()
        .filter(payments::Column::UserId.eq(user_id))
        .order_by_desc(payments::Column::CreatedAt)
        .limit(limit.max(0) as u64)
        .offset(offset.max(0) as u64)
        .all(db)
        .await
}

pub async fn count_by_user_id(db: &DatabaseConnection, user_id: Uuid) -> Result<i64, DbErr> {
    let total = payments::Entity::find()
        .filter(payments::Column::UserId.eq(user_id))
        .count(db)
        .await?;
    Ok(total as i64)
}

#[allow(clippy::too_many_arguments)]
pub async fn create(
    db: &DatabaseConnection,
    user_id: Uuid,
    license_id: Option<Uuid>,
    amount: Decimal,
    currency: &str,
    status: PaymentStatus,
    transaction_id: Option<String>,
    payment_provider: Option<String>,
) -> Result<payments::Model, DbErr> {
    let now: DateTimeWithTimeZone = Utc::now().into();
    let payment = payments::ActiveModel {
        user_id: Set(user_id),
        license_id: Set(license_id),
        amount: Set(amount),
        currency: Set(currency.to_string()),
        payment_status: Set(status),
        transaction_id: Set(transaction_id),
        payment_provider: Set(payment_provider),
        created_at: Set(now),
        ..Default::default()
    };

    payment.insert(db).await
}

pub async fn find_by_transaction_id(
    db: &DatabaseConnection,
    transaction_id: &str,
) -> Result<Option<payments::Model>, DbErr> {
    payments::Entity::find()
        .filter(payments::Column::TransactionId.eq(transaction_id))
        .one(db)
        .await
}
