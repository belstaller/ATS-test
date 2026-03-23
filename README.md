# ATS Test

A modern Applicant Tracking System built with React, TypeScript, Node.js, Express, and PostgreSQL.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL
- **Linting**: ESLint + Prettier

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
│   ├── controllers/       # Route controllers
│   ├── db/               # Database configuration and migrations
│   ├── middleware/       # Express middleware
│   ├── routes/           # API routes
│   ├── services/         # Business logic layer
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

- `npm run dev` - Run both frontend and backend in development mode
- `npm run dev:server` - Run backend only
- `npm run dev:client` - Run frontend only
- `npm run build` - Build both frontend and backend for production
- `npm run build:server` - Build backend only
- `npm run build:client` - Build frontend only
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier
- `npm run type-check` - Run TypeScript type checking
- `npm run db:migrate` - Run database migrations

## API Endpoints

### Applicants

- `GET /api/applicants` - Get all applicants
- `GET /api/applicants/:id` - Get applicant by ID
- `POST /api/applicants` - Create new applicant
- `PUT /api/applicants/:id` - Update applicant
- `DELETE /api/applicants/:id` - Delete applicant

### Health Check

- `GET /api/health` - API health check

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
