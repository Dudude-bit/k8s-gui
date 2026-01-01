use sea_orm_migration::prelude::*;
use sea_orm_migration::prelude::extension::postgres::Type;
use sea_orm_migration::sea_orm::{ConnectionTrait, Statement};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let backend = manager.get_database_backend();
        manager
            .get_connection()
            .execute(Statement::from_string(
                backend,
                "CREATE EXTENSION IF NOT EXISTS pgcrypto",
            ))
            .await?;

        manager
            .create_type(
                Type::create()
                    .as_enum(SubscriptionType::Table)
                    .values([SubscriptionType::Monthly, SubscriptionType::Infinite])
                    .to_owned(),
            )
            .await?;

        manager
            .create_type(
                Type::create()
                    .as_enum(PaymentStatus::Table)
                    .values([
                        PaymentStatus::Pending,
                        PaymentStatus::Completed,
                        PaymentStatus::Failed,
                        PaymentStatus::Refunded,
                    ])
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Users::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Users::Id)
                            .uuid()
                            .not_null()
                            .default(Expr::cust("gen_random_uuid()"))
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Users::Email)
                            .string_len(255)
                            .not_null()
                            .unique_key(),
                    )
                    .col(ColumnDef::new(Users::PasswordHash).string_len(255).not_null())
                    .col(
                        ColumnDef::new(Users::EmailVerified)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(Users::FailedLoginAttempts)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(ColumnDef::new(Users::LockedUntil).timestamp_with_time_zone())
                    .col(
                        ColumnDef::new(Users::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .col(
                        ColumnDef::new(Users::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(UserProfiles::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(UserProfiles::UserId)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(UserProfiles::FirstName).string_len(100))
                    .col(ColumnDef::new(UserProfiles::LastName).string_len(100))
                    .col(ColumnDef::new(UserProfiles::Company).string_len(255))
                    .col(
                        ColumnDef::new(UserProfiles::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .col(
                        ColumnDef::new(UserProfiles::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_user_profiles_user")
                            .from(UserProfiles::Table, UserProfiles::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Licenses::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Licenses::Id)
                            .uuid()
                            .not_null()
                            .default(Expr::cust("gen_random_uuid()"))
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Licenses::UserId).uuid().not_null())
                    .col(
                        ColumnDef::new(Licenses::LicenseKey)
                            .string_len(255)
                            .not_null()
                            .unique_key(),
                    )
                    .col(
                        ColumnDef::new(Licenses::SubscriptionType)
                            .enumeration(
                                SubscriptionType::Table,
                                [SubscriptionType::Monthly, SubscriptionType::Infinite],
                            )
                            .not_null(),
                    )
                    .col(ColumnDef::new(Licenses::ExpiresAt).timestamp_with_time_zone())
                    .col(
                        ColumnDef::new(Licenses::IsActive)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .col(
                        ColumnDef::new(Licenses::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .col(
                        ColumnDef::new(Licenses::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_licenses_user")
                            .from(Licenses::Table, Licenses::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .check(Expr::cust(
                        "(subscription_type = 'infinite' AND expires_at IS NULL) \
                        OR (subscription_type = 'monthly' AND expires_at IS NOT NULL)",
                    ))
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Payments::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Payments::Id)
                            .uuid()
                            .not_null()
                            .default(Expr::cust("gen_random_uuid()"))
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Payments::UserId).uuid().not_null())
                    .col(ColumnDef::new(Payments::LicenseId).uuid())
                    .col(
                        ColumnDef::new(Payments::Amount)
                            .decimal_len(10, 2)
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Payments::Currency)
                            .string_len(3)
                            .not_null()
                            .default("USD"),
                    )
                    .col(
                        ColumnDef::new(Payments::PaymentStatus)
                            .enumeration(
                                PaymentStatus::Table,
                                [
                                    PaymentStatus::Pending,
                                    PaymentStatus::Completed,
                                    PaymentStatus::Failed,
                                    PaymentStatus::Refunded,
                                ],
                            )
                            .not_null()
                            .default("pending"),
                    )
                    .col(ColumnDef::new(Payments::TransactionId).string_len(255).unique_key())
                    .col(ColumnDef::new(Payments::PaymentProvider).string_len(50))
                    .col(
                        ColumnDef::new(Payments::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_payments_user")
                            .from(Payments::Table, Payments::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_payments_license")
                            .from(Payments::Table, Payments::LicenseId)
                            .to(Licenses::Table, Licenses::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(RefreshTokens::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(RefreshTokens::Id)
                            .uuid()
                            .not_null()
                            .default(Expr::cust("gen_random_uuid()"))
                            .primary_key(),
                    )
                    .col(ColumnDef::new(RefreshTokens::UserId).uuid().not_null())
                    .col(ColumnDef::new(RefreshTokens::TokenHash).string_len(255).not_null())
                    .col(
                        ColumnDef::new(RefreshTokens::ExpiresAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(RefreshTokens::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::cust("CURRENT_TIMESTAMP")),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_refresh_tokens_user")
                            .from(RefreshTokens::Table, RefreshTokens::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_users_email")
                    .table(Users::Table)
                    .col(Users::Email)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_licenses_user_id")
                    .table(Licenses::Table)
                    .col(Licenses::UserId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_licenses_license_key")
                    .table(Licenses::Table)
                    .col(Licenses::LicenseKey)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_licenses_active")
                    .table(Licenses::Table)
                    .col(Licenses::IsActive)
                    .col(Licenses::ExpiresAt)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_payments_user_id")
                    .table(Payments::Table)
                    .col(Payments::UserId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_payments_license_id")
                    .table(Payments::Table)
                    .col(Payments::LicenseId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_payments_transaction_id")
                    .table(Payments::Table)
                    .col(Payments::TransactionId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_payments_status")
                    .table(Payments::Table)
                    .col(Payments::PaymentStatus)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_payments_created_at")
                    .table(Payments::Table)
                    .col(Payments::CreatedAt)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_payments_user_created")
                    .table(Payments::Table)
                    .col(Payments::UserId)
                    .col((Payments::CreatedAt, IndexOrder::Desc))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_refresh_tokens_user_id")
                    .table(RefreshTokens::Table)
                    .col(RefreshTokens::UserId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_refresh_tokens_expires_at")
                    .table(RefreshTokens::Table)
                    .col(RefreshTokens::ExpiresAt)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_refresh_tokens_token_hash")
                    .table(RefreshTokens::Table)
                    .col(RefreshTokens::TokenHash)
                    .to_owned(),
            )
            .await?;

        manager
            .get_connection()
            .execute(Statement::from_string(
                backend,
                "CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until) \
                 WHERE locked_until IS NOT NULL",
            ))
            .await?;
        manager
            .get_connection()
            .execute(Statement::from_string(
                backend,
                "CREATE INDEX IF NOT EXISTS idx_licenses_expires_at ON licenses(expires_at) \
                 WHERE expires_at IS NOT NULL",
            ))
            .await?;
        manager
            .get_connection()
            .execute(Statement::from_string(
                backend,
                "CREATE INDEX IF NOT EXISTS idx_licenses_user_active_expires \
                 ON licenses(user_id, is_active, expires_at) WHERE is_active = TRUE",
            ))
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(RefreshTokens::Table).if_exists().to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Payments::Table).if_exists().to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Licenses::Table).if_exists().to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(UserProfiles::Table).if_exists().to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Users::Table).if_exists().to_owned())
            .await?;

        manager
            .drop_type(Type::drop().name(PaymentStatus::Table).if_exists().to_owned())
            .await?;
        manager
            .drop_type(
                Type::drop()
                    .name(SubscriptionType::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(Iden)]
enum Users {
    Table,
    Id,
    Email,
    PasswordHash,
    EmailVerified,
    FailedLoginAttempts,
    LockedUntil,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum UserProfiles {
    Table,
    UserId,
    FirstName,
    LastName,
    Company,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum Licenses {
    Table,
    Id,
    UserId,
    LicenseKey,
    SubscriptionType,
    ExpiresAt,
    IsActive,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum Payments {
    Table,
    Id,
    UserId,
    LicenseId,
    Amount,
    Currency,
    PaymentStatus,
    TransactionId,
    PaymentProvider,
    CreatedAt,
}

#[derive(Iden)]
enum RefreshTokens {
    Table,
    Id,
    UserId,
    TokenHash,
    ExpiresAt,
    CreatedAt,
}

#[derive(Iden)]
enum SubscriptionType {
    Table,
    Monthly,
    Infinite,
}

#[derive(Iden)]
enum PaymentStatus {
    Table,
    Pending,
    Completed,
    Failed,
    Refunded,
}
