//! Log streaming module — parser, streamer, filter, types.
//!
//! Re-exports each submodule's public surface so `crate::logs::Foo`
//! continues to work for every existing caller. Tests live here so
//! they can exercise the integration across modules through a
//! single `super::*` import.

pub mod config;
pub mod filter;
pub mod parser;
pub mod streamer;
pub mod types;

pub use config::LogConfig;
pub use filter::LogFilter;
pub use streamer::LogStreamer;
pub use types::{LogFormat, LogLevel, LogLine};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_config_default() {
        let config = LogConfig::default();
        assert!(config.follow);
        assert_eq!(config.tail_lines, Some(100));
    }

    #[test]
    fn test_log_level_parse() {
        assert_eq!(LogLevel::parse("ERROR: something failed"), LogLevel::Error);
        assert_eq!(LogLevel::parse("INFO: started"), LogLevel::Info);
        assert_eq!(LogLevel::parse("random message"), LogLevel::Unknown);
    }

    #[test]
    fn test_log_filter() {
        let logs = vec![
            LogLine {
                timestamp: None,
                message: "ERROR: failed".to_string(),
                level: Some(LogLevel::Error),
                format: LogFormat::Plain,
                fields: None,
                raw: "ERROR: failed".to_string(),
                pod: "test".to_string(),
                container: "main".to_string(),
                namespace: "default".to_string(),
            },
            LogLine {
                timestamp: None,
                message: "INFO: success".to_string(),
                level: Some(LogLevel::Info),
                format: LogFormat::Plain,
                fields: None,
                raw: "INFO: success".to_string(),
                pod: "test".to_string(),
                container: "main".to_string(),
                namespace: "default".to_string(),
            },
        ];

        let filter = LogFilter {
            levels: vec![LogLevel::Error],
            ..Default::default()
        };

        let filtered = filter.apply(&logs);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].message, "ERROR: failed");
    }

    #[test]
    fn test_json_detection_requires_log_fields() {
        // Valid structured log — should detect as JSON
        let valid = r#"{"msg":"hello","level":"info"}"#;
        let (format, _, _, _) = parser::parse_structured_message(valid);
        assert_eq!(format, LogFormat::Json);

        // Arbitrary JSON without log fields — should NOT detect as JSON
        let arbitrary = r#"{"foo":"bar","count":42}"#;
        let (format, _, _, _) = parser::parse_structured_message(arbitrary);
        assert_eq!(format, LogFormat::Plain);
    }

    #[test]
    fn test_logfmt_detection_requires_multiple_pairs() {
        let valid = "level=info msg=\"user logged in\" user=john";
        let (format, _, _, _) = parser::parse_structured_message(valid);
        assert_eq!(format, LogFormat::Logfmt);

        let single = "port=8080";
        let (format, _, _, _) = parser::parse_structured_message(single);
        assert_eq!(format, LogFormat::Plain);

        let sentence = "Starting server port=8080";
        let (format, _, _, _) = parser::parse_structured_message(sentence);
        assert_eq!(format, LogFormat::Plain);

        let plain = "Error: x=5 is invalid";
        let (format, _, _, _) = parser::parse_structured_message(plain);
        assert_eq!(format, LogFormat::Plain);

        // Invalid keys (non-identifier characters) — should NOT detect
        let invalid_key = "foo:bar=value baz=123";
        let (format, _, _, _) = parser::parse_structured_message(invalid_key);
        assert_eq!(format, LogFormat::Plain);
    }

    #[test]
    fn test_plain_text_level_is_unknown() {
        // Plain text mentioning "error" should NOT be marked as Error level
        let line = "Processing error handler registration";
        let log = parser::parse_log_line(line, "pod", "container", "ns");
        assert_eq!(log.format, LogFormat::Plain);
        assert_eq!(log.level, Some(LogLevel::Unknown));

        let line2 = "This is a warning about disk space";
        let log2 = parser::parse_log_line(line2, "pod", "container", "ns");
        assert_eq!(log2.level, Some(LogLevel::Unknown));
    }
}
