/**
 * OpenAPI 3.0 specification for the ATS REST API.
 *
 * This module exports the spec object so it can be served at
 * GET /api/docs/openapi.json as a plain JSON response — no additional
 * packages are required.
 *
 * The spec is consumed by any OpenAPI-compatible tool (Swagger UI,
 * Redoc, Postman, etc.).
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ATS REST API',
    version: '1.0.0',
    description:
      'Applicant Tracking System — RESTful API for managing applicants, ' +
      'users, notes, and database operations.',
    contact: {
      name: 'ATS Engineering',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'Current server',
    },
  ],

  // ──────────────────────────────────────────────────────────────────────────
  // Security
  // ──────────────────────────────────────────────────────────────────────────
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Obtain a token via POST /api/auth/login, then pass it as ' +
          '`Authorization: Bearer <token>`.',
      },
    },

    // ────────────────────────────────────────────────────────────────────────
    // Reusable schemas
    // ────────────────────────────────────────────────────────────────────────
    schemas: {
      // ── Errors ──────────────────────────────────────────────────────────
      ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'string',
            example: 'Applicant not found',
          },
          status: {
            type: 'integer',
            example: 404,
          },
        },
      },

      // ── Auth ────────────────────────────────────────────────────────────
      RegisterRequest: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', example: 'Alice Example', maxLength: 255 },
          email: {
            type: 'string',
            format: 'email',
            example: 'alice@example.com',
          },
          password: {
            type: 'string',
            format: 'password',
            minLength: 8,
            example: 'MySecurePass1',
          },
          role: {
            $ref: '#/components/schemas/UserRole',
          },
        },
      },

      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            example: 'alice@example.com',
          },
          password: {
            type: 'string',
            format: 'password',
            example: 'MySecurePass1',
          },
        },
      },

      AuthResponse: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description: 'Signed JWT — valid for 8 hours.',
          },
          user: { $ref: '#/components/schemas/UserPublic' },
        },
      },

      // ── Users ────────────────────────────────────────────────────────────
      UserRole: {
        type: 'string',
        enum: ['admin', 'recruiter', 'viewer'],
        example: 'recruiter',
      },

      UserPublic: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Alice Example' },
          email: {
            type: 'string',
            format: 'email',
            example: 'alice@example.com',
          },
          role: { $ref: '#/components/schemas/UserRole' },
          created_at: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-01T00:00:00.000Z',
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-01T00:00:00.000Z',
          },
        },
      },

      PaginatedUsers: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/UserPublic' },
          },
          total: { type: 'integer', example: 42 },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          totalPages: { type: 'integer', example: 3 },
        },
      },

      UpdateUserRoleRequest: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { $ref: '#/components/schemas/UserRole' },
        },
      },

      // ── Applicants ───────────────────────────────────────────────────────
      ApplicantStatus: {
        type: 'string',
        enum: ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'],
        example: 'interview',
      },

      Applicant: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Carol Candidate' },
          email: {
            type: 'string',
            format: 'email',
            example: 'carol@example.com',
          },
          phone: {
            type: 'string',
            nullable: true,
            example: '555-0199',
          },
          position: {
            type: 'string',
            nullable: true,
            example: 'QA Engineer',
          },
          status: { $ref: '#/components/schemas/ApplicantStatus' },
          resume_url: {
            type: 'string',
            format: 'uri',
            nullable: true,
            example: 'https://cdn.example.com/carol-resume.pdf',
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-01T00:00:00.000Z',
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-01T00:00:00.000Z',
          },
        },
      },

      CreateApplicantRequest: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string', maxLength: 255, example: 'Carol Candidate' },
          email: {
            type: 'string',
            format: 'email',
            example: 'carol@example.com',
          },
          phone: {
            type: 'string',
            nullable: true,
            example: '555-0199',
          },
          position: {
            type: 'string',
            maxLength: 255,
            nullable: true,
            example: 'QA Engineer',
          },
          status: { $ref: '#/components/schemas/ApplicantStatus' },
          resume_url: {
            type: 'string',
            format: 'uri',
            nullable: true,
            example: 'https://cdn.example.com/carol-resume.pdf',
          },
        },
      },

      UpdateApplicantRequest: {
        type: 'object',
        minProperties: 1,
        properties: {
          name: { type: 'string', maxLength: 255 },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string', nullable: true },
          position: { type: 'string', maxLength: 255, nullable: true },
          status: { $ref: '#/components/schemas/ApplicantStatus' },
          resume_url: {
            type: 'string',
            format: 'uri',
            nullable: true,
          },
        },
      },

      UpdateApplicantStatusRequest: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { $ref: '#/components/schemas/ApplicantStatus' },
        },
      },

      PaginatedApplicants: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/Applicant' },
          },
          total: { type: 'integer', example: 42 },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          totalPages: { type: 'integer', example: 3 },
        },
      },

      // ── Notes ────────────────────────────────────────────────────────────
      Note: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          applicant_id: { type: 'integer', example: 5 },
          author_id: { type: 'integer', example: 2 },
          author_name: { type: 'string', example: 'Alice Example' },
          body: {
            type: 'string',
            example: 'Strong technical skills, move to on-site interview.',
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            example: '2024-06-15T14:30:00.000Z',
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
            example: '2024-06-15T14:30:00.000Z',
          },
        },
      },

      NoteListResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/Note' },
          },
          total: { type: 'integer', example: 3 },
        },
      },

      CreateNoteRequest: {
        type: 'object',
        required: ['body'],
        properties: {
          body: {
            type: 'string',
            maxLength: 10000,
            example: 'Strong technical skills, move to on-site interview.',
          },
        },
      },

      UpdateNoteRequest: {
        type: 'object',
        required: ['body'],
        properties: {
          body: {
            type: 'string',
            maxLength: 10000,
            example: 'Updated: scheduled on-site for next week.',
          },
        },
      },

      // ── Database / Backup ────────────────────────────────────────────────
      BackupMetadata: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            example: 'backup-2024-06-15T14-30-00.dump',
          },
          filepath: {
            type: 'string',
            example: '/app/backups/backup-2024-06-15T14-30-00.dump',
          },
          sizeBytes: { type: 'integer', example: 204800 },
          createdAt: {
            type: 'string',
            format: 'date-time',
            example: '2024-06-15T14:30:00.000Z',
          },
        },
      },

      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
          uptime: { type: 'number', example: 3600.12 },
        },
      },

      DbHealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
          primary: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'ok' },
              latencyMs: { type: 'integer', example: 3 },
              totalCount: { type: 'integer' },
              idleCount: { type: 'integer' },
              waitingCount: { type: 'integer' },
            },
          },
          replica: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['ok', 'not_configured', 'error'],
              },
              latencyMs: { type: 'integer', nullable: true },
            },
          },
        },
      },
    },

    // ────────────────────────────────────────────────────────────────────────
    // Reusable parameters
    // ────────────────────────────────────────────────────────────────────────
    parameters: {
      IdParam: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'integer', minimum: 1 },
        description: 'Resource identifier (positive integer).',
      },
      NoteIdParam: {
        name: 'noteId',
        in: 'path',
        required: true,
        schema: { type: 'integer', minimum: 1 },
        description: 'Note identifier (positive integer).',
      },
      PageParam: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', minimum: 1, default: 1 },
        description: 'Page number for pagination.',
      },
      LimitParam: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        description: 'Number of items per page (max 100).',
      },
      SearchParam: {
        name: 'search',
        in: 'query',
        schema: { type: 'string' },
        description: 'Free-text search across name, email, and position.',
      },
    },

    // ────────────────────────────────────────────────────────────────────────
    // Reusable responses
    // ────────────────────────────────────────────────────────────────────────
    responses: {
      Unauthorized: {
        description: 'Missing or invalid JWT.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      Forbidden: {
        description: 'Authenticated user lacks the required role.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      NotFound: {
        description: 'The requested resource was not found.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      BadRequest: {
        description: 'Validation error in request body or parameters.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      TooManyRequests: {
        description: 'Rate limit exceeded.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },

  // Global security requirement: all routes default to bearerAuth.
  security: [{ bearerAuth: [] }],

  // ──────────────────────────────────────────────────────────────────────────
  // Tags
  // ──────────────────────────────────────────────────────────────────────────
  tags: [
    {
      name: 'Health',
      description: 'Liveness checks for load-balancers and monitoring.',
    },
    {
      name: 'Auth',
      description: 'Register, log in, and inspect the current user.',
    },
    {
      name: 'Applicants',
      description: 'CRUD operations for candidates in the hiring pipeline.',
    },
    {
      name: 'Notes',
      description: 'Per-applicant notes written by recruiters and admins.',
    },
    {
      name: 'Users',
      description: 'User management — admin only.',
    },
    {
      name: 'Database',
      description: 'Database health, backups, and restore — admin only.',
    },
  ],

  // ──────────────────────────────────────────────────────────────────────────
  // Paths
  // ──────────────────────────────────────────────────────────────────────────
  paths: {
    // ── Health ──────────────────────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Application health check',
        description:
          'Returns the application status, ISO-8601 timestamp, and ' +
          'process uptime in seconds. No authentication required.',
        security: [],
        operationId: 'getHealth',
        responses: {
          200: {
            description: 'Application is healthy.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
        },
      },
    },

    // ── Auth ─────────────────────────────────────────────────────────────────
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        description:
          'Creates a new user account and returns the user object plus a ' +
          'signed JWT. Rate-limited to 20 requests per IP per 15 minutes.',
        security: [],
        operationId: 'register',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'User created.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          409: {
            description: 'Email address is already registered.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          429: { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },

    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in',
        description:
          'Authenticates an existing user and returns the user object plus a ' +
          'signed JWT. Rate-limited to 20 requests per IP per 15 minutes.',
        security: [],
        operationId: 'login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          429: { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },

    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get the current user',
        description: 'Returns the public profile of the authenticated user.',
        operationId: 'getMe',
        responses: {
          200: {
            description: 'Current user.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserPublic' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Applicants ──────────────────────────────────────────────────────────
    '/applicants': {
      get: {
        tags: ['Applicants'],
        summary: 'List applicants',
        description:
          'Returns a paginated, filterable list of applicants. ' +
          'Accessible to all authenticated roles.',
        operationId: 'listApplicants',
        parameters: [
          {
            name: 'status',
            in: 'query',
            schema: { $ref: '#/components/schemas/ApplicantStatus' },
            description: 'Filter by pipeline status.',
          },
          {
            name: 'position',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by position (partial match).',
          },
          { $ref: '#/components/parameters/SearchParam' },
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: {
            description: 'Paginated applicant list.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedApplicants' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Applicants'],
        summary: 'Create an applicant',
        description: 'Creates a new applicant record. Requires admin or recruiter role.',
        operationId: 'createApplicant',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateApplicantRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'Applicant created.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Applicant' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/applicants/{id}': {
      get: {
        tags: ['Applicants'],
        summary: 'Get a single applicant',
        operationId: 'getApplicantById',
        parameters: [{ $ref: '#/components/parameters/IdParam' }],
        responses: {
          200: {
            description: 'Applicant record.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Applicant' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      put: {
        tags: ['Applicants'],
        summary: 'Full update of an applicant',
        description:
          'Replaces editable fields on an applicant record. ' +
          'Requires admin or recruiter role.',
        operationId: 'updateApplicant',
        parameters: [{ $ref: '#/components/parameters/IdParam' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateApplicantRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated applicant.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Applicant' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Applicants'],
        summary: 'Partial update of an applicant',
        description:
          'Updates one or more fields on an applicant record. ' +
          'Requires admin or recruiter role.',
        operationId: 'patchApplicant',
        parameters: [{ $ref: '#/components/parameters/IdParam' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateApplicantRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated applicant.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Applicant' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Applicants'],
        summary: 'Delete an applicant',
        description: 'Permanently removes an applicant record. Requires admin role.',
        operationId: 'deleteApplicant',
        parameters: [{ $ref: '#/components/parameters/IdParam' }],
        responses: {
          204: { description: 'Applicant deleted.' },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/applicants/{id}/status': {
      patch: {
        tags: ['Applicants'],
        summary: 'Update applicant pipeline status',
        description:
          'Convenience endpoint that changes only the `status` field. ' +
          'Requires admin or recruiter role.',
        operationId: 'updateApplicantStatus',
        parameters: [{ $ref: '#/components/parameters/IdParam' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateApplicantStatusRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Applicant with updated status.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Applicant' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Notes ────────────────────────────────────────────────────────────────
    '/applicants/{id}/notes': {
      get: {
        tags: ['Notes'],
        summary: 'List notes for an applicant',
        description:
          'Returns all notes attached to the given applicant, newest first. ' +
          'Accessible to all authenticated roles.',
        operationId: 'listNotes',
        parameters: [{ $ref: '#/components/parameters/IdParam' }],
        responses: {
          200: {
            description: 'Note list.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/NoteListResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      post: {
        tags: ['Notes'],
        summary: 'Add a note to an applicant',
        description:
          'Creates a new note. The authenticated user becomes the note author. ' +
          'Requires admin or recruiter role.',
        operationId: 'createNote',
        parameters: [{ $ref: '#/components/parameters/IdParam' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateNoteRequest' },
            },
          },
        },
        responses: {
          201: {
            description: 'Note created.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Note' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/applicants/{id}/notes/{noteId}': {
      patch: {
        tags: ['Notes'],
        summary: 'Edit a note',
        description:
          'Updates the body of a note. Only the note\'s author or an admin ' +
          'may edit it.',
        operationId: 'updateNote',
        parameters: [
          { $ref: '#/components/parameters/IdParam' },
          { $ref: '#/components/parameters/NoteIdParam' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateNoteRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated note.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Note' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Notes'],
        summary: 'Delete a note',
        description:
          'Permanently removes a note. Only the note\'s author or an admin ' +
          'may delete it.',
        operationId: 'deleteNote',
        parameters: [
          { $ref: '#/components/parameters/IdParam' },
          { $ref: '#/components/parameters/NoteIdParam' },
        ],
        responses: {
          204: { description: 'Note deleted.' },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Users ────────────────────────────────────────────────────────────────
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'List users',
        description: 'Returns a paginated list of users. Requires admin role.',
        operationId: 'listUsers',
        parameters: [
          {
            name: 'role',
            in: 'query',
            schema: { $ref: '#/components/schemas/UserRole' },
            description: 'Filter by role.',
          },
          { $ref: '#/components/parameters/SearchParam' },
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
        ],
        responses: {
          200: {
            description: 'Paginated user list.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedUsers' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/users/{id}': {
      get: {
        tags: ['Users'],
        summary: 'Get a single user',
        description: 'Returns the public profile of a user. Requires admin role.',
        operationId: 'getUserById',
        parameters: [{ $ref: '#/components/parameters/IdParam' }],
        responses: {
          200: {
            description: 'User record.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserPublic' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Users'],
        summary: 'Delete a user',
        description:
          'Permanently removes a user account. Admins cannot delete their ' +
          'own account. Requires admin role.',
        operationId: 'deleteUser',
        parameters: [{ $ref: '#/components/parameters/IdParam' }],
        responses: {
          204: { description: 'User deleted.' },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/users/{id}/role': {
      patch: {
        tags: ['Users'],
        summary: "Update a user's role",
        description:
          'Changes the role of a user. Admins cannot change their own role. ' +
          'Requires admin role.',
        operationId: 'updateUserRole',
        parameters: [{ $ref: '#/components/parameters/IdParam' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateUserRoleRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'User with updated role.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserPublic' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Database ─────────────────────────────────────────────────────────────
    '/db/health': {
      get: {
        tags: ['Database'],
        summary: 'Database health check',
        description:
          'Returns live connectivity and latency metrics for the primary ' +
          'and (if configured) replica pools. Accessible to all authenticated roles.',
        operationId: 'getDbHealth',
        responses: {
          200: {
            description: 'Database health metrics.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DbHealthResponse' },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/db/backups': {
      get: {
        tags: ['Database'],
        summary: 'List backups',
        description: 'Returns all backup files on disk, newest first. Requires admin role.',
        operationId: 'listBackups',
        responses: {
          200: {
            description: 'Backup list.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    backups: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/BackupMetadata' },
                    },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Database'],
        summary: 'Create a backup',
        description:
          'Triggers an on-demand pg_dump backup and returns its metadata. ' +
          'Requires admin role.',
        operationId: 'createBackup',
        responses: {
          201: {
            description: 'Backup created.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Backup created successfully' },
                    backup: { $ref: '#/components/schemas/BackupMetadata' },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          500: {
            description: 'pg_dump failed.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },

    '/db/backups/restore': {
      post: {
        tags: ['Database'],
        summary: 'Restore from a backup',
        description:
          '**Destructive** — drops and recreates all objects in the target ' +
          'database from the specified backup file. Requires admin role.',
        operationId: 'restoreBackup',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['filename'],
                properties: {
                  filename: {
                    type: 'string',
                    example: 'backup-2024-06-15T14-30-00.dump',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Restore completed.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Database restored successfully from …' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          500: {
            description: 'pg_restore failed.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
  },
};
