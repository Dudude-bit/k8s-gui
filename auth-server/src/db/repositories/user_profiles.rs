use crate::db::entities::user_profiles;
use chrono::Utc;
use sea_orm::entity::prelude::DateTimeWithTimeZone;
use sea_orm::{
    ActiveModelTrait, DatabaseConnection, DbErr, EntityTrait, IntoActiveModel, Set,
};
use uuid::Uuid;

pub async fn find_by_user_id(
    db: &DatabaseConnection,
    user_id: Uuid,
) -> Result<Option<user_profiles::Model>, DbErr> {
    user_profiles::Entity::find_by_id(user_id).one(db).await
}

pub async fn create(
    db: &DatabaseConnection,
    user_id: Uuid,
    first_name: Option<String>,
    last_name: Option<String>,
    company: Option<String>,
) -> Result<user_profiles::Model, DbErr> {
    let now: DateTimeWithTimeZone = Utc::now().into();
    let profile = user_profiles::ActiveModel {
        user_id: Set(user_id),
        first_name: Set(first_name),
        last_name: Set(last_name),
        company: Set(company),
        created_at: Set(now),
        updated_at: Set(now),
    };

    profile.insert(db).await
}

pub async fn update(
    db: &DatabaseConnection,
    user_id: Uuid,
    first_name: Option<String>,
    last_name: Option<String>,
    company: Option<String>,
) -> Result<user_profiles::Model, DbErr> {
    let profile = user_profiles::Entity::find_by_id(user_id).one(db).await?;
    let Some(profile) = profile else {
        return Err(DbErr::RecordNotFound("user profile not found".to_string()));
    };

    let mut profile: user_profiles::ActiveModel = profile.into_active_model();
    profile.first_name = Set(first_name);
    profile.last_name = Set(last_name);
    profile.company = Set(company);
    profile.updated_at = Set(Utc::now().into());

    profile.update(db).await
}
