// ---------------------------------------------------------------------------
// Enumerations  (mirror server/types/applicant.ts)
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
  id: string;

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
  /** Searchable skill keywords. */
  skills?: string[];

  // --- External links ---
  resume_url?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;

  // --- Hiring pipeline ---
  status: ApplicantStatus;
  /** Expected gross annual salary (positive integer). */
  salary_expected?: number;
  /** ISO-8601 date string (YYYY-MM-DD) indicating when the candidate can start. */
  availability_date?: string;
  /** Source / acquisition channel for this candidate. */
  source?: ApplicantSource;
  /** ID of the recruiter responsible for this candidate. */
  assigned_to?: number;

  // --- Timestamps ---
  created_at: string;
  updated_at: string;
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
// Query / pagination helpers  (mirror server/types/applicant.ts)
// ---------------------------------------------------------------------------

export interface ApplicantFilters {
  status?: ApplicantStatus;
  source?: ApplicantSource;
  position?: string;
  location?: string;
  /** Comma-separated skill keywords — ALL must be present on the candidate. */
  skills?: string;
  assigned_to?: number;
  /** Minimum years of experience (inclusive). */
  experience_years_min?: number;
  /** Maximum years of experience (inclusive). */
  experience_years_max?: number;
  /** Free-text search across name, email, position and location. */
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
