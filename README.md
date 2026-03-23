# ATS Test

A modern Applicant Tracking System built with React, TypeScript, Node.js, Express, and PostgreSQL.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL
- **Linting**: ESLint + Prettier
- **Testing**: Jest + Supertest

## Project Structure

```
.
├── src/                    # React frontend source code
│   ├── components/         # React components
│   ├── pages/             # Page components
│   ├── services/          # API service layer
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions
│   ├── App.tsx            # Main App component
│   └── main.tsx           # Application entry point
├── server/                # Express backend source code
│   ├── __tests__/         # Functional API tests (Jest + Supertest)
│   ├── controllers/       # Route controllers
│   ├── db/               # Database configuration and migrations
│   ├── middleware/       # Express middleware (auth, validation, errors)
│   ├── routes/           # API routes
│   ├── services/         # Business logic / data access layer
│   └── index.ts          # Server entry point
├── public/               # Static assets
└── dist/                 # Compiled output (generated)
```

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- npm or yarn

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup

Create a PostgreSQL database:

```bash
createdb ats_test
```

Or using psql:

```sql
CREATE DATABASE ats_test;
```

### 3. Environment Configuration

Copy the example environment file and update with your settings:

```bash
cp .env.example .env
```

Edit `.env` with your database credentials and configuration.

### 4. Run Database Migrations

```bash
npm run db:migrate
```

### 5. Development

Run both frontend and backend in development mode:

```bash
npm run dev
```

Or run them separately:

```bash
# Terminal 1 - Backend
npm run dev:server

# Terminal 2 - Frontend
npm run dev:client
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Run both frontend and backend in development mode |
| `npm run dev:server` | Run backend only |
| `npm run dev:client` | Run frontend only |
| `npm run build` | Build both frontend and backend for production |
| `npm run build:server` | Build backend only |
| `npm run build:client` | Build frontend only |
| `npm start` | Start production server |
| `npm test` | Run all functional API tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint errors |
| `npm run format` | Format code with Prettier |
| `npm run type-check` | Run TypeScript type checking |
| `npm run db:migrate` | Run database migrations |

---

## REST API Reference

All protected endpoints require a **Bearer token** in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

### Role Matrix

| Role | Read applicants | Write applicants | Delete applicants | User management |
|---|---|---|---|---|
| `viewer` | ✅ | ❌ | ❌ | ❌ |
| `recruiter` | ✅ | ✅ | ❌ | ❌ |
| `admin` | ✅ | ✅ | ✅ | ✅ |

---

### Authentication — `/api/auth`

#### `POST /api/auth/register`
Create a new user account.

**Auth required:** No

**Request body:**
```json
{
  "name": "Alice Example",
  "email": "alice@example.com",
  "password": "password123",
  "role": "recruiter"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | ✅ | 1–255 characters |
| `email` | string | ✅ | Valid email format |
| `password` | string | ✅ | Minimum 8 characters |
| `role` | string | ❌ | `admin` \| `recruiter` \| `viewer` (default: `viewer`) |

**Response `201`:**
```json
{
  "user": { "id": 1, "name": "Alice Example", "email": "alice@example.com", "role": "recruiter", "created_at": "…", "updated_at": "…" },
  "token": "<jwt>"
}
```

---

#### `POST /api/auth/login`
Authenticate with email and password.

**Auth required:** No

**Request body:**
```json
{ "email": "alice@example.com", "password": "password123" }
```

**Response `200`:**
```json
{
  "user": { "id": 1, "name": "Alice Example", "email": "alice@example.com", "role": "recruiter", "created_at": "…", "updated_at": "…" },
  "token": "<jwt>"
}
```

---

#### `GET /api/auth/me`
Return the currently authenticated user's profile.

**Auth required:** Yes (any role)

**Response `200`:** User object (no `password_hash`).

---

### Applicants — `/api/applicants`

#### `GET /api/applicants`
List applicants with optional filtering, searching, and pagination.

**Auth required:** Yes (`admin`, `recruiter`, `viewer`)

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `status` | string | Filter by status: `applied` \| `screening` \| `interview` \| `offer` \| `hired` \| `rejected` |
| `position` | string | Case-insensitive partial match on `position` |
| `search` | string | Full-text search across `name`, `email`, and `position` |
| `page` | integer | Page number (default: `1`) |
| `limit` | integer | Records per page (default: `20`, max: `100`) |

**Response `200`:**
```json
{
  "data": [ /* Applicant[] */ ],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

---

#### `GET /api/applicants/:id`
Retrieve a single applicant by ID.

**Auth required:** Yes (`admin`, `recruiter`, `viewer`)

**Response `200`:** Applicant object.
**Response `404`:** `{ "error": "Applicant not found" }`

---

#### `POST /api/applicants`
Create a new applicant record.

**Auth required:** Yes (`admin`, `recruiter`)

**Request body:**
```json
{
  "name": "Carol Candidate",
  "email": "carol@example.com",
  "phone": "555-0199",
  "position": "QA Engineer",
  "status": "applied",
  "resume_url": "https://example.com/resume.pdf"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | ✅ | 1–255 characters |
| `email` | string | ✅ | Valid, unique email |
| `phone` | string | ❌ | 7–20 character phone number |
| `position` | string | ❌ | 1–255 characters |
| `status` | string | ❌ | One of the 6 valid statuses (default: `applied`) |
| `resume_url` | string | ❌ | Valid HTTP/HTTPS URL |

**Response `201`:** Created applicant object.

---

#### `PUT /api/applicants/:id`
Full update of an applicant (all provided fields are written).

**Auth required:** Yes (`admin`, `recruiter`)

**Request body:** Same shape as `POST`. At least one field must be present.

**Response `200`:** Updated applicant object.
**Response `404`:** Not found.

---

#### `PATCH /api/applicants/:id`
Partial update of an applicant (only provided fields are changed).

**Auth required:** Yes (`admin`, `recruiter`)

**Request body:** Any subset of the applicant fields. At least one must be present.

**Response `200`:** Updated applicant object.

---

#### `PATCH /api/applicants/:id/status`
Advance an applicant through the hiring pipeline (status-only update).

**Auth required:** Yes (`admin`, `recruiter`)

**Request body:**
```json
{ "status": "interview" }
```

**Valid statuses (in order):** `applied` → `screening` → `interview` → `offer` → `hired` / `rejected`

**Response `200`:** Updated applicant object.

---

#### `DELETE /api/applicants/:id`
Permanently remove an applicant record.

**Auth required:** Yes (`admin` only)

**Response `204`:** No content.
**Response `404`:** Not found.

---

### Users — `/api/users`

> All user management endpoints require **admin** role.

#### `GET /api/users`
List all users with optional filtering and pagination.

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `role` | string | Filter by role: `admin` \| `recruiter` \| `viewer` |
| `search` | string | Partial match on `name` or `email` |
| `page` | integer | Page number (default: `1`) |
| `limit` | integer | Records per page (default: `20`, max: `100`) |

**Response `200`:**
```json
{
  "data": [ /* UserPublic[] */ ],
  "total": 10,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---

#### `GET /api/users/:id`
Retrieve a single user by ID.

**Response `200`:** `UserPublic` object (no `password_hash`).
**Response `404`:** Not found.

---

#### `PATCH /api/users/:id/role`
Change a user's role.

**Request body:**
```json
{ "role": "recruiter" }
```

**Constraints:** An admin cannot change their own role.

**Response `200`:** Updated `UserPublic` object.
**Response `400`:** Invalid role / self-demotion attempt.
**Response `404`:** Not found.

---

#### `DELETE /api/users/:id`
Remove a user account.

**Constraints:** An admin cannot delete their own account.

**Response `204`:** No content.
**Response `400`:** Self-deletion attempt.
**Response `404`:** Not found.

---

### Database — `/api/db`

> All database routes require authentication. Backup routes require **admin** role.

#### `GET /api/db/health`
Live connectivity check for both primary and (optionally) replica pools.

**Auth required:** Yes (any role)

**Response `200`:**
```json
{
  "status": "ok",
  "timestamp": "…",
  "primary": { "status": "ok", "latencyMs": 2, "totalCount": 1, "idleCount": 1, "waitingCount": 0 },
  "replica": { "status": "not_configured", "latencyMs": null }
}
```

---

#### `GET /api/db/backups`
List all available backup files.

**Auth required:** Yes (`admin`)

---

#### `POST /api/db/backups`
Trigger an on-demand database backup.

**Auth required:** Yes (`admin`)

---

#### `POST /api/db/backups/restore`
Restore the database from a named backup file.

**Auth required:** Yes (`admin`)

**Request body:**
```json
{ "filename": "backup-2024-06-15T14-30-00.dump" }
```

> ⚠️ This is a **destructive** operation. All existing data will be replaced.

---

### System — `/api/health`

#### `GET /api/health`
Unauthenticated liveness probe for load balancers and uptime monitors.

**Response `200`:**
```json
{ "status": "ok", "timestamp": "…", "uptime": 123.45 }
```

---

### Error Response Format

All error responses follow a consistent shape:

```json
{ "error": "Human-readable description of the problem" }
```

In development mode (`NODE_ENV=development`), 500-level errors additionally include a `stack` field.

### HTTP Status Codes

| Code | Meaning |
|---|---|
| `200` | OK |
| `201` | Created |
| `204` | No Content (successful delete) |
| `400` | Bad Request — validation failed |
| `401` | Unauthorized — missing or invalid token |
| `403` | Forbidden — authenticated but insufficient role |
| `404` | Not Found |
| `409` | Conflict — e.g. duplicate email |
| `500` | Internal Server Error |

---

## Production Deployment

1. Build the application:

```bash
npm run build
```

2. Set environment variables for production in `.env`

3. Start the production server:

```bash
npm start
```

## License

MIT
