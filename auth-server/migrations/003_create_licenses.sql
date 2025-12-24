-- Create subscription_type enum
CREATE TYPE subscription_type AS ENUM ('monthly', 'infinite');

-- Create licenses table
CREATE TABLE IF NOT EXISTS licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    license_key VARCHAR(255) UNIQUE NOT NULL,
    subscription_type subscription_type NOT NULL,
    expires_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_infinite_no_expiry CHECK (
        (subscription_type = 'infinite' AND expires_at IS NULL) OR
        (subscription_type = 'monthly' AND expires_at IS NOT NULL)
    )
);

CREATE INDEX idx_licenses_user_id ON licenses(user_id);
CREATE INDEX idx_licenses_license_key ON licenses(license_key);
CREATE INDEX idx_licenses_expires_at ON licenses(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_licenses_active ON licenses(is_active, expires_at);

