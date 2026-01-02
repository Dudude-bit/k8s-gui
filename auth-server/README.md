# Authentication and Licensing Server

REST API server for user authentication, license management, and payment tracking for K8s GUI application.

## Features

- User registration and authentication with JWT tokens
- Password hashing using Argon2
- License management (monthly and lifetime subscriptions)
- Payment history tracking
- Security features:
  - Rate limiting to prevent brute-force attacks
  - SQL injection protection via prepared statements
  - CORS and security headers
  - Audit logging for security events

## Prerequisites

- Rust 1.70+ 
- PostgreSQL 12+

## Setup

1. Create PostgreSQL database:
```bash
createdb k8s_gui_auth
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Update `.env` with your database credentials and configuration.

4. Database migrations are applied automatically on server startup.

5. Generate JWT secret (optional, will be auto-generated if not set):
```bash
# Generate a secure random secret
openssl rand -base64 64
```

6. Run the server:
```bash
cargo run
```

Optional: regenerate SeaORM entities from a temporary Postgres instance (requires Docker):
```bash
cargo run -p xtask -- gen-entities
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
- `licenses` - License records (monthly/lifetime)
- `payments` - Payment history
- `refresh_tokens` - JWT refresh tokens

See `migration/` for the full schema.

## Security

- **Password Hashing**: Argon2 with cost factor 10
- **Rate Limiting**: 5 login attempts per minute per IP
- **Account Locking**: Accounts locked for 15 minutes after 5 failed login attempts
- **SQL Injection Protection**: All queries use prepared statements via SeaORM
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
5. Use a reverse proxy (nginx) for rate limiting and SSL termination

## License

MIT
