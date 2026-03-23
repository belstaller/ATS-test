import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// Pool configuration helpers
// ---------------------------------------------------------------------------

/** Maximum time (ms) to wait for a connection before giving up. */
const CONNECTION_TIMEOUT_MS = parseInt(
  process.env.DB_CONNECTION_TIMEOUT_MS || '5000'
);

/** How long (ms) an idle client is kept before being closed. */
const IDLE_TIMEOUT_MS = parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000');

/** Maximum number of clients in each pool. */
const MAX_POOL_SIZE = parseInt(process.env.DB_POOL_MAX || '10');

/**
 * How many times the application will retry a failed initial health-check
 * before aborting.  Retries use exponential back-off capped at 30 s.
 */
const HEALTH_CHECK_RETRIES = parseInt(process.env.DB_HEALTH_CHECK_RETRIES || '5');

// ---------------------------------------------------------------------------
// Primary (read-write) pool
// ---------------------------------------------------------------------------

export const primaryPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'ats_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: MAX_POOL_SIZE,
  idleTimeoutMillis: IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
});

primaryPool.on('connect', () => {
  console.log('[db] Primary pool: client connected');
});

primaryPool.on('error', (err: Error) => {
  console.error('[db] Primary pool unexpected error:', err.message);
  // Log and continue — individual query callers surface the error instead of
  // crashing the whole process.
});

// ---------------------------------------------------------------------------
// Read-replica (read-only) pool — falls back to the primary when no separate
// replica is configured so the rest of the codebase can always call
// `replicaPool` without branching.
// ---------------------------------------------------------------------------

const hasReplica =
  process.env.DB_REPLICA_HOST !== undefined &&
  process.env.DB_REPLICA_HOST.trim() !== '';

export const replicaPool = hasReplica
  ? new Pool({
      host: process.env.DB_REPLICA_HOST,
      port: parseInt(process.env.DB_REPLICA_PORT || process.env.DB_PORT || '5432'),
      database: process.env.DB_REPLICA_NAME || process.env.DB_NAME || 'ats_test',
      user: process.env.DB_REPLICA_USER || process.env.DB_USER || 'postgres',
      password:
        process.env.DB_REPLICA_PASSWORD ||
        process.env.DB_PASSWORD ||
        'postgres',
      max: MAX_POOL_SIZE,
      idleTimeoutMillis: IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    })
  : primaryPool; // no replica configured — share the primary pool

if (hasReplica) {
  replicaPool.on('connect', () => {
    console.log('[db] Replica pool: client connected');
  });

  replicaPool.on('error', (err: Error) => {
    console.error('[db] Replica pool unexpected error:', err.message);
  });
}

// ---------------------------------------------------------------------------
// Health-check with exponential back-off retry
// ---------------------------------------------------------------------------

/**
 * Verifies connectivity to a pool by running `SELECT 1`.
 *
 * @param pool    Pool to test
 * @param label   Human-readable label used in log messages
 * @param retries Number of remaining attempts (decrements on each recursion)
 */
export async function checkPoolHealth(
  pool: Pool,
  label: string,
  retries = HEALTH_CHECK_RETRIES
): Promise<void> {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    console.log(`[db] Health check passed for: ${label}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (retries <= 0) {
      throw new Error(
        `[db] Health check failed for ${label} after all retries: ${message}`
      );
    }
    const attempt = HEALTH_CHECK_RETRIES - retries + 1;
    const delayMs = Math.min(1000 * 2 ** attempt, 30_000);
    console.warn(
      `[db] Health check failed for ${label} (attempt ${attempt}). ` +
        `Retrying in ${delayMs}ms… (${message})`
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return checkPoolHealth(pool, label, retries - 1);
  } finally {
    client?.release();
  }
}

/**
 * Runs health checks on both the primary and (if configured) the replica
 * pools.  Intended to be called once during application bootstrap.
 */
export async function initializeDatabaseConnections(): Promise<void> {
  await checkPoolHealth(primaryPool, 'primary');
  if (hasReplica) {
    await checkPoolHealth(replicaPool, 'replica');
  } else {
    console.log('[db] No replica configured — using primary pool for reads');
  }
}

/**
 * Gracefully ends both pools.  Call on process shutdown.
 */
export async function closeDatabaseConnections(): Promise<void> {
  await primaryPool.end();
  if (hasReplica) {
    await replicaPool.end();
  }
  console.log('[db] All database pools closed');
}

// Default export kept for backward-compatibility with all existing services
// that import `pool` from this module.
export default primaryPool;
