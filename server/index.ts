import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import applicantRoutes from './routes/applicantRoutes';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import dbRoutes from './routes/dbRoutes';
import docsRoutes from './routes/docsRoutes';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';
import { initializeDatabaseConnections, closeDatabaseConnections } from './db/config';
import { runMigrations } from './db/migrations';
import { startBackupScheduler, stopBackupScheduler } from './db/backup';

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply the general rate limiter to all /api/* routes.
app.use('/api', apiLimiter);

// Health check endpoint (unauthenticated — used by load-balancers / uptime monitors)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/applicants', applicantRoutes);
app.use('/api/db', dbRoutes);
// OpenAPI spec — unauthenticated so tooling can fetch it freely
app.use('/api/docs', docsRoutes);

// Error handling middleware
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Bootstrap: verify DB connectivity → run migrations → start server
// ---------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  // 1. Verify connectivity to all configured pools (with retry).
  await initializeDatabaseConnections();

  // 2. Ensure the schema is current before accepting traffic.
  await runMigrations();

  // 3. Start the automatic backup scheduler (respects DB_BACKUP_SCHEDULE_HOURS).
  startBackupScheduler();

  // 4. Begin accepting requests.
  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // -------------------------------------------------------------------------
  // Graceful shutdown — give in-flight requests time to finish before tearing
  // down the DB pools.
  // -------------------------------------------------------------------------
  const shutdown = (signal: string) => {
    console.log(`\n[server] Received ${signal} — shutting down gracefully…`);

    stopBackupScheduler();

    server.close(async () => {
      console.log('[server] HTTP server closed');
      await closeDatabaseConnections();
      console.log('[server] Shutdown complete');
      process.exit(0);
    });

    // Force-exit if graceful shutdown takes too long.
    setTimeout(() => {
      console.error('[server] Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 15_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[server] Failed to start:', message);
  process.exit(1);
});

export default app;
