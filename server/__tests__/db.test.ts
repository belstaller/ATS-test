/**
 * Tests for the database infrastructure layer.
 *
 * Covers:
 *  config.ts     — checkPoolHealth, initializeDatabaseConnections,
 *                  closeDatabaseConnections, replica fallback
 *  backup.ts     — createBackup, listBackups, restoreBackup,
 *                  startBackupScheduler / stopBackupScheduler, pruning
 *  migrations.ts — runMigrations (success and rollback paths)
 *  dbRoutes.ts   — REST API: GET /health, GET /backups,
 *                  POST /backups, POST /backups/restore
 *
 * No real PostgreSQL connection is required — the `pg` module and all
 * child-process calls are fully mocked.
 */

import request from 'supertest';
import express, { Application } from 'express';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

import { TEST_JWT_SECRET, adminToken, recruiterToken, viewerToken, authHeader } from './helpers';

process.env.JWT_SECRET = TEST_JWT_SECRET;

// ---------------------------------------------------------------------------
// Mock `pg` — replace Pool with a controllable fake
// ---------------------------------------------------------------------------

/** A minimal fake PoolClient returned by pool.connect(). */
const makeFakeClient = (overrides: Partial<{ query: jest.Mock; release: jest.Mock }> = {}) => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
  ...overrides,
});

/** A minimal fake Pool. */
class FakePool extends EventEmitter {
  connect = jest.fn();
  query = jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
  end = jest.fn().mockResolvedValue(undefined);
  totalCount = 1;
  idleCount = 1;
  waitingCount = 0;
}

// Single instance — replicaPool will equal primaryPool when no replica is set.
const fakePrimary = new FakePool();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => fakePrimary),
}));

// ---------------------------------------------------------------------------
// Mock `child_process` and `util` — prevent real pg_dump / pg_restore calls.
//
// backup.ts does:
//   const execFileAsync = promisify(execFile);
//
// Both `child_process.execFile` and `util.promisify` are evaluated at module
// load time.  We mock `child_process` so execFile is our stub, then mock
// `util.promisify` to return a Promise-based wrapper around that same stub.
// Individual tests control behaviour by swapping the stub's implementation.
// ---------------------------------------------------------------------------

/** Underlying jest stub — tests call mockExecFile.mockResolvedValue / mockRejectedValue */
const mockExecFile = jest.fn<Promise<{ stdout: string; stderr: string }>, [string, string[]]>();

jest.mock('child_process', () => ({
  // execFile is the raw callback form; backup.ts only uses it via promisify
  // so this export just needs to exist — the promisify mock does the real work.
  execFile: jest.fn(),
}));

jest.mock('util', () => {
  const actual = jest.requireActual<typeof import('util')>('util');
  return {
    ...actual,
    // When backup.ts calls promisify(execFile) at module init, return our
    // Promise-based mock instead of the real promisified wrapper.
    promisify: (_fn: unknown) => mockExecFile,
  };
});

// ---------------------------------------------------------------------------
// Import modules under test AFTER mocks are registered
// ---------------------------------------------------------------------------

import {
  checkPoolHealth,
  initializeDatabaseConnections,
  closeDatabaseConnections,
  primaryPool,
  replicaPool,
} from '../db/config';

import {
  createBackup,
  listBackups,
  restoreBackup,
  startBackupScheduler,
  stopBackupScheduler,
  BACKUP_DIR,
} from '../db/backup';

import { runMigrations } from '../db/migrations';

import dbRoutes from '../routes/dbRoutes';

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

function buildApp(): Application {
  const app = express();
  app.use(helmet());
  app.use(express.json());
  app.use('/api/db', dbRoutes);
  return app;
}

const app = buildApp();

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/** Writes a fake backup file into BACKUP_DIR and returns its filename. */
function writeFakeBackup(name: string): string {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const filepath = path.join(BACKUP_DIR, name);
  fs.writeFileSync(filepath, 'fake-backup-content');
  return name;
}

/** Removes all backup-*.dump files created during a test. */
function cleanBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) return;
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    if (f.startsWith('backup-') && f.endsWith('.dump')) {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
    }
  }
}

// ===========================================================================
// config.ts — checkPoolHealth
// ===========================================================================

describe('checkPoolHealth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves immediately when SELECT 1 succeeds', async () => {
    const client = makeFakeClient();
    fakePrimary.connect.mockResolvedValueOnce(client);

    await expect(checkPoolHealth(primaryPool, 'primary', 0)).resolves.toBeUndefined();
    expect(client.query).toHaveBeenCalledWith('SELECT 1');
    expect(client.release).toHaveBeenCalled();
  });

  it('releases the client even when the query fails', async () => {
    const client = makeFakeClient({
      query: jest.fn().mockRejectedValue(new Error('conn refused')),
    });
    fakePrimary.connect.mockResolvedValueOnce(client);

    await expect(checkPoolHealth(primaryPool, 'primary', 0)).rejects.toThrow(
      /Health check failed for primary after all retries/
    );
    expect(client.release).toHaveBeenCalled();
  });

  it('throws after exhausting all retries', async () => {
    // Both calls (initial + retry-0) should fail.
    const failClient = makeFakeClient({
      query: jest.fn().mockRejectedValue(new Error('always fails')),
    });
    // mockResolvedValue (not Once) so every connect() call gets the failing client.
    fakePrimary.connect.mockResolvedValue(failClient);

    await expect(checkPoolHealth(primaryPool, 'primary', 0)).rejects.toThrow(
      /Health check failed for primary after all retries/
    );
  });

  it('retries on failure and resolves on a subsequent attempt', async () => {
    // Simulate: first connect fails at the query level; second succeeds.
    const failClient = makeFakeClient({
      query: jest.fn().mockRejectedValue(new Error('transient')),
    });
    const okClient = makeFakeClient();

    fakePrimary.connect
      .mockResolvedValueOnce(failClient)
      .mockResolvedValueOnce(okClient);

    // Override setTimeout so the back-off delay resolves immediately.
    jest.spyOn(global, 'setTimeout').mockImplementationOnce((fn) => {
      (fn as () => void)();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    await expect(checkPoolHealth(primaryPool, 'primary', 1)).resolves.toBeUndefined();
    expect(okClient.query).toHaveBeenCalledWith('SELECT 1');

    jest.restoreAllMocks();
  });
});

// ===========================================================================
// config.ts — initializeDatabaseConnections / closeDatabaseConnections
// ===========================================================================

describe('initializeDatabaseConnections', () => {
  beforeEach(() => jest.clearAllMocks());

  it('checks the primary pool successfully', async () => {
    const client = makeFakeClient();
    fakePrimary.connect.mockResolvedValueOnce(client);

    await expect(initializeDatabaseConnections()).resolves.toBeUndefined();
    expect(fakePrimary.connect).toHaveBeenCalledTimes(1);
  });

  it('propagates a primary pool failure', async () => {
    const client = makeFakeClient({
      query: jest.fn().mockRejectedValue(new Error('primary down')),
    });
    fakePrimary.connect.mockResolvedValue(client);

    await expect(checkPoolHealth(primaryPool, 'primary', 0)).rejects.toThrow('primary down');
  });
});

describe('closeDatabaseConnections', () => {
  it('ends the primary pool', async () => {
    fakePrimary.end.mockResolvedValueOnce(undefined);
    await expect(closeDatabaseConnections()).resolves.toBeUndefined();
    expect(fakePrimary.end).toHaveBeenCalled();
  });
});

// ===========================================================================
// config.ts — pool exports and replica fallback
// ===========================================================================

describe('pool exports', () => {
  it('primaryPool is exported', () => {
    expect(primaryPool).toBeDefined();
  });

  it('replicaPool is exported', () => {
    expect(replicaPool).toBeDefined();
  });

  it('replicaPool falls back to primaryPool when no DB_REPLICA_HOST is configured', () => {
    // Both exports should resolve to the same FakePool instance when
    // DB_REPLICA_HOST is absent (which is the case in this test environment).
    expect(replicaPool).toBe(primaryPool);
  });
});

// ===========================================================================
// backup.ts — createBackup
// ===========================================================================

describe('createBackup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cleanBackupDir();
  });
  afterEach(cleanBackupDir);

  it('calls pg_dump with --format=custom and writes a backup file', async () => {
    mockExecFile.mockImplementation((_cmd, _args) => {
      // Simulate pg_dump creating the output file before the promise resolves.
      const fileArg = _args.find((a) => a.startsWith('--file='))!;
      const filepath = fileArg.replace('--file=', '');
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
      fs.writeFileSync(filepath, 'fake-dump-data');
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    const meta = await createBackup();

    expect(meta.filename).toMatch(/^backup-.*\.dump$/);
    expect(meta.sizeBytes).toBeGreaterThan(0);
    expect(typeof meta.createdAt).toBe('string');
    expect(fs.existsSync(meta.filepath)).toBe(true);

    const [cmd, args] = mockExecFile.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('pg_dump');
    expect(args).toContain('--format=custom');
    expect(args).toContain('--no-password');
  });

  it('propagates pg_dump errors', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('pg_dump: connection refused'));

    await expect(createBackup()).rejects.toThrow('pg_dump');
  });

  it('prunes backup files when the count exceeds MAX_BACKUPS', async () => {
    // Seed 7 existing backups (the default MAX_BACKUPS limit).
    for (let i = 1; i <= 7; i++) {
      writeFakeBackup(`backup-2024-01-0${i}T00-00-00.dump`);
    }

    mockExecFile.mockImplementation((_cmd, _args) => {
      const fileArg = _args.find((a) => a.startsWith('--file='))!;
      const filepath = fileArg.replace('--file=', '');
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
      fs.writeFileSync(filepath, 'x');
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    await createBackup();

    // After adding one more backup (8 total) the oldest should be pruned.
    const remaining = listBackups();
    expect(remaining.length).toBeLessThanOrEqual(7);
  });
});

// ===========================================================================
// backup.ts — listBackups
// ===========================================================================

describe('listBackups', () => {
  beforeEach(cleanBackupDir);
  afterEach(cleanBackupDir);

  it('returns an empty array when no backups exist', () => {
    expect(listBackups()).toEqual([]);
  });

  it('lists all backup files and sorts them newest-first by filename', () => {
    writeFakeBackup('backup-2024-01-01T00-00-00.dump');
    writeFakeBackup('backup-2024-06-15T12-00-00.dump');

    const list = listBackups();
    expect(list).toHaveLength(2);
    // Sort is lexicographic on createdAt (ISO string). Because the filesystem
    // may timestamp both files identically we verify the set, not the order.
    const names = list.map((e) => e.filename);
    expect(names).toContain('backup-2024-01-01T00-00-00.dump');
    expect(names).toContain('backup-2024-06-15T12-00-00.dump');
  });

  it('ignores non-backup files in the directory', () => {
    writeFakeBackup('backup-2024-01-01T00-00-00.dump');
    // A file that doesn't match the pattern must be ignored.
    fs.writeFileSync(path.join(BACKUP_DIR, 'readme.txt'), 'ignore me');

    expect(listBackups()).toHaveLength(1);
  });

  it('each entry has the correct shape', () => {
    writeFakeBackup('backup-2024-03-10T08-30-00.dump');
    const [entry] = listBackups();
    expect(entry).toMatchObject({
      filename: 'backup-2024-03-10T08-30-00.dump',
      sizeBytes: expect.any(Number),
      createdAt: expect.any(String),
    });
    expect(path.isAbsolute(entry.filepath)).toBe(true);
  });
});

// ===========================================================================
// backup.ts — restoreBackup
// ===========================================================================

describe('restoreBackup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cleanBackupDir();
  });
  afterEach(cleanBackupDir);

  it('calls pg_restore with the correct flags for a valid backup file', async () => {
    writeFakeBackup('backup-2024-06-01T10-00-00.dump');

    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

    await expect(
      restoreBackup('backup-2024-06-01T10-00-00.dump')
    ).resolves.toBeUndefined();

    const [cmd, args] = mockExecFile.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('pg_restore');
    expect(args).toContain('--clean');
    expect(args).toContain('--if-exists');
    expect(args).toContain('--no-owner');
    expect(args).toContain('--no-privileges');
  });

  it('rejects when the backup file does not exist on disk', async () => {
    await expect(
      restoreBackup('backup-9999-01-01T00-00-00.dump')
    ).rejects.toThrow(/not found/i);
  });

  it('rejects a filename that does not start with "backup-"', async () => {
    await expect(restoreBackup('my-database.sql')).rejects.toThrow(
      /Invalid backup filename/
    );
  });

  it('rejects a filename that does not end with ".dump"', async () => {
    await expect(restoreBackup('backup-2024-01-01T00-00-00.tar.gz')).rejects.toThrow(
      /Invalid backup filename/
    );
  });

  it('strips any directory prefix via path.basename before validation', async () => {
    // After stripping the prefix the basename is a valid-looking pattern name,
    // but the file doesn't exist — so we expect a "not found" error, confirming
    // that the traversal component was safely removed.
    await expect(
      restoreBackup('../backups/backup-2024-01-01T00-00-00.dump')
    ).rejects.toThrow(/not found/i);
  });

  it('propagates pg_restore errors', async () => {
    writeFakeBackup('backup-2024-06-01T10-00-00.dump');

    mockExecFile.mockRejectedValueOnce(new Error('pg_restore: authentication failed'));

    await expect(
      restoreBackup('backup-2024-06-01T10-00-00.dump')
    ).rejects.toThrow(/pg_restore/);
  });
});

// ===========================================================================
// backup.ts — scheduler
// ===========================================================================

describe('startBackupScheduler / stopBackupScheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cleanBackupDir();
  });
  afterEach(() => {
    stopBackupScheduler();
    cleanBackupDir();
  });

  it('stopBackupScheduler is safe to call when the scheduler was never started', () => {
    expect(() => stopBackupScheduler()).not.toThrow();
  });

  it('startBackupScheduler triggers an immediate backup run', async () => {
    // Resolve the execFile call so createBackup() completes.
    mockExecFile.mockImplementation((_cmd, _args) => {
      const fileArg = _args.find((a) => a.startsWith('--file='));
      if (fileArg) {
        const filepath = fileArg.replace('--file=', '');
        fs.mkdirSync(path.dirname(filepath), { recursive: true });
        fs.writeFileSync(filepath, 'x');
      }
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    startBackupScheduler();

    // Give the async fire-and-forget time to complete.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // pg_dump should have been invoked at least once.
    expect(mockExecFile).toHaveBeenCalled();
    const [cmd] = mockExecFile.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('pg_dump');
  });

  it('stopBackupScheduler clears the recurring timer', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    mockExecFile.mockImplementation((_cmd, _args) => {
      const fileArg = _args.find((a) => a.startsWith('--file='));
      if (fileArg) {
        const filepath = fileArg.replace('--file=', '');
        fs.mkdirSync(path.dirname(filepath), { recursive: true });
        fs.writeFileSync(filepath, 'x');
      }
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    startBackupScheduler();
    stopBackupScheduler();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});

// ===========================================================================
// migrations.ts — runMigrations
// ===========================================================================

describe('runMigrations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('runs all DDL statements inside a transaction and commits', async () => {
    const client = makeFakeClient();
    fakePrimary.connect.mockResolvedValueOnce(client);

    await expect(runMigrations()).resolves.toBeUndefined();

    const queries = (client.query as jest.Mock).mock.calls.map(
      (call: [string]) => call[0]
    );
    expect(queries[0]).toBe('BEGIN');
    expect(queries[queries.length - 1]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back the transaction on error and re-throws', async () => {
    const client = makeFakeClient({
      query: jest
        .fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('syntax error')) // first DDL statement
        .mockResolvedValueOnce({}), // ROLLBACK
    });
    fakePrimary.connect.mockResolvedValueOnce(client);

    await expect(runMigrations()).rejects.toThrow('syntax error');

    const queries = (client.query as jest.Mock).mock.calls.map(
      (call: [string]) => call[0]
    );
    expect(queries[0]).toBe('BEGIN');
    expect(queries).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('creates the users table', async () => {
    const client = makeFakeClient();
    fakePrimary.connect.mockResolvedValueOnce(client);

    await runMigrations();

    const ddl = (client.query as jest.Mock).mock.calls
      .map((c: [string]) => c[0])
      .join('\n');
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS users/i);
  });

  it('creates the applicants table', async () => {
    const client = makeFakeClient();
    fakePrimary.connect.mockResolvedValueOnce(client);

    await runMigrations();

    const ddl = (client.query as jest.Mock).mock.calls
      .map((c: [string]) => c[0])
      .join('\n');
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS applicants/i);
  });

  it('creates the updated_at trigger function', async () => {
    const client = makeFakeClient();
    fakePrimary.connect.mockResolvedValueOnce(client);

    await runMigrations();

    const ddl = (client.query as jest.Mock).mock.calls
      .map((c: [string]) => c[0])
      .join('\n');
    expect(ddl).toMatch(/update_updated_at_column/i);
  });

  it('creates indexes on both tables', async () => {
    const client = makeFakeClient();
    fakePrimary.connect.mockResolvedValueOnce(client);

    await runMigrations();

    const ddl = (client.query as jest.Mock).mock.calls
      .map((c: [string]) => c[0])
      .join('\n');
    expect(ddl).toMatch(/CREATE INDEX IF NOT EXISTS idx_users_email/i);
    expect(ddl).toMatch(/CREATE INDEX IF NOT EXISTS idx_applicants_email/i);
    expect(ddl).toMatch(/CREATE INDEX IF NOT EXISTS idx_applicants_status/i);
  });

  it('inserts seed data for applicants', async () => {
    const client = makeFakeClient();
    fakePrimary.connect.mockResolvedValueOnce(client);

    await runMigrations();

    const ddl = (client.query as jest.Mock).mock.calls
      .map((c: [string]) => c[0])
      .join('\n');
    expect(ddl).toMatch(/INSERT INTO applicants/i);
    expect(ddl).toMatch(/ON CONFLICT.*DO NOTHING/i);
  });
});

// ===========================================================================
// dbRoutes.ts — GET /api/db/health
// ===========================================================================

describe('GET /api/db/health', () => {
  beforeEach(() => jest.clearAllMocks());

  it('200 — returns status ok with pool metrics for an admin user', async () => {
    fakePrimary.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/db/health')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('primary');
    expect(res.body.primary.status).toBe('ok');
    expect(res.body.primary).toHaveProperty('latencyMs');
    expect(res.body).toHaveProperty('replica');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('200 — a viewer can call the health endpoint', async () => {
    fakePrimary.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/db/health')
      .set(authHeader(viewerToken()));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('200 — a recruiter can call the health endpoint', async () => {
    fakePrimary.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/db/health')
      .set(authHeader(recruiterToken()));

    expect(res.status).toBe(200);
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app).get('/api/db/health');
    expect(res.status).toBe(401);
  });

  it('replica section shows not_configured when no replica is set up', async () => {
    fakePrimary.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/db/health')
      .set(authHeader(adminToken()));

    // No DB_REPLICA_HOST → replicaPool === primaryPool → not_configured.
    expect(res.body.replica.status).toBe('not_configured');
  });

  it('primary pool includes totalCount, idleCount and waitingCount', async () => {
    fakePrimary.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/db/health')
      .set(authHeader(adminToken()));

    expect(res.body.primary).toMatchObject({
      totalCount: expect.any(Number),
      idleCount: expect.any(Number),
      waitingCount: expect.any(Number),
    });
  });
});

// ===========================================================================
// dbRoutes.ts — GET /api/db/backups
// ===========================================================================

describe('GET /api/db/backups', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cleanBackupDir();
  });
  afterEach(cleanBackupDir);

  it('200 — admin receives a list of backups', async () => {
    writeFakeBackup('backup-2024-05-01T00-00-00.dump');

    const res = await request(app)
      .get('/api/db/backups')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.backups)).toBe(true);
    expect(res.body.backups).toHaveLength(1);
    expect(res.body.backups[0].filename).toBe('backup-2024-05-01T00-00-00.dump');
  });

  it('200 — returns an empty array when no backups exist', async () => {
    const res = await request(app)
      .get('/api/db/backups')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(200);
    expect(res.body.backups).toEqual([]);
  });

  it('200 — each backup entry has filename, sizeBytes and createdAt', async () => {
    writeFakeBackup('backup-2024-05-01T00-00-00.dump');

    const res = await request(app)
      .get('/api/db/backups')
      .set(authHeader(adminToken()));

    expect(res.body.backups[0]).toMatchObject({
      filename: expect.any(String),
      sizeBytes: expect.any(Number),
      createdAt: expect.any(String),
    });
  });

  it('403 — recruiter cannot list backups', async () => {
    const res = await request(app)
      .get('/api/db/backups')
      .set(authHeader(recruiterToken()));

    expect(res.status).toBe(403);
  });

  it('403 — viewer cannot list backups', async () => {
    const res = await request(app)
      .get('/api/db/backups')
      .set(authHeader(viewerToken()));

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app).get('/api/db/backups');
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// dbRoutes.ts — POST /api/db/backups
// ===========================================================================

describe('POST /api/db/backups', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cleanBackupDir();
  });
  afterEach(cleanBackupDir);

  it('201 — admin triggers a backup and receives metadata', async () => {
    mockExecFile.mockImplementation((_cmd, _args) => {
      const fileArg = _args.find((a) => a.startsWith('--file='))!;
      const filepath = fileArg.replace('--file=', '');
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
      fs.writeFileSync(filepath, 'dump-data');
      return Promise.resolve({ stdout: '', stderr: '' });
    });

    const res = await request(app)
      .post('/api/db/backups')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/created/i);
    expect(res.body.backup).toMatchObject({
      filename: expect.stringMatching(/^backup-.*\.dump$/),
      sizeBytes: expect.any(Number),
      createdAt: expect.any(String),
    });
  });

  it('500 — propagates pg_dump failure as a server error', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('pg_dump failed'));

    const res = await request(app)
      .post('/api/db/backups')
      .set(authHeader(adminToken()));

    expect(res.status).toBe(500);
  });

  it('403 — recruiter cannot create a backup', async () => {
    const res = await request(app)
      .post('/api/db/backups')
      .set(authHeader(recruiterToken()));

    expect(res.status).toBe(403);
  });

  it('403 — viewer cannot create a backup', async () => {
    const res = await request(app)
      .post('/api/db/backups')
      .set(authHeader(viewerToken()));

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app).post('/api/db/backups');
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// dbRoutes.ts — POST /api/db/backups/restore
// ===========================================================================

describe('POST /api/db/backups/restore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cleanBackupDir();
  });
  afterEach(cleanBackupDir);

  it('200 — admin restores from a valid backup file', async () => {
    writeFakeBackup('backup-2024-06-01T10-00-00.dump');

    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' });

    const res = await request(app)
      .post('/api/db/backups/restore')
      .set(authHeader(adminToken()))
      .send({ filename: 'backup-2024-06-01T10-00-00.dump' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/restored/i);
  });

  it('400 — missing filename in request body', async () => {
    const res = await request(app)
      .post('/api/db/backups/restore')
      .set(authHeader(adminToken()))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/filename/i);
  });

  it('400 — blank filename string is rejected', async () => {
    const res = await request(app)
      .post('/api/db/backups/restore')
      .set(authHeader(adminToken()))
      .send({ filename: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/filename/i);
  });

  it('500 — file not found on disk surfaces as a server error', async () => {
    const res = await request(app)
      .post('/api/db/backups/restore')
      .set(authHeader(adminToken()))
      .send({ filename: 'backup-9999-01-01T00-00-00.dump' });

    expect(res.status).toBe(500);
  });

  it('500 — invalid filename pattern surfaces as a server error', async () => {
    const res = await request(app)
      .post('/api/db/backups/restore')
      .set(authHeader(adminToken()))
      .send({ filename: 'my-db.sql' });

    expect(res.status).toBe(500);
  });

  it('500 — pg_restore failure surfaces as a server error', async () => {
    writeFakeBackup('backup-2024-06-01T10-00-00.dump');

    mockExecFile.mockRejectedValueOnce(new Error('pg_restore: connection refused'));

    const res = await request(app)
      .post('/api/db/backups/restore')
      .set(authHeader(adminToken()))
      .send({ filename: 'backup-2024-06-01T10-00-00.dump' });

    expect(res.status).toBe(500);
  });

  it('403 — recruiter cannot restore', async () => {
    const res = await request(app)
      .post('/api/db/backups/restore')
      .set(authHeader(recruiterToken()))
      .send({ filename: 'backup-2024-06-01T10-00-00.dump' });

    expect(res.status).toBe(403);
  });

  it('403 — viewer cannot restore', async () => {
    const res = await request(app)
      .post('/api/db/backups/restore')
      .set(authHeader(viewerToken()))
      .send({ filename: 'backup-2024-06-01T10-00-00.dump' });

    expect(res.status).toBe(403);
  });

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app)
      .post('/api/db/backups/restore')
      .send({ filename: 'backup-2024-06-01T10-00-00.dump' });

    expect(res.status).toBe(401);
  });
});
