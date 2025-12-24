-- Additional indexes for performance optimization

-- Composite index for license validation queries
CREATE INDEX IF NOT EXISTS idx_licenses_user_active_expires 
    ON licenses(user_id, is_active, expires_at) 
    WHERE is_active = TRUE;

-- Composite index for user login queries
CREATE INDEX IF NOT EXISTS idx_users_email_active 
    ON users(email, locked_until) 
    WHERE locked_until IS NULL OR locked_until < CURRENT_TIMESTAMP;

-- Index for payment history queries
CREATE INDEX IF NOT EXISTS idx_payments_user_created 
    ON payments(user_id, created_at DESC);

-- Index for audit log queries by user and event type
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_event 
    ON audit_logs(user_id, event_type, created_at DESC);

