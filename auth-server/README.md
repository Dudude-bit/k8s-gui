# Authentication and Licensing Server

REST API server for user authentication, license management, and payment tracking for K8s GUI application.

## Features

- User registration and authentication with JWT tokens
- Password hashing using Argon2
- License management (monthly and infinite subscriptions)
- Payment history tracking
- Security features:
  - Rate limiting to prevent brute-force attacks
  - SQL injection protection via prepared statements
  - CORS and security headers
  - Audit logging for security events

## Prerequisites

- Rust 1.70+ 
- PostgreSQL 12+
- sqlx-cli (for database migrations)

## Setup

1. Install dependencies:
```bash
cargo install sqlx-cli
```

2. Create PostgreSQL database:
```bash
createdb k8s_gui_auth
```

3. Copy environment file:
```bash
cp .env.example .env
```

4. Update `.env` with your database credentials and configuration.

5. Run database migrations:
```bash
# Set DATABASE_URL environment variable
export DATABASE_URL=postgresql://user:password@localhost/k8s_gui_auth

# Run migrations
for migration in migrations/*.sql; do
    psql $DATABASE_URL < $migration
done
```

Or use sqlx-cli:
```bash
sqlx migrate run
```

6. Generate JWT secret (optional, will be auto-generated if not set):
```bash
# Generate a secure random secret
openssl rand -base64 64
```

7. Run the server:
```bash
cargo run
```

The server will start on `http://127.0.0.1:8080` by default.

## API Endpoints

### Authentication

- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout user
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password

### User Profile

- `GET /api/v1/user/profile` - Get user profile (requires auth)
- `PUT /api/v1/user/profile` - Update user profile (requires auth)

### License Management

- `GET /api/v1/license/status` - Get license status (requires auth)
- `POST /api/v1/license/activate` - Activate license (requires auth)
- `GET /api/v1/license/validate?license_key=...` - Validate license key (public)

### Payments

- `GET /api/v1/payments/history` - Get payment history (requires auth)

## Database Schema

The database includes the following tables:

- `users` - User accounts
- `user_profiles` - User profile information
- `licenses` - License records (monthly/infinite)
- `payments` - Payment history
- `refresh_tokens` - JWT refresh tokens
- `audit_logs` - Security audit logs

See `migrations/` directory for full schema.

## Security

- **Password Hashing**: Argon2 with cost factor 10
- **Rate Limiting**: 5 login attempts per minute per IP
- **Account Locking**: Accounts locked for 15 minutes after 5 failed login attempts
- **SQL Injection Protection**: All queries use prepared statements via sqlx
- **CORS**: Configurable allowed origins
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection

## Development

Run tests:
```bash
cargo test
```

Run with logging:
```bash
RUST_LOG=debug cargo run
```

## Production Deployment

1. Set strong `JWT_SECRET` environment variable
2. Use HTTPS in production
3. Configure proper CORS origins
4. Set up database backups
5. Monitor audit logs for suspicious activity
6. Use a reverse proxy (nginx) for rate limiting and SSL termination

## License

MIT

