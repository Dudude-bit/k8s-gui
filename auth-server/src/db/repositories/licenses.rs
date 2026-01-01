use crate::db::entities::licenses;
use crate::db::entities::SubscriptionType;
use chrono::{Duration, Utc};
use sea_orm::entity::prelude::DateTimeWithTimeZone;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, DbErr, EntityTrait, IntoActiveModel,
    QueryFilter, QueryOrder, Set, TransactionTrait,
};
use sea_orm::prelude::Expr;
use uuid::Uuid;

pub fn is_valid(license: &licenses::Model) -> bool {
    if !license.is_active {
        return false;
    }

    let now: DateTimeWithTimeZone = Utc::now().into();
    match license.expires_at {
        Some(expires_at) => expires_at > now,
        None => true,
    }
}

pub fn masked_key(license: &licenses::Model) -> String {
    let key = license.license_key.as_str();
    if key.len() <= 12 {
        return "********".to_string();
    }

    let prefix = &key[..8];
    let suffix = &key[key.len() - 4..];
    format!("{prefix}...{suffix}")
}

pub async fn find_by_user_id(
    db: &DatabaseConnection,
    user_id: Uuid,
) -> Result<Option<licenses::Model>, DbErr> {
    licenses::Entity::find()
        .filter(licenses::Column::UserId.eq(user_id))
        .filter(licenses::Column::IsActive.eq(true))
        .order_by_desc(licenses::Column::UpdatedAt)
        .one(db)
        .await
}

pub async fn find_by_license_key(
    db: &DatabaseConnection,
    license_key: &str,
) -> Result<Option<licenses::Model>, DbErr> {
    licenses::Entity::find()
        .filter(licenses::Column::LicenseKey.eq(license_key))
        .one(db)
        .await
}

pub async fn create(
    db: &DatabaseConnection,
    user_id: Uuid,
    license_key: String,
    subscription_type: SubscriptionType,
    expires_at: Option<DateTimeWithTimeZone>,
) -> Result<licenses::Model, DbErr> {
    let now: DateTimeWithTimeZone = Utc::now().into();
    let expires_at = match subscription_type {
        SubscriptionType::Infinite => None,
        SubscriptionType::Monthly => expires_at,
    };

    let txn = db.begin().await?;
    licenses::Entity::update_many()
        .filter(licenses::Column::UserId.eq(user_id))
        .filter(licenses::Column::IsActive.eq(true))
        .col_expr(licenses::Column::IsActive, Expr::val(false).into())
        .col_expr(licenses::Column::UpdatedAt, Expr::val(now).into())
        .exec(&txn)
        .await?;

    let license = licenses::ActiveModel {
        user_id: Set(user_id),
        license_key: Set(license_key),
        subscription_type: Set(subscription_type),
        expires_at: Set(expires_at),
        is_active: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(&txn)
    .await?;

    txn.commit().await?;
    Ok(license)
}

pub async fn extend_monthly(
    db: &DatabaseConnection,
    license_id: Uuid,
    user_id: Uuid,
    months: i32,
) -> Result<licenses::Model, DbErr> {
    let license = licenses::Entity::find()
        .filter(licenses::Column::Id.eq(license_id))
        .filter(licenses::Column::UserId.eq(user_id))
        .one(db)
        .await?;

    let Some(license) = license else {
        return Err(DbErr::RecordNotFound("license not found".to_string()));
    };

    if matches!(license.subscription_type, SubscriptionType::Infinite) {
        return Ok(license);
    }

    let now: DateTimeWithTimeZone = Utc::now().into();
    let base = match license.expires_at {
        Some(expires_at) if expires_at > now => expires_at,
        _ => now,
    };
    let new_expires_at = base + Duration::days(30 * months as i64);

    let mut active: licenses::ActiveModel = license.into_active_model();
    active.expires_at = Set(Some(new_expires_at));
    active.is_active = Set(true);
    active.updated_at = Set(now);

    active.update(db).await
}

pub async fn activate_for_user(
    db: &DatabaseConnection,
    user_id: Uuid,
    license_id: Uuid,
    expires_at: Option<DateTimeWithTimeZone>,
) -> Result<licenses::Model, DbErr> {
    let now: DateTimeWithTimeZone = Utc::now().into();
    let txn = db.begin().await?;

    licenses::Entity::update_many()
        .filter(licenses::Column::UserId.eq(user_id))
        .filter(licenses::Column::Id.ne(license_id))
        .filter(licenses::Column::IsActive.eq(true))
        .col_expr(licenses::Column::IsActive, Expr::val(false).into())
        .col_expr(licenses::Column::UpdatedAt, Expr::val(now).into())
        .exec(&txn)
        .await?;

    let license = licenses::Entity::find()
        .filter(licenses::Column::Id.eq(license_id))
        .filter(licenses::Column::UserId.eq(user_id))
        .one(&txn)
        .await?;

    let Some(license) = license else {
        return Err(DbErr::RecordNotFound("license not found".to_string()));
    };

    let mut active: licenses::ActiveModel = license.into_active_model();
    active.is_active = Set(true);
    active.expires_at = Set(expires_at);
    active.updated_at = Set(now);

    let updated = active.update(&txn).await?;
    txn.commit().await?;
    Ok(updated)
}
