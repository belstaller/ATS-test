// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type ApplicantStatus =
  | 'applied'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'hired'
  | 'rejected';

export const APPLICANT_STATUSES: ApplicantStatus[] = [
  'applied',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
];

/**
 * The channel through which a candidate entered the pipeline.
 * Keeping the list small and explicit avoids free-text drift.
 */
export type ApplicantSource =
  | 'direct'
  | 'linkedin'
  | 'referral'
  | 'job_board'
  | 'agency'
  | 'github'
  | 'other';

export const APPLICANT_SOURCES: ApplicantSource[] = [
  'direct',
  'linkedin',
  'referral',
  'job_board',
  'agency',
  'github',
  'other',
];

// ---------------------------------------------------------------------------
// Core entity
// ---------------------------------------------------------------------------

export interface Applicant {
  id: number;

  // --- Personal details ---
  name: string;
  email: string;
  phone?: string;
  /** Free-text location, e.g. "Berlin, Germany" or "Remote – US". */
  location?: string;

  // --- Professional profile ---
  position?: string;
  /** Number of years of relevant professional experience (non-negative integer). */
  experience_years?: number;
  /** Free-text description of the candidate's education background. */
  education?: string;
  /**
   * Searchable skill keywords stored as a PostgreSQL text array.
   * Returned as a JavaScript string array.
   */
  skills?: string[];

  // --- External links ---
  resume_url?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;

  // --- Hiring pipeline ---
  status: ApplicantStatus;
  /** Expected gross annual salary in the job's currency (positive integer). */
  salary_expected?: number;
  /** ISO-8601 date string indicating when the candidate can start. */
  availability_date?: string;
  /** Source / acquisition channel for this candidate. */
  source?: ApplicantSource;
  /** FK → users.id — the recruiter responsible for this candidate. */
  assigned_to?: number;

  // --- Timestamps ---
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Data-transfer objects
// ---------------------------------------------------------------------------

export interface CreateApplicantDTO {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  position?: string;
  experience_years?: number;
  education?: string;
  skills?: string[];
  resume_url?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  status?: ApplicantStatus;
  salary_expected?: number;
  availability_date?: string;
  source?: ApplicantSource;
  assigned_to?: number;
}

export interface UpdateApplicantDTO {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  position?: string;
  experience_years?: number;
  education?: string;
  skills?: string[];
  resume_url?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  status?: ApplicantStatus;
  salary_expected?: number;
  availability_date?: string;
  source?: ApplicantSource;
  assigned_to?: number;
}

// ---------------------------------------------------------------------------
// Query / pagination helpers
// ---------------------------------------------------------------------------

export interface ApplicantFilters {
  status?: ApplicantStatus;
  source?: ApplicantSource;
  position?: string;
  location?: string;
  /** Comma-separated skill keywords — any match is sufficient. */
  skills?: string;
  assigned_to?: number;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedApplicants {
  data: Applicant[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
