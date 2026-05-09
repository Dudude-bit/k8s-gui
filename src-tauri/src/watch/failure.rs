//! `FailureLatch` — the small state machine that decides whether the
//! watcher loop should emit a `Failed` op to the frontend.
//!
//! kube's runtime watcher retries on its own with backoff. We don't
//! want a single 503 from a stressed apiserver to show as "watch
//! failed, falling back to polling" in the UI — that flickers between
//! states. We do want a permanent denial (403 from a missing `watch`
//! verb) to surface so the UI can switch to periodic refresh.
//!
//! The compromise: emit `Failed` only after `THRESHOLD` consecutive
//! errors with no successful event between them, and only once per
//! streak. A successful event resets both the counter and the
//! emit-once latch, so a recovered stream is free to fail again later
//! and trigger another `Failed` event after another full streak.

const ERROR_THRESHOLD: u32 = 3;

/// State machine for the watcher's "should we emit Failed yet?" decision.
pub(super) struct FailureLatch {
    consecutive_errors: u32,
    emitted: bool,
}

impl FailureLatch {
    pub fn new() -> Self {
        Self {
            consecutive_errors: 0,
            emitted: false,
        }
    }

    /// Record a successful watch event. Resets the counter and clears
    /// the emit-once latch so a future failure streak can trigger a
    /// fresh `Failed`.
    pub fn record_success(&mut self) {
        self.consecutive_errors = 0;
        self.emitted = false;
    }

    /// Record a watch error. Returns `true` exactly once per failure
    /// streak — when the threshold is reached. Subsequent errors in
    /// the same streak return `false` to avoid spamming the UI.
    pub fn record_error(&mut self) -> bool {
        self.consecutive_errors += 1;
        if self.consecutive_errors >= ERROR_THRESHOLD && !self.emitted {
            self.emitted = true;
            true
        } else {
            false
        }
    }

    /// Current consecutive-error count. Used only by the spawn
    /// closure for tracing.
    pub fn consecutive_errors(&self) -> u32 {
        self.consecutive_errors
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn does_not_emit_below_threshold() {
        let mut latch = FailureLatch::new();
        assert!(!latch.record_error(), "1 error");
        assert!(!latch.record_error(), "2 errors");
    }

    #[test]
    fn emits_exactly_at_threshold() {
        let mut latch = FailureLatch::new();
        latch.record_error();
        latch.record_error();
        assert!(latch.record_error(), "third error must emit");
    }

    #[test]
    fn does_not_re_emit_within_same_streak() {
        let mut latch = FailureLatch::new();
        latch.record_error();
        latch.record_error();
        assert!(latch.record_error());
        assert!(!latch.record_error(), "fourth error must not re-emit");
        assert!(!latch.record_error(), "fifth error must not re-emit");
    }

    #[test]
    fn success_resets_counter_and_latch() {
        let mut latch = FailureLatch::new();
        latch.record_error();
        latch.record_error();
        assert!(latch.record_error(), "first streak emits");

        latch.record_success();

        assert!(!latch.record_error(), "1 error after recovery");
        assert!(!latch.record_error(), "2 errors after recovery");
        assert!(
            latch.record_error(),
            "3rd error after recovery must emit again"
        );
    }

    #[test]
    fn single_success_between_errors_resets_streak() {
        let mut latch = FailureLatch::new();
        latch.record_error();
        latch.record_error();
        // One success right before threshold should reset.
        latch.record_success();
        assert!(!latch.record_error(), "1 error after intermediate success");
        assert!(!latch.record_error(), "2 errors after intermediate success");
        assert!(latch.record_error(), "3rd must emit on fresh streak");
    }

    #[test]
    fn consecutive_errors_count_is_visible() {
        let mut latch = FailureLatch::new();
        assert_eq!(latch.consecutive_errors(), 0);
        latch.record_error();
        assert_eq!(latch.consecutive_errors(), 1);
        latch.record_error();
        assert_eq!(latch.consecutive_errors(), 2);
        latch.record_success();
        assert_eq!(latch.consecutive_errors(), 0);
    }
}
