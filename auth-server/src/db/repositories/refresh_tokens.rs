use crate::db::entities::refresh_tokens;
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, DbErr, EntityTrait,
    QueryFilter, Set, Statement,
};
use uuid::Uuid;

pub async fn create(
    db: &DatabaseConnection,
    user_id: Uuid,
    token_hash: String,
    expires_at: chrono::DateTime<chrono::Utc>,
) -> Result<refresh_tokens::Model, DbErr> {
    let token = refresh_tokens::ActiveModel {
        user_id: Set(user_id),
        token_hash: Set(token_hash),
        expires_at: Set(expires_at),
        created_at: Set(Utc::now()),
        ..Default::default()
    };

    token.insert(db).await
}

pub async fn delete(db: &DatabaseConnection, token_hash: &str) -> Result<(), DbErr> {
    refresh_tokens::Entity::delete_many()
        .filter(refresh_tokens::Column::TokenHash.eq(token_hash))
        .exec(db)
        .await?;
    Ok(())
}

pub async fn consume(
    db: &DatabaseConnection,
    token_hash: &str,
) -> Result<Option<Uuid>, DbErr> {
    let stmt = Statement::from_sql_and_values(
        db.get_database_backend(),
        "DELETE FROM refresh_tokens WHERE token_hash = $1 RETURNING user_id",
        [token_hash.into()],
    );

    let result = db.query_one(stmt).await?;
    let Some(row) = result else {
        return Ok(None);
    };

    let user_id: Uuid = row.try_get("", "user_id")?;
    Ok(Some(user_id))
}

pub async fn delete_all_for_user(
    db: &DatabaseConnection,
    user_id: Uuid,
) -> Result<i64, DbErr> {
    let result = refresh_tokens::Entity::delete_many()
        .filter(refresh_tokens::Column::UserId.eq(user_id))
        .exec(db)
        .await?;
    Ok(result.rows_affected as i64)
}

pub async fn cleanup_expired(db: &DatabaseConnection) -> Result<i64, DbErr> {
    let result = refresh_tokens::Entity::delete_many()
        .filter(refresh_tokens::Column::ExpiresAt.lt(Utc::now()))
        .exec(db)
        .await?;
    Ok(result.rows_affected as i64)
}
