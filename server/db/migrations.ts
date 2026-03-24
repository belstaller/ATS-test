import pool from './config';

export async function runMigrations() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // -----------------------------------------------------------------------
    // users
    // -----------------------------------------------------------------------
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

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    // -----------------------------------------------------------------------
    // applicants
    //
    // Fields are grouped by concern:
    //   1. Identity / personal details
    //   2. Professional profile
    //   3. External links
    //   4. Hiring pipeline
    //   5. Audit timestamps
    // -----------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS applicants (
        id SERIAL PRIMARY KEY,

        -- Personal details
        name             VARCHAR(255)  NOT NULL,
        email            VARCHAR(255)  UNIQUE NOT NULL,
        phone            VARCHAR(50),
        location         VARCHAR(255),

        -- Professional profile
        position         VARCHAR(255),
        experience_years SMALLINT      CHECK (experience_years >= 0),
        education        TEXT,
        skills           TEXT[]        DEFAULT '{}',

        -- External links
        resume_url       TEXT,
        linkedin_url     TEXT,
        github_url       TEXT,
        portfolio_url    TEXT,

        -- Hiring pipeline
        status           VARCHAR(50)   DEFAULT 'applied'
                           CHECK (status IN ('applied','screening','interview','offer','hired','rejected')),
        salary_expected  INTEGER       CHECK (salary_expected > 0),
        availability_date DATE,
        source           VARCHAR(50)
                           CHECK (source IN ('direct','linkedin','referral','job_board','agency','github','other')),
        assigned_to      INTEGER       REFERENCES users(id) ON DELETE SET NULL,

        -- Audit timestamps
        created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Core look-up indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_applicants_email ON applicants(email);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_applicants_status ON applicants(status);
    `);

    // Pipeline / assignment indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_applicants_assigned_to ON applicants(assigned_to);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_applicants_source ON applicants(source);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_applicants_availability_date ON applicants(availability_date);
    `);

    // Full-text search index over name, email and position
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_applicants_fts
        ON applicants
        USING GIN (
          to_tsvector('english',
            coalesce(name, '') || ' ' ||
            coalesce(email, '') || ' ' ||
            coalesce(position, '') || ' ' ||
            coalesce(location, '')
          )
        );
    `);

    // GIN index for efficient skill-array containment queries (@>)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_applicants_skills ON applicants USING GIN (skills);
    `);

    // -----------------------------------------------------------------------
    // candidate_tags  — normalised, reusable labels (many-to-many)
    //
    // Decoupled from the skills array: tags represent process/organisational
    // labels (e.g. "fast-track", "relocation-needed") whereas skills are
    // technical keywords supplied by the candidate.
    // -----------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS candidate_tags (
        id         SERIAL       PRIMARY KEY,
        name       VARCHAR(100) UNIQUE NOT NULL,
        color      VARCHAR(7)   DEFAULT '#6366f1'
                     CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
        created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_candidate_tags_name ON candidate_tags(name);
    `);

    // -----------------------------------------------------------------------
    // applicant_tag_assignments  — join table
    // -----------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS applicant_tag_assignments (
        applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
        tag_id       INTEGER NOT NULL REFERENCES candidate_tags(id) ON DELETE CASCADE,
        assigned_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (applicant_id, tag_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ata_applicant_id ON applicant_tag_assignments(applicant_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ata_tag_id ON applicant_tag_assignments(tag_id);
    `);

    // -----------------------------------------------------------------------
    // updated_at trigger — shared across all tables that carry the column
    // -----------------------------------------------------------------------
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_applicants_updated_at ON applicants;
      CREATE TRIGGER update_applicants_updated_at
        BEFORE UPDATE ON applicants
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // -----------------------------------------------------------------------
    // notes
    // -----------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id           SERIAL  PRIMARY KEY,
        applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
        author_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body         TEXT    NOT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notes_applicant_id ON notes(applicant_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notes_author_id ON notes(author_id);
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_notes_updated_at ON notes;
      CREATE TRIGGER update_notes_updated_at
        BEFORE UPDATE ON notes
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // -----------------------------------------------------------------------
    // resume_uploads — stores metadata for uploaded resume files
    // -----------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS resume_uploads (
        id                SERIAL        PRIMARY KEY,
        original_filename VARCHAR(255)  NOT NULL,
        stored_filename   VARCHAR(255)  NOT NULL UNIQUE,
        file_path         TEXT          NOT NULL,
        mime_type         VARCHAR(100)  NOT NULL
                            CHECK (mime_type IN (
                              'application/pdf',
                              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                              'text/plain'
                            )),
        file_size         INTEGER       NOT NULL CHECK (file_size > 0),
        uploaded_by       INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        applicant_id      INTEGER       REFERENCES applicants(id) ON DELETE SET NULL,
        created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_resume_uploads_uploaded_by
        ON resume_uploads(uploaded_by);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_resume_uploads_applicant_id
        ON resume_uploads(applicant_id);
    `);

    // -----------------------------------------------------------------------
    // Seed data
    // -----------------------------------------------------------------------
    await client.query(`
      INSERT INTO applicants (name, email, phone, location, position, experience_years, skills, status, source)
      VALUES
        ('John Doe',    'john.doe@example.com',    '555-0101', 'New York, USA',    'Software Engineer', 3,  ARRAY['TypeScript','Node.js','PostgreSQL'], 'applied',   'linkedin'),
        ('Jane Smith',  'jane.smith@example.com',  '555-0102', 'San Francisco, USA', 'Product Manager', 5,  ARRAY['Roadmapping','Agile','Stakeholder Management'], 'screening', 'referral'),
        ('Bob Johnson', 'bob.johnson@example.com', '555-0103', 'Austin, USA',      'UX Designer',       2,  ARRAY['Figma','User Research','Prototyping'], 'interview', 'job_board')
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
