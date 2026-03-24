/**
 * Resume Parser Service
 * ---------------------
 * Extracts structured candidate data from plain-text resume content using
 * pattern-matching, heuristics, and a curated technology skills dictionary.
 *
 * Design goals
 * ─────────────
 * • Zero runtime dependencies — pure TypeScript regex / string logic.
 * • Each extraction function is independently testable and exported.
 * • The top-level `parseResume()` function orchestrates all extractors and
 *   computes an overall confidence score.
 *
 * Extraction coverage
 * ────────────────────
 * • Name          — first non-empty line heuristic + common header patterns
 * • Email         — RFC-5321 simplified regex
 * • Phone         — international & domestic formats
 * • Location      — city/state/country patterns, "Remote" keyword
 * • Position      — section headers + proximity to candidate name
 * • Experience    — dated job entries in common resume formats
 * • Education     — degree keywords + institution detection
 * • Skills        — curated dictionary match (case-insensitive)
 * • URLs          — LinkedIn, GitHub and generic portfolio URLs
 * • Experience yrs— computed from dated entries; falls back to explicit text
 */

import {
  ParsedResume,
  ResumeExperienceEntry,
  ResumeEducationEntry,
} from '../types/resume';

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Maximum number of skills to return. */
const MAX_SKILLS = 50;

/**
 * Curated dictionary of technology and professional skills.
 * Grouped into categories for maintainability; flattened at module load.
 */
const SKILLS_DICTIONARY: readonly string[] = [
  // ── Languages ──────────────────────────────────────────────────────────────
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Kotlin', 'Swift', 'Objective-C',
  'C', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP', 'Scala', 'R', 'MATLAB',
  'Perl', 'Lua', 'Dart', 'Haskell', 'Elixir', 'Erlang', 'Clojure', 'F#',
  'VBA', 'Groovy', 'Shell', 'Bash', 'PowerShell', 'SQL', 'PL/SQL', 'T-SQL',
  'COBOL', 'Fortran', 'Assembly',

  // ── Web / frontend ─────────────────────────────────────────────────────────
  'HTML', 'CSS', 'SCSS', 'Sass', 'Less', 'React', 'Vue.js', 'Angular',
  'Next.js', 'Nuxt.js', 'Svelte', 'jQuery', 'Bootstrap', 'Tailwind CSS',
  'Material UI', 'Webpack', 'Vite', 'Babel', 'ESLint', 'Prettier',
  'GraphQL', 'REST', 'WebSocket', 'gRPC',

  // ── Backend / runtime ──────────────────────────────────────────────────────
  'Node.js', 'Express', 'Fastify', 'Nest.js', 'Django', 'Flask', 'FastAPI',
  'Spring', 'Spring Boot', 'Laravel', 'Symfony', 'Rails', 'ASP.NET',
  'Gin', 'Echo', 'Fiber',

  // ── Databases ──────────────────────────────────────────────────────────────
  'PostgreSQL', 'MySQL', 'SQLite', 'MariaDB', 'Oracle', 'SQL Server',
  'MongoDB', 'Redis', 'Cassandra', 'DynamoDB', 'Elasticsearch',
  'CouchDB', 'Neo4j', 'InfluxDB', 'Firestore',

  // ── Cloud & infrastructure ─────────────────────────────────────────────────
  'AWS', 'GCP', 'Azure', 'Heroku', 'Vercel', 'Netlify', 'DigitalOcean',
  'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Helm', 'Pulumi',
  'Jenkins', 'GitHub Actions', 'CircleCI', 'Travis CI', 'GitLab CI',
  'Nginx', 'Apache', 'Caddy',

  // ── Data & ML ──────────────────────────────────────────────────────────────
  'TensorFlow', 'PyTorch', 'Keras', 'scikit-learn', 'Pandas', 'NumPy',
  'Matplotlib', 'Seaborn', 'Spark', 'Hadoop', 'Kafka', 'Airflow',
  'dbt', 'Looker', 'Tableau', 'Power BI',

  // ── Mobile ─────────────────────────────────────────────────────────────────
  'React Native', 'Flutter', 'Ionic', 'Xamarin', 'Cordova',

  // ── Testing ────────────────────────────────────────────────────────────────
  'Jest', 'Mocha', 'Chai', 'Cypress', 'Playwright', 'Selenium',
  'JUnit', 'pytest', 'RSpec', 'PHPUnit',

  // ── Tools & practices ──────────────────────────────────────────────────────
  'Git', 'GitHub', 'GitLab', 'Bitbucket', 'Jira', 'Confluence',
  'Linux', 'Unix', 'macOS', 'Windows', 'Agile', 'Scrum', 'Kanban',
  'CI/CD', 'DevOps', 'TDD', 'BDD', 'Microservices', 'Serverless',
  'OAuth', 'JWT', 'OpenID', 'SAML',

  // ── Design / UX ────────────────────────────────────────────────────────────
  'Figma', 'Sketch', 'Adobe XD', 'InVision', 'Zeplin',

  // ── Soft / professional ────────────────────────────────────────────────────
  'Leadership', 'Communication', 'Project Management', 'Product Management',
];

/** Pre-built set of lower-case skill names for O(1) lookups. */
const SKILLS_LOWER_MAP: Map<string, string> = new Map(
  SKILLS_DICTIONARY.map((s) => [s.toLowerCase(), s])
);

// ---------------------------------------------------------------------------
// Section-header patterns (used by multiple extractors)
// ---------------------------------------------------------------------------

/** Regex that matches a line containing only a section heading. */
const SECTION_HEADER_RE =
  /^[\s]*(?:EXPERIENCE|WORK\s+EXPERIENCE|EMPLOYMENT|PROFESSIONAL\s+EXPERIENCE|CAREER\s+HISTORY|WORK\s+HISTORY|EDUCATION|ACADEMIC|SKILLS?|TECHNICAL\s+SKILLS?|TECHNOLOGIES|PROFICIENCIES|SUMMARY|OBJECTIVE|PROFILE|CONTACT|LINKS?|PROJECTS?|CERTIFICATIONS?|PUBLICATIONS?|AWARDS?|LANGUAGES?)/i;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Splits text into trimmed, non-empty lines.
 */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
}

/**
 * Detects whether a line looks like a section header and should not be
 * treated as candidate content.
 */
export function isSectionHeader(line: string): boolean {
  return SECTION_HEADER_RE.test(line);
}

/**
 * Returns the text content between two section headers (exclusive).
 * If `endHeader` is omitted the content runs until the next section header
 * or end of document.
 */
export function extractSection(
  lines: string[],
  headerPattern: RegExp
): string[] {
  const startIdx = lines.findIndex((l) => headerPattern.test(l));
  if (startIdx === -1) return [];

  const sectionLines: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (SECTION_HEADER_RE.test(lines[i]) && !headerPattern.test(lines[i])) break;
    sectionLines.push(lines[i]);
  }
  return sectionLines;
}

// ---------------------------------------------------------------------------
// Email extractor
// ---------------------------------------------------------------------------

/** Simplified RFC-5321 email pattern. */
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/**
 * Extracts the first e-mail address found in the text.
 */
export function extractEmail(text: string): string | undefined {
  const matches = text.match(EMAIL_RE);
  return matches ? matches[0].toLowerCase() : undefined;
}

// ---------------------------------------------------------------------------
// Phone extractor
// ---------------------------------------------------------------------------

/**
 * Matches common phone number formats:
 *  • +1 (555) 555-5555
 *  • (555) 555-5555
 *  • 555-555-5555
 *  • 555.555.5555
 *  • +44 7700 900123
 *  • 07700900123
 */
const PHONE_RE =
  /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}(?:[\s\-.]?\d{1,4})?/g;

/**
 * Extracts and normalises the first phone number found in the text.
 */
export function extractPhone(text: string): string | undefined {
  const matches = text.match(PHONE_RE);
  if (!matches) return undefined;

  // Filter out pure year ranges (e.g. "2019-2022") and short numbers
  const filtered = matches.filter((m) => {
    const digits = m.replace(/\D/g, '');
    return digits.length >= 7 && !/^\d{4}[\s\-–—]\d{4}$/.test(m.trim());
  });

  return filtered.length > 0 ? filtered[0].trim() : undefined;
}

// ---------------------------------------------------------------------------
// URL extractors
// ---------------------------------------------------------------------------

const LINKEDIN_RE = /https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s,)"'<>\]]+/gi;
const GITHUB_RE = /https?:\/\/(?:www\.)?github\.com\/[^\s,)"'<>\]]+/gi;

/**
 * A conservative generic URL pattern targeting personal/portfolio sites.
 * Excludes linkedin and github which have their own extractors.
 */
const GENERIC_URL_RE = /https?:\/\/(?!(?:www\.)?(?:linkedin|github)\.com)[^\s,)"'<>\]]{4,}/gi;

export function extractLinkedInUrl(text: string): string | undefined {
  const m = text.match(LINKEDIN_RE);
  return m ? m[0] : undefined;
}

export function extractGitHubUrl(text: string): string | undefined {
  const m = text.match(GITHUB_RE);
  return m ? m[0] : undefined;
}

/**
 * Extracts a portfolio / personal site URL.
 * Skips known professional-network domains to avoid duplicating
 * linkedinUrl / githubUrl.
 */
export function extractPortfolioUrl(text: string): string | undefined {
  const m = text.match(GENERIC_URL_RE);
  if (!m) return undefined;
  // Prefer a URL that contains the candidate's name or common portfolio
  // patterns but just return the first clean match.
  return m[0];
}

// ---------------------------------------------------------------------------
// Name extractor
// ---------------------------------------------------------------------------

/**
 * Known professional suffixes that should NOT be treated as part of a name.
 * (All-caps variants are compared case-insensitively.)
 */
const NON_NAME_TOKENS = new Set([
  'resume', 'cv', 'curriculum', 'vitae', 'curriculum vitae',
  'summary', 'objective', 'profile', 'contact', 'experience',
  'education', 'skills', 'projects', 'references',
]);

/**
 * Attempts to extract the candidate's full name from the resume text.
 *
 * Strategy (in order):
 *  1. Check if the first non-empty, non-URL, non-email line looks like a name
 *     (2–5 capitalized words, no special chars beyond hyphens/apostrophes).
 *  2. Look for "Name:" label patterns.
 */
export function extractName(lines: string[]): string | undefined {
  // Strategy 1 — first non-trivial line heuristic
  for (const line of lines.slice(0, 8)) {
    // Skip lines that are obviously not names
    if (EMAIL_RE.test(line)) continue;
    if (PHONE_RE.test(line) && line.replace(/\D/g, '').length >= 7) continue;
    if (/https?:\/\//i.test(line)) continue;
    if (isSectionHeader(line)) continue;
    if (NON_NAME_TOKENS.has(line.toLowerCase())) continue;

    // A name line typically has 2–5 words, each starting with a capital letter
    // Words may include hyphens (e.g. "Mary-Jane") or apostrophes (e.g. "O'Brien")
    const NAME_RE = /^([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+){1,4})$/;
    if (NAME_RE.test(line)) return line;
  }

  // Strategy 2 — explicit "Name:" label
  for (const line of lines.slice(0, 15)) {
    const match = line.match(/^(?:Name|Full\s+Name)\s*[:\-]\s*(.+)/i);
    if (match) {
      const candidate = match[1].trim();
      if (candidate.length > 0 && candidate.length <= 100) return candidate;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Location extractor
// ---------------------------------------------------------------------------

/**
 * Common US state abbreviations used to anchor city/state patterns.
 */
const US_STATES =
  'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';

/**
 * "City, ST" or "City, State" or "City, Country"
 *
 * Matched on a single line.  The city portion is 1–3 space-separated words
 * (to avoid spanning across lines or matching full candidate names).
 * City words may contain hyphens (e.g. "Winston-Salem").
 */
const LOCATION_CITY_STATE_RE = new RegExp(
  `^([A-Z][a-zA-Z\\-]+(?:[ ][A-Z][a-zA-Z\\-]+){0,2}),[ ]*(?:${US_STATES}|[A-Z][a-zA-Z]{2,})`,
  ''
);

/** Explicit "Remote" or "Remote – US" patterns. */
const REMOTE_RE = /\bRemote(?:\s*[–\-]\s*[A-Za-z\s]+)?\b/i;

/**
 * Extracts the first location-like string from the resume.
 *
 * Checks for:
 * 1. "Location:" / "Address:" label
 * 2. "Remote" keyword
 * 3. "City, State/Country" pattern in the first 20 lines
 */
export function extractLocation(lines: string[]): string | undefined {
  // 1. Explicit label
  for (const line of lines.slice(0, 25)) {
    const match = line.match(/^(?:Location|Address|City)\s*[:\-]\s*(.+)/i);
    if (match) return match[1].trim();
  }

  // 2. Remote keyword in header area
  for (const line of lines.slice(0, 20)) {
    if (REMOTE_RE.test(line)) {
      const m = line.match(REMOTE_RE);
      return m ? m[0].trim() : 'Remote';
    }
  }

  // 3. City, State pattern — test each header line individually to avoid
  //    spanning across lines and matching partial name tokens.
  for (const line of lines.slice(0, 20)) {
    const m = LOCATION_CITY_STATE_RE.exec(line);
    if (m) return m[0].trim();
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Skills extractor
// ---------------------------------------------------------------------------

/**
 * Extracts skills from the resume text.
 *
 * Strategy:
 *  1. Find the "Skills" section (if present) and look for dictionary matches.
 *  2. Fall back to scanning the entire text for dictionary matches.
 *
 * Returns a deduplicated, capped list preserving canonical casing from the
 * dictionary.
 */
export function extractSkills(text: string, lines: string[]): string[] {
  const SKILLS_SECTION_RE =
    /^(?:SKILLS?|TECHNICAL\s+SKILLS?|TECHNOLOGIES|PROFICIENCIES|CORE\s+COMPETENCIES)/i;

  // Try skills section first for higher accuracy
  const sectionLines = extractSection(lines, SKILLS_SECTION_RE);
  const sourceText = sectionLines.length > 0 ? sectionLines.join(' ') : text;

  const found = new Map<string, string>(); // lower → canonical

  for (const [lower, canonical] of SKILLS_LOWER_MAP) {
    // Use word-boundary anchored regex to avoid false matches
    // e.g. "C" should not match inside "Clojure"
    const boundary = /^[a-zA-Z]/.test(lower) ? '\\b' : '';
    try {
      const re = new RegExp(`${boundary}${escapeRegex(lower)}${boundary}`, 'i');
      if (re.test(sourceText)) {
        found.set(lower, canonical);
      }
    } catch {
      // Skip malformed patterns
    }
  }

  // If skills section found nothing, scan full text
  if (found.size === 0 && sectionLines.length > 0) {
    for (const [lower, canonical] of SKILLS_LOWER_MAP) {
      const boundary = /^[a-zA-Z]/.test(lower) ? '\\b' : '';
      try {
        const re = new RegExp(`${boundary}${escapeRegex(lower)}${boundary}`, 'i');
        if (re.test(text)) {
          found.set(lower, canonical);
        }
      } catch {
        // Skip malformed patterns
      }
    }
  }

  return Array.from(found.values()).slice(0, MAX_SKILLS);
}

/** Escapes special regex metacharacters in a string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Experience extractor
// ---------------------------------------------------------------------------

/**
 * Year-range pattern — matches "2019 – 2022", "2019-2022", "2019 to 2022",
 * "2020 – Present", "Jan 2019 – Dec 2022", "03/2018 – 07/2021", etc.
 */
const YEAR_RANGE_RE =
  /(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.\s]+)?(\d{4})\s*(?:–|—|-|to)\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.\s]+)?(\d{4}|Present|Current|Now|present|current|now)/gi;

/**
 * Extracts work-experience entries from the resume.
 *
 * Each entry is anchored by a year-range on the same line or the adjacent line,
 * and the job title is inferred from nearby text.
 */
export function extractExperience(lines: string[]): ResumeExperienceEntry[] {
  const EXPERIENCE_SECTION_RE =
    /^(?:EXPERIENCE|WORK\s+EXPERIENCE|EMPLOYMENT|PROFESSIONAL\s+EXPERIENCE|CAREER\s+HISTORY|WORK\s+HISTORY)/i;

  const sectionLines = extractSection(lines, EXPERIENCE_SECTION_RE);
  const searchLines = sectionLines.length > 0 ? sectionLines : lines;

  const entries: ResumeExperienceEntry[] = [];
  const currentYear = new Date().getFullYear();

  for (let i = 0; i < searchLines.length; i++) {
    const line = searchLines[i];
    YEAR_RANGE_RE.lastIndex = 0;
    const rangeMatch = YEAR_RANGE_RE.exec(line);

    if (!rangeMatch) continue;

    const startYear = parseInt(rangeMatch[1], 10);
    const endRaw = rangeMatch[2];
    const endYear =
      /present|current|now/i.test(endRaw) ? null : parseInt(endRaw, 10);

    // Validate years are plausible
    if (startYear < 1950 || startYear > currentYear) continue;
    if (endYear !== null && (endYear < startYear || endYear > currentYear + 1)) continue;

    // Look for a job title on the same line (before the year-range) or the
    // immediately preceding non-empty line.
    let title = '';
    const beforeRange = line.slice(0, rangeMatch.index).trim();
    if (beforeRange.length >= 2 && !isSectionHeader(beforeRange)) {
      title = beforeRange;
    } else if (i > 0 && searchLines[i - 1].trim().length > 0) {
      title = searchLines[i - 1].trim();
    }

    // Look for company name on the same line (after the year-range) or the
    // line following the date line.
    let company: string | undefined;
    const afterRange = line.slice(rangeMatch.index + rangeMatch[0].length).trim();
    if (afterRange.length >= 2) {
      // Strip common separators like "|", "·", "@", "at "
      company = afterRange.replace(/^[|·@]\s*/, '').replace(/^at\s+/i, '').trim() || undefined;
    } else if (i + 1 < searchLines.length && !YEAR_RANGE_RE.test(searchLines[i + 1])) {
      const nextLine = searchLines[i + 1].trim();
      if (nextLine.length > 0 && !isSectionHeader(nextLine)) {
        company = nextLine;
      }
    }

    if (title.length > 0) {
      entries.push({
        title: title.slice(0, 200),
        company: company?.slice(0, 200),
        startYear,
        endYear,
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Experience years calculator
// ---------------------------------------------------------------------------

/**
 * Computes total years of experience.
 *
 * Priority:
 *  1. Sum durations from extracted work-history entries.
 *  2. Explicit "X years of experience" statement in the text.
 *
 * Returns `undefined` when neither source yields a credible result.
 */
export function computeExperienceYears(
  experience: ResumeExperienceEntry[],
  text: string
): number | undefined {
  const currentYear = new Date().getFullYear();

  if (experience.length > 0) {
    let total = 0;
    for (const entry of experience) {
      const start = entry.startYear;
      if (!start) continue;
      const end = entry.endYear === null ? currentYear : (entry.endYear ?? currentYear);
      const duration = end - start;
      if (duration > 0) total += duration;
    }
    if (total > 0) return total;
  }

  // Fallback: "X years of experience" / "X+ years" patterns
  const YEARS_RE = /(\d{1,2})\+?\s*years?\s+(?:of\s+)?(?:professional\s+)?experience/i;
  const m = text.match(YEARS_RE);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n <= 60) return n;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Position extractor
// ---------------------------------------------------------------------------

/**
 * Extracts the candidate's primary / most recent job title.
 *
 * Strategy:
 *  1. Take the title from the most recent experience entry (first entry,
 *     since we preserve resume ordering which is usually newest-first).
 *  2. Look for an explicit "Title:" / "Position:" label in the header area.
 *  3. Scan the first 15 lines for known title-indicator keywords
 *     (e.g. "Engineer", "Developer", "Manager", …).
 */
export function extractPosition(
  experience: ResumeExperienceEntry[],
  lines: string[]
): string | undefined {
  // 1. From work history
  if (experience.length > 0 && experience[0].title) {
    return experience[0].title;
  }

  // 2. Explicit label
  for (const line of lines.slice(0, 20)) {
    const match = line.match(/^(?:Title|Position|Role|Job\s+Title)\s*[:\-]\s*(.+)/i);
    if (match) return match[1].trim();
  }

  // 3. Heuristic scan of the top of the resume
  const TITLE_KEYWORDS_RE =
    /\b(?:Engineer|Developer|Architect|Manager|Director|Lead|Head|VP|President|Analyst|Designer|Consultant|Specialist|Scientist|Administrator|Officer|Coordinator|Recruiter|Marketer|Accountant|Writer|Editor|Researcher|Intern)\b/i;

  for (const line of lines.slice(0, 15)) {
    if (TITLE_KEYWORDS_RE.test(line) && !isSectionHeader(line) && !EMAIL_RE.test(line)) {
      return line;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Education extractor
// ---------------------------------------------------------------------------

const DEGREE_RE =
  /\b(?:B\.?S\.?c?\.?|B\.?A\.?|M\.?S\.?c?\.?|M\.?A\.?|M\.?B\.?A\.?|Ph\.?D\.?|LL\.?B\.?|LL\.?M\.?|Associate(?:'s)?|Bachelor(?:'s)?|Master(?:'s)?|Doctoral?|Doctor\s+of|Doctor|Degree|Diploma|Certificate)\b/i;

const GRADUATION_YEAR_RE = /\b(19[89]\d|20[0-3]\d)\b/g;

/**
 * Extracts education entries from the resume.
 *
 * Detection is keyed on degree keywords; institution names are inferred
 * from text on adjacent lines.  Graduation year is the last 4-digit year
 * appearing near the degree entry.
 */
export function extractEducation(lines: string[]): ResumeEducationEntry[] {
  const EDUCATION_SECTION_RE =
    /^(?:EDUCATION|ACADEMIC(?:\s+BACKGROUND)?|ACADEMIC\s+QUALIFICATIONS?)/i;

  const sectionLines = extractSection(lines, EDUCATION_SECTION_RE);
  const searchLines = sectionLines.length > 0 ? sectionLines : lines;

  const entries: ResumeEducationEntry[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < searchLines.length; i++) {
    const line = searchLines[i];
    if (!DEGREE_RE.test(line)) continue;

    // Determine institution: prefer the line above if it doesn't contain
    // a degree keyword itself and isn't a section header.
    let institution = '';
    if (i > 0 && !DEGREE_RE.test(searchLines[i - 1]) && !isSectionHeader(searchLines[i - 1])) {
      institution = searchLines[i - 1].trim();
    }

    // Extract the degree description from this line
    const degree = line.trim().slice(0, 200);

    // Find the most recent graduation year in this line or the next line
    let graduationYear: number | undefined;
    const yearContext = [line, searchLines[i + 1] ?? ''].join(' ');
    GRADUATION_YEAR_RE.lastIndex = 0;
    let yearMatch: RegExpExecArray | null;
    while ((yearMatch = GRADUATION_YEAR_RE.exec(yearContext)) !== null) {
      graduationYear = parseInt(yearMatch[1], 10);
    }

    const key = `${institution}|${degree}`;
    if (!seen.has(key)) {
      seen.add(key);
      entries.push({
        institution: institution || 'Unknown Institution',
        degree,
        graduationYear,
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Confidence score
// ---------------------------------------------------------------------------

/**
 * Computes a confidence score in [0, 1] based on how many key fields were
 * successfully populated.  Heavier weight is given to the most important
 * fields (name, email, skills, experience).
 */
export function computeConfidence(result: Omit<ParsedResume, 'confidence'>): number {
  const weights: Array<[boolean, number]> = [
    [!!result.name, 2],
    [!!result.email, 2],
    [!!result.phone, 1],
    [!!result.location, 1],
    [!!result.position, 1.5],
    [result.skills.length > 0, 2],
    [result.experience.length > 0, 2],
    [result.education.length > 0, 1.5],
    [result.experienceYears !== undefined, 1],
    [!!result.linkedinUrl || !!result.githubUrl, 0.5],
  ];

  const [earned, total] = weights.reduce(
    ([e, t], [present, w]) => [e + (present ? w : 0), t + w],
    [0, 0]
  );

  return Math.round((earned / total) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Parses a plain-text resume and returns structured candidate data.
 *
 * @param content - The plain-text content of the resume.
 * @returns A {@link ParsedResume} object with all detectable fields populated.
 */
export function parseResume(content: string): ParsedResume {
  const lines = splitLines(content);

  // Run all extractors
  const email = extractEmail(content);
  const phone = extractPhone(content);
  const linkedinUrl = extractLinkedInUrl(content);
  const githubUrl = extractGitHubUrl(content);
  const portfolioUrl = extractPortfolioUrl(content);
  const name = extractName(lines);
  const location = extractLocation(lines);
  const skills = extractSkills(content, lines);
  const experience = extractExperience(lines);
  const education = extractEducation(lines);
  const experienceYears = computeExperienceYears(experience, content);
  const position = extractPosition(experience, lines);

  const partial: Omit<ParsedResume, 'confidence'> = {
    name,
    email,
    phone,
    location,
    position,
    experienceYears,
    experience,
    education,
    skills,
    linkedinUrl,
    githubUrl,
    portfolioUrl,
  };

  return {
    ...partial,
    confidence: computeConfidence(partial),
  };
}
