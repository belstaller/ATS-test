// ---------------------------------------------------------------------------
// Resume Parsing — types
// ---------------------------------------------------------------------------

/**
 * The raw input accepted by the resume parser.
 * Plain-text content of a resume/CV.
 */
export interface ResumeParseRequest {
  /** Plain-text content of the resume to parse. */
  content: string;
}

/**
 * A single work-experience entry extracted from a resume.
 */
export interface ResumeExperienceEntry {
  /** Job title / role, e.g. "Senior Software Engineer". */
  title: string;
  /** Employer / company name, when detectable. */
  company?: string;
  /** Start year as a four-digit number, e.g. 2019. */
  startYear?: number;
  /** End year as a four-digit number, or null when the role is current. */
  endYear?: number | null;
}

/**
 * A single education entry extracted from a resume.
 */
export interface ResumeEducationEntry {
  /** School / university name. */
  institution: string;
  /** Degree title, e.g. "B.Sc. Computer Science". */
  degree?: string;
  /** Graduation year, e.g. 2018. */
  graduationYear?: number;
}

/**
 * The structured data extracted from a resume by the parser.
 * Every field is optional — the parser only populates fields it can
 * confidently detect.  Consumers should treat absent fields as unknown.
 */
export interface ParsedResume {
  // ── Identity ───────────────────────────────────────────────────────────────
  /** Candidate's full name. */
  name?: string;

  // ── Contact ────────────────────────────────────────────────────────────────
  /** Primary e-mail address. */
  email?: string;
  /** Phone number, normalised to a clean string. */
  phone?: string;
  /** Location string, e.g. "New York, NY" or "Remote". */
  location?: string;

  // ── Professional profile ───────────────────────────────────────────────────
  /** Most recent / primary job title. */
  position?: string;
  /**
   * Total years of professional experience.
   * Computed from dated work history; falls back to explicit mentions
   * such as "5 years of experience".
   */
  experienceYears?: number;

  // ── Structured history ─────────────────────────────────────────────────────
  /** Ordered list of work-experience entries (most recent first). */
  experience: ResumeExperienceEntry[];
  /** List of education entries. */
  education: ResumeEducationEntry[];

  // ── Skills ─────────────────────────────────────────────────────────────────
  /**
   * Deduplicated list of detected technical / professional skills.
   * Capped at 50 entries.
   */
  skills: string[];

  // ── External links ─────────────────────────────────────────────────────────
  /** LinkedIn profile URL, if present in the resume text. */
  linkedinUrl?: string;
  /** GitHub profile URL, if present in the resume text. */
  githubUrl?: string;
  /** Portfolio / personal website URL, if present in the resume text. */
  portfolioUrl?: string;

  // ── Parser metadata ────────────────────────────────────────────────────────
  /**
   * Estimated confidence score in [0, 1].
   * Reflects how much structured data was successfully extracted relative
   * to the total number of expected fields.
   */
  confidence: number;
}
