use crate::db::entities::users;
use chrono::{Duration, Utc};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, DbErr, EntityTrait,
    QueryFilter, Set, Statement,
};
use uuid::Uuid;

const MAX_FAILED_LOGIN_ATTEMPTS: i32 = 5;
const LOCKOUT_MINUTES: i64 = 15;

pub async fn find_by_email(
    db: &DatabaseConnection,
    email: &str,
) -> Result<Option<users::Model>, DbErr> {
    users::Entity::find()
        .filter(users::Column::Email.eq(email))
        .one(db)
        .await
}

pub async fn find_by_id(
    db: &DatabaseConnection,
    user_id: Uuid,
) -> Result<Option<users::Model>, DbErr> {
    users::Entity::find_by_id(user_id).one(db).await
}

pub async fn create(
    db: &DatabaseConnection,
    email: &str,
    password_hash: &str,
) -> Result<users::Model, DbErr> {
    let now = Utc::now();
    let user = users::ActiveModel {
        email: Set(email.to_string()),
        password_hash: Set(password_hash.to_string()),
        email_verified: Set(false),
        failed_login_attempts: Set(0),
        locked_until: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    };

    user.insert(db).await
}

pub fn is_locked(user: &users::Model) -> bool {
    user.locked_until
        .map(|locked_until| locked_until > Utc::now())
        .unwrap_or(false)
}

pub async fn increment_failed_login_attempts(
    db: &DatabaseConnection,
    user_id: Uuid,
) -> Result<(), DbErr> {
    let now = Utc::now();
    let lock_until = now + Duration::minutes(LOCKOUT_MINUTES);
    let stmt = Statement::from_sql_and_values(
        db.get_database_backend(),
        "UPDATE users SET failed_login_attempts = failed_login_attempts + 1, \
         locked_until = CASE WHEN failed_login_attempts + 1 >= $1 THEN $2 ELSE locked_until END, \
         updated_at = $3 WHERE id = $4",
        [
            MAX_FAILED_LOGIN_ATTEMPTS.into(),
            lock_until.into(),
            now.into(),
            user_id.into(),
        ],
    );

    db.execute(stmt).await?;
    Ok(())
}

pub async fn reset_failed_login_attempts(
    db: &DatabaseConnection,
    user_id: Uuid,
) -> Result<(), DbErr> {
    let now = Utc::now();
    let stmt = Statement::from_sql_and_values(
        db.get_database_backend(),
        "UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = $1 \
         WHERE id = $2",
        [now.into(), user_id.into()],
    );

    db.execute(stmt).await?;
    Ok(())
}
