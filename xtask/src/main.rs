use anyhow::{bail, Context, Result};
use sea_orm_codegen::{
    DateTimeCrate as CodegenDateTimeCrate, EntityTransformer, EntityWriterContext, OutputFile,
    WithSerde,
};
use sea_orm_migration::sea_orm::Database;
use sea_orm_migration::MigratorTrait;
use sea_schema::postgres::discovery::SchemaDiscovery;
use sqlx::{postgres::PgPoolOptions, Executor, Pool, Postgres};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use testcontainers::{runners::AsyncRunner, ImageExt};
use testcontainers_modules::postgres::Postgres as TcPostgres;
use tokio::time::{sleep, Instant};
use url::Url;

#[tokio::main]
async fn main() -> Result<()> {
    let mut args = env::args().skip(1);
    match args.next().as_deref() {
        Some("gen-entities") => gen_entities().await,
        _ => {
            eprintln!(
                "Usage: cargo run -p xtask -- gen-entities\n\
                 \n\
                 Environment overrides:\n\
                 - POSTGRES_IMAGE (optional, e.g. postgres:16)\n\
                 - RUSTFMT (optional, e.g. \"rustup run nightly rustfmt\")"
            );
            Ok(())
        }
    }
}

async fn gen_entities() -> Result<()> {
    let workspace_root = workspace_root()?;
    let output_dir = workspace_root
        .join("auth-server")
        .join("src")
        .join("db")
        .join("entities")
        .join("generated");

    let image_override = env::var("POSTGRES_IMAGE").ok();
    let schema = "public".to_string();

    let container = if let Some(image_override) = image_override {
        let (image_name, image_tag) = parse_image(&image_override)?;
        TcPostgres::default()
            .with_name(image_name)
            .with_tag(image_tag)
            .start()
            .await
            .context("failed to start postgres container")?
    } else {
        TcPostgres::default()
            .start()
            .await
            .context("failed to start postgres container")?
    };
    let port = container
        .get_host_port_ipv4(5432)
        .await
        .context("failed to resolve postgres port")?;
    let host = container
        .get_host()
        .await
        .context("failed to resolve postgres host")?;
    let database_url = format!("postgresql://postgres:postgres@{host}:{port}/postgres");

    wait_for_db(&database_url).await?;
    apply_migrations(&database_url).await?;
    generate_entities(&database_url, &schema, &output_dir).await?;

    println!("Entities generated at {}", output_dir.display());
    Ok(())
}

fn workspace_root() -> Result<PathBuf> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    dir.parent()
        .context("xtask should live one level below workspace root")
        .map(|path| path.to_path_buf())
}

fn parse_image(image: &str) -> Result<(String, String)> {
    if image.trim().is_empty() {
        bail!("POSTGRES_IMAGE is empty");
    }
    if image.contains('@') {
        bail!("POSTGRES_IMAGE must use name:tag (digests are not supported)");
    }

    let last_slash = image.rfind('/');
    let last_colon = image.rfind(':');
    let has_tag = match (last_slash, last_colon) {
        (_, None) => false,
        (None, Some(_)) => true,
        (Some(slash), Some(colon)) => colon > slash,
    };

    if has_tag {
        let (name, tag) = image
            .rsplit_once(':')
            .context("failed to parse POSTGRES_IMAGE tag")?;
        if name.trim().is_empty() || tag.trim().is_empty() {
            bail!("POSTGRES_IMAGE must include a non-empty name and tag");
        }
        Ok((name.to_string(), tag.to_string()))
    } else {
        Ok((image.to_string(), "latest".to_string()))
    }
}

async fn wait_for_db(database_url: &str) -> Result<()> {
    let start = Instant::now();
    loop {
        match PgPoolOptions::new()
            .max_connections(1)
            .connect(database_url)
            .await
        {
            Ok(pool) => {
                pool.close().await;
                return Ok(());
            }
            Err(err) => {
                if start.elapsed() > Duration::from_secs(30) {
                    return Err(err).context("database did not become ready in time");
                }
                sleep(Duration::from_millis(300)).await;
            }
        }
    }
}

async fn apply_migrations(database_url: &str) -> Result<()> {
    let db = Database::connect(database_url)
        .await
        .context("failed to connect to database for migrations")?;
    auth_server_migration::Migrator::up(&db, None)
        .await
        .context("failed to apply migrations")?;
    Ok(())
}

async fn generate_entities(database_url: &str, schema: &str, output_dir: &Path) -> Result<()> {
    let url = Url::parse(database_url).context("database url is not valid")?;
    if !matches!(url.scheme(), "postgres" | "postgresql") {
        bail!("only postgres is supported for generation");
    }

    let pool = connect_postgres(database_url, schema).await?;
    let schema_discovery = SchemaDiscovery::new(pool, schema);
    let schema = schema_discovery
        .discover()
        .await
        .context("failed to discover database schema")?;
    let table_stmts = schema
        .tables
        .into_iter()
        .filter(|table| table.info.name != "seaql_migrations")
        .map(|table| table.write())
        .collect::<Vec<_>>();

    let writer_context = EntityWriterContext::new(
        false,
        WithSerde::None,
        false,
        CodegenDateTimeCrate::Chrono,
        Some(schema.schema),
        false,
        false,
        false,
        vec![],
        vec![],
        vec![],
        vec![],
        false,
    );

    let output = EntityTransformer::transform(table_stmts)
        .context("failed to transform schema")?
        .generate(&writer_context);

    if output_dir.exists() {
        fs::remove_dir_all(output_dir).context("failed to clear output dir")?;
    }
    fs::create_dir_all(output_dir).context("failed to create output dir")?;

    for OutputFile { name, content } in output.files.iter() {
        let file_path = output_dir.join(name);
        fs::write(&file_path, content).context("failed to write entity file")?;
    }

    for OutputFile { name, .. } in output.files.iter() {
        let file_path = output_dir.join(name);
        let rustfmt_cmd = rustfmt_command();
        let (program, args) = rustfmt_cmd
            .split_first()
            .context("RUSTFMT must not be empty")?;
        let status = Command::new(program).args(args).arg(&file_path).status();
        if let Ok(status) = status {
            if !status.success() {
                bail!("rustfmt failed for {}", file_path.display());
            }
        } else {
            bail!("rustfmt not available in PATH");
        }
    }

    Ok(())
}

fn rustfmt_command() -> Vec<String> {
    match env::var("RUSTFMT") {
        Ok(value) => {
            let parts = value
                .split_whitespace()
                .map(|part| part.to_string())
                .collect::<Vec<_>>();
            if parts.is_empty() {
                vec!["rustfmt".to_string()]
            } else {
                parts
            }
        }
        Err(_) => vec!["rustfmt".to_string()],
    }
}

async fn connect_postgres(database_url: &str, schema: &str) -> Result<Pool<Postgres>> {
    let schema = schema.to_string();
    let options = PgPoolOptions::new()
        .max_connections(5)
        .after_connect(move |conn, _| {
            let schema = schema.clone();
            Box::pin(async move {
                let sql = format!("SET search_path = '{schema}'");
                conn.execute(sql.as_str()).await.map(|_| ())
            })
        });
    let pool = options
        .connect(database_url)
        .await
        .context("failed to connect to database for codegen")?;
    Ok(pool)
}
