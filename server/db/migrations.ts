import pool from './config';

export async function runMigrations() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'viewer' CHECK (role IN ('admin', 'recruiter', 'viewer')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create index on users email
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    // Create applicants table
    await client.query(`
      CREATE TABLE IF NOT EXISTS applicants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        position VARCHAR(255),
        status VARCHAR(50) DEFAULT 'applied' CHECK (status IN ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected')),
        resume_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create index on email
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_applicants_email ON applicants(email);
    `);

    // Create index on status
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_applicants_status ON applicants(status);
    `);

    // Create updated_at trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create trigger for applicants updated_at
    await client.query(`
      DROP TRIGGER IF EXISTS update_applicants_updated_at ON applicants;
      CREATE TRIGGER update_applicants_updated_at
        BEFORE UPDATE ON applicants
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // Create trigger for users updated_at
    await client.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // Insert sample data
    await client.query(`
      INSERT INTO applicants (name, email, phone, position, status)
      VALUES 
        ('John Doe', 'john.doe@example.com', '555-0101', 'Software Engineer', 'applied'),
        ('Jane Smith', 'jane.smith@example.com', '555-0102', 'Product Manager', 'screening'),
        ('Bob Johnson', 'bob.johnson@example.com', '555-0103', 'UX Designer', 'interview')
      ON CONFLICT (email) DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('Migrations completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Database setup complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database setup failed:', error);
      process.exit(1);
    });
}
