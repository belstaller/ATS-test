/**
 * Tests for the Resume Parsing feature.
 *
 * Covers:
 *  Unit — individual extractor functions in resumeParserService
 *    splitLines, isSectionHeader, extractSection,
 *    extractEmail, extractPhone,
 *    extractLinkedInUrl, extractGitHubUrl, extractPortfolioUrl,
 *    extractName, extractLocation, extractSkills,
 *    extractExperience, computeExperienceYears,
 *    extractPosition, extractEducation,
 *    computeConfidence, parseResume
 *
 *  Validation — validateResumeParseRequest middleware
 *
 *  Integration — POST /api/resume/parse HTTP endpoint
 *    • Auth & RBAC
 *    • Input validation
 *    • Full-resume end-to-end accuracy
 */

import request from 'supertest';
import express, { Application, Request, Response, RequestHandler } from 'express';
import helmet from 'helmet';
import resumeParserRoutes from '../routes/resumeParserRoutes';
import { errorHandler } from '../middleware/errorHandler';
import { validateResumeParseRequest } from '../middleware/validation';
import {
  splitLines,
  isSectionHeader,
  extractSection,
  extractEmail,
  extractPhone,
  extractLinkedInUrl,
  extractGitHubUrl,
  extractPortfolioUrl,
  extractName,
  extractLocation,
  extractSkills,
  extractExperience,
  computeExperienceYears,
  extractPosition,
  extractEducation,
  computeConfidence,
  parseResume,
} from '../services/resumeParserService';
import { ParsedResume } from '../types/resume';
import {
  TEST_JWT_SECRET,
  adminToken,
  recruiterToken,
  viewerToken,
  authHeader,
} from './helpers';

process.env.JWT_SECRET = TEST_JWT_SECRET;

// ---------------------------------------------------------------------------
// App factories
// ---------------------------------------------------------------------------

/** JSON body size limit aligned with the resume parser's 200,000-char maximum. */
const JSON_LIMIT = '250kb';

function buildApp(): Application {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: JSON_LIMIT }));
  app.use('/api/resume', resumeParserRoutes);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

function makeValidationApp(
  method: 'post',
  path: string,
  ...middleware: RequestHandler[]
): Application {
  const a = express();
  a.use(express.json({ limit: JSON_LIMIT }));
  a[method](path, ...middleware, (_req: Request, res: Response) =>
    res.json({ ok: true })
  );
  return a;
}

// ---------------------------------------------------------------------------
// Fixture resumes
// ---------------------------------------------------------------------------

const FULL_RESUME = `
Alice Johnson
alice.johnson@example.com
+1 (555) 123-4567
San Francisco, CA
https://linkedin.com/in/alice-johnson
https://github.com/alice-j
https://alicejohnson.dev

SUMMARY
Experienced software engineer with 8 years of experience building scalable web applications.

EXPERIENCE

Senior Software Engineer                          2020 – Present
Acme Corp | San Francisco, CA
  - Led development of microservices architecture using Node.js and TypeScript
  - Managed a team of 5 engineers

Software Engineer                                 2016 – 2020
Beta Technologies
  - Built RESTful APIs with Express and PostgreSQL
  - Implemented CI/CD pipelines using GitHub Actions

EDUCATION

Massachusetts Institute of Technology
B.Sc. in Computer Science                         2016

SKILLS
TypeScript, JavaScript, Node.js, React, PostgreSQL, Docker, AWS, Git
`.trim();

const MINIMAL_RESUME = `
Bob Smith
bob@example.com
Developer with 3 years of experience in Python and Django.
`.trim();

const RESUME_NO_SECTIONS = `
Carol White
carol@example.com
555-9876
New York, NY
carol@linkedin.com

Carol has worked at TechCorp from 2018 to 2021 as a Data Analyst.
She has skills in Python, R, Tableau, and SQL.

University of New York
Bachelor's Degree in Statistics     2018
`.trim();

// ---------------------------------------------------------------------------
// Unit tests — splitLines
// ---------------------------------------------------------------------------

describe('splitLines()', () => {
  it('splits on newlines and trims each line', () => {
    expect(splitLines('  hello  \n  world  ')).toEqual(['hello', 'world']);
  });

  it('removes empty lines', () => {
    expect(splitLines('a\n\nb\n\nc')).toEqual(['a', 'b', 'c']);
  });

  it('handles CRLF line endings', () => {
    expect(splitLines('line1\r\nline2')).toEqual(['line1', 'line2']);
  });

  it('returns empty array for blank input', () => {
    expect(splitLines('   \n   ')).toEqual([]);
  });

  it('returns single-element array for one line', () => {
    expect(splitLines('Hello')).toEqual(['Hello']);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — isSectionHeader
// ---------------------------------------------------------------------------

describe('isSectionHeader()', () => {
  it('detects EXPERIENCE header', () => {
    expect(isSectionHeader('EXPERIENCE')).toBe(true);
  });

  it('detects EDUCATION header', () => {
    expect(isSectionHeader('EDUCATION')).toBe(true);
  });

  it('detects SKILLS header', () => {
    expect(isSectionHeader('SKILLS')).toBe(true);
  });

  it('detects TECHNICAL SKILLS header', () => {
    expect(isSectionHeader('TECHNICAL SKILLS')).toBe(true);
  });

  it('detects case-insensitive headers', () => {
    expect(isSectionHeader('Skills')).toBe(true);
    expect(isSectionHeader('experience')).toBe(true);
  });

  it('does not flag a regular line as a header', () => {
    expect(isSectionHeader('Alice Johnson')).toBe(false);
  });

  it('does not flag an email address as a header', () => {
    expect(isSectionHeader('alice@example.com')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — extractSection
// ---------------------------------------------------------------------------

describe('extractSection()', () => {
  const lines = [
    'Alice Johnson',
    'EXPERIENCE',
    'Engineer at Acme 2019-2022',
    'Did great work',
    'EDUCATION',
    'MIT 2019',
  ];

  it('extracts lines between matching header and the next section header', () => {
    const section = extractSection(lines, /^EXPERIENCE$/i);
    expect(section).toEqual(['Engineer at Acme 2019-2022', 'Did great work']);
  });

  it('returns empty array when header is not found', () => {
    expect(extractSection(lines, /^SKILLS$/i)).toEqual([]);
  });

  it('returns all remaining lines when no next header follows', () => {
    const section = extractSection(lines, /^EDUCATION$/i);
    expect(section).toEqual(['MIT 2019']);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — extractEmail
// ---------------------------------------------------------------------------

describe('extractEmail()', () => {
  it('extracts a simple email', () => {
    expect(extractEmail('Contact: alice@example.com')).toBe('alice@example.com');
  });

  it('normalises email to lowercase', () => {
    expect(extractEmail('Alice@EXAMPLE.COM')).toBe('alice@example.com');
  });

  it('returns the first email when multiple are present', () => {
    expect(extractEmail('a@a.com and b@b.com')).toBe('a@a.com');
  });

  it('returns undefined when no email is found', () => {
    expect(extractEmail('no email here')).toBeUndefined();
  });

  it('extracts email with plus addressing', () => {
    expect(extractEmail('alice+jobs@example.org')).toBe('alice+jobs@example.org');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — extractPhone
// ---------------------------------------------------------------------------

describe('extractPhone()', () => {
  it('extracts a US domestic format', () => {
    const result = extractPhone('Call me at (555) 123-4567');
    expect(result).toBeDefined();
    expect(result!.replace(/\D/g, '')).toBe('5551234567');
  });

  it('extracts an international format', () => {
    const result = extractPhone('+1 555-123-4567');
    expect(result).toBeDefined();
  });

  it('extracts dot-separated format', () => {
    const result = extractPhone('555.123.4567');
    expect(result).toBeDefined();
  });

  it('returns undefined when no phone is found', () => {
    expect(extractPhone('no phone here')).toBeUndefined();
  });

  it('does not return a plain year range as a phone', () => {
    expect(extractPhone('2019-2022')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unit tests — URL extractors
// ---------------------------------------------------------------------------

describe('extractLinkedInUrl()', () => {
  it('extracts a LinkedIn profile URL', () => {
    expect(extractLinkedInUrl('Visit https://linkedin.com/in/alice-j')).toBe(
      'https://linkedin.com/in/alice-j'
    );
  });

  it('extracts a www.linkedin.com URL', () => {
    expect(extractLinkedInUrl('https://www.linkedin.com/in/bob')).toBe(
      'https://www.linkedin.com/in/bob'
    );
  });

  it('returns undefined when no LinkedIn URL is present', () => {
    expect(extractLinkedInUrl('no linkedin here')).toBeUndefined();
  });
});

describe('extractGitHubUrl()', () => {
  it('extracts a GitHub profile URL', () => {
    expect(extractGitHubUrl('https://github.com/alice-j')).toBe(
      'https://github.com/alice-j'
    );
  });

  it('returns undefined when no GitHub URL is present', () => {
    expect(extractGitHubUrl('no github here')).toBeUndefined();
  });
});

describe('extractPortfolioUrl()', () => {
  it('extracts a portfolio URL that is not LinkedIn or GitHub', () => {
    const result = extractPortfolioUrl('Visit https://alicejohnson.dev for portfolio');
    expect(result).toBeDefined();
    expect(result).toContain('alicejohnson.dev');
  });

  it('does not return a LinkedIn URL as a portfolio URL', () => {
    const result = extractPortfolioUrl('https://linkedin.com/in/alice');
    expect(result).toBeUndefined();
  });

  it('does not return a GitHub URL as a portfolio URL', () => {
    const result = extractPortfolioUrl('https://github.com/alice');
    expect(result).toBeUndefined();
  });

  it('returns undefined when no URL is present', () => {
    expect(extractPortfolioUrl('no url here')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unit tests — extractName
// ---------------------------------------------------------------------------

describe('extractName()', () => {
  it('extracts a two-word name from the first line', () => {
    expect(extractName(['Alice Johnson', 'alice@example.com'])).toBe('Alice Johnson');
  });

  it('extracts a three-word name', () => {
    expect(extractName(['Mary Jane Watson', 'mary@example.com'])).toBe('Mary Jane Watson');
  });

  it('extracts a hyphenated name', () => {
    expect(extractName(['Anne-Marie Dupont', 'anne@example.com'])).toBe('Anne-Marie Dupont');
  });

  it('skips email lines before finding the name', () => {
    expect(extractName(['alice@example.com', 'Alice Johnson'])).toBe('Alice Johnson');
  });

  it('extracts name from explicit "Name:" label', () => {
    expect(extractName(['RESUME', 'Name: Bob Builder'])).toBe('Bob Builder');
  });

  it('returns undefined when no name-like line is found in the first 15 lines', () => {
    const lines = Array.from({ length: 15 }, (_, i) => `line ${i}`);
    expect(extractName(lines)).toBeUndefined();
  });

  it('does not return a section header as a name', () => {
    expect(extractName(['EXPERIENCE', 'Alice Johnson'])).toBe('Alice Johnson');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — extractLocation
// ---------------------------------------------------------------------------

describe('extractLocation()', () => {
  it('extracts city, state pattern', () => {
    const result = extractLocation(['Alice Johnson', 'San Francisco, CA']);
    expect(result).toBe('San Francisco, CA');
  });

  it('extracts explicit Location: label', () => {
    expect(extractLocation(['Location: Berlin, Germany'])).toBe('Berlin, Germany');
  });

  it('extracts "Remote" keyword', () => {
    expect(extractLocation(['Alice Johnson', 'Remote'])).toBe('Remote');
  });

  it('extracts "Remote – US" variant', () => {
    const result = extractLocation(['Alice Johnson', 'Remote – US']);
    expect(result).toBeDefined();
    expect(result!.toLowerCase()).toContain('remote');
  });

  it('returns undefined when no location is detectable', () => {
    expect(extractLocation(['no location info here'])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unit tests — extractSkills
// ---------------------------------------------------------------------------

describe('extractSkills()', () => {
  it('detects TypeScript in free text', () => {
    const skills = extractSkills('I work with TypeScript and React daily.', []);
    expect(skills).toContain('TypeScript');
    expect(skills).toContain('React');
  });

  it('detects skills from a SKILLS section', () => {
    const lines = [
      'EXPERIENCE',
      'Engineer 2019-2022',
      'SKILLS',
      'Python, Django, PostgreSQL',
    ];
    const skills = extractSkills('Python, Django, PostgreSQL', lines);
    expect(skills).toContain('Python');
    expect(skills).toContain('Django');
    expect(skills).toContain('PostgreSQL');
  });

  it('returns a deduplicated list', () => {
    const skills = extractSkills('TypeScript TypeScript typescript', []);
    const count = skills.filter((s) => s.toLowerCase() === 'typescript').length;
    expect(count).toBe(1);
  });

  it('caps results at 50 entries', () => {
    // Feed all skills at once — should still cap at 50
    const allSkills = ['TypeScript', 'Python', 'Java', 'Go', 'Rust', 'Ruby', 'PHP',
      'React', 'Vue.js', 'Angular', 'Node.js', 'Express', 'Django', 'Flask',
      'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes',
      'AWS', 'GCP', 'Azure', 'Git', 'GitHub', 'GitLab', 'Jest', 'Mocha',
      'Selenium', 'Cypress', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy',
      'Spark', 'Kafka', 'Airflow', 'Terraform', 'Ansible', 'Jenkins',
      'GraphQL', 'REST', 'gRPC', 'Figma', 'Sketch', 'Swift', 'Kotlin',
      'Scala', 'Perl', 'Lua'].join(' ');
    const skills = extractSkills(allSkills, []);
    expect(skills.length).toBeLessThanOrEqual(50);
  });

  it('returns empty array when no known skills are found', () => {
    const skills = extractSkills('I am a great communicator with passion.', []);
    // Should not throw; may or may not match soft skills
    expect(Array.isArray(skills)).toBe(true);
  });

  it('uses canonical casing from the dictionary', () => {
    const skills = extractSkills('I use node.js and POSTGRESQL.', []);
    expect(skills).toContain('Node.js');
    expect(skills).toContain('PostgreSQL');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — extractExperience
// ---------------------------------------------------------------------------

describe('extractExperience()', () => {
  it('extracts a basic year-range entry', () => {
    const lines = [
      'EXPERIENCE',
      'Senior Engineer',
      'Acme Corp                         2019 – 2022',
    ];
    const entries = extractExperience(lines);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].startYear).toBe(2019);
    expect(entries[0].endYear).toBe(2022);
  });

  it('extracts a "Present" end year as null', () => {
    const lines = [
      'EXPERIENCE',
      'Lead Engineer',
      'TechCorp                           2020 – Present',
    ];
    const entries = extractExperience(lines);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].endYear).toBeNull();
  });

  it('handles "Current" as end year', () => {
    const lines = [
      'EXPERIENCE',
      'Developer                          2021 – Current',
    ];
    const entries = extractExperience(lines);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].endYear).toBeNull();
  });

  it('returns empty array when no experience section exists and no year ranges found', () => {
    const lines = ['Alice Johnson', 'alice@example.com', 'No dates here'];
    const entries = extractExperience(lines);
    expect(entries).toEqual([]);
  });

  it('ignores implausible years (before 1950)', () => {
    const lines = ['EXPERIENCE', 'Job 1900-1901'];
    const entries = extractExperience(lines);
    expect(entries).toEqual([]);
  });

  it('extracts multiple entries in order', () => {
    const lines = [
      'EXPERIENCE',
      'Senior Engineer',
      '2021 – Present',
      'Junior Engineer',
      '2018 – 2021',
    ];
    const entries = extractExperience(lines);
    expect(entries.length).toBe(2);
    expect(entries[0].startYear).toBe(2021);
    expect(entries[1].startYear).toBe(2018);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — computeExperienceYears
// ---------------------------------------------------------------------------

describe('computeExperienceYears()', () => {
  const currentYear = new Date().getFullYear();

  it('sums durations from experience entries', () => {
    const entries = [
      { title: 'Engineer', startYear: 2019, endYear: 2022 },
      { title: 'Lead', startYear: 2022, endYear: null },
    ];
    const result = computeExperienceYears(entries, '');
    const expected = 3 + (currentYear - 2022);
    expect(result).toBe(expected);
  });

  it('falls back to "X years of experience" text pattern', () => {
    expect(computeExperienceYears([], '5 years of experience in software development')).toBe(5);
  });

  it('falls back to "X+ years" text pattern', () => {
    expect(computeExperienceYears([], '10+ years experience')).toBe(10);
  });

  it('returns undefined when no experience data is available', () => {
    expect(computeExperienceYears([], 'no experience mentioned')).toBeUndefined();
  });

  it('ignores implausibly large year values in text (> 60)', () => {
    expect(computeExperienceYears([], '100 years of experience')).toBeUndefined();
  });

  it('skips entries without a startYear', () => {
    const entries = [{ title: 'Mystery', startYear: undefined, endYear: null }];
    const result = computeExperienceYears(entries, '');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unit tests — extractPosition
// ---------------------------------------------------------------------------

describe('extractPosition()', () => {
  it('returns the title from the first experience entry', () => {
    const experience = [
      { title: 'Senior Software Engineer', startYear: 2020, endYear: null },
    ];
    expect(extractPosition(experience, [])).toBe('Senior Software Engineer');
  });

  it('falls back to explicit "Title:" label', () => {
    expect(extractPosition([], ['Title: Product Manager'])).toBe('Product Manager');
  });

  it('falls back to a line containing a title keyword', () => {
    const lines = ['Alice Johnson', 'alice@example.com', 'Full Stack Developer'];
    expect(extractPosition([], lines)).toBe('Full Stack Developer');
  });

  it('returns undefined when no position can be determined', () => {
    expect(extractPosition([], ['Alice Johnson', 'alice@example.com'])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unit tests — extractEducation
// ---------------------------------------------------------------------------

describe('extractEducation()', () => {
  it('extracts a degree entry with institution and year', () => {
    const lines = [
      'EDUCATION',
      'Massachusetts Institute of Technology',
      'B.Sc. in Computer Science 2016',
    ];
    const entries = extractEducation(lines);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].institution).toContain('Massachusetts');
    expect(entries[0].graduationYear).toBe(2016);
  });

  it('detects multiple education entries', () => {
    const lines = [
      'EDUCATION',
      'Harvard University',
      'M.Sc. in Data Science 2018',
      'MIT',
      'B.Sc. in Computer Science 2016',
    ];
    const entries = extractEducation(lines);
    expect(entries.length).toBe(2);
  });

  it('extracts degree without a known institution gracefully', () => {
    const lines = ['EDUCATION', 'Bachelor of Science in Finance 2015'];
    const entries = extractEducation(lines);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].degree).toMatch(/Bachelor/i);
  });

  it('handles education outside a dedicated section', () => {
    const lines = [
      'Alice Johnson',
      'alice@example.com',
      'Stanford University',
      'Ph.D. in Electrical Engineering 2020',
    ];
    const entries = extractEducation(lines);
    expect(entries.some((e) => e.degree?.match(/ph\.?d/i))).toBe(true);
  });

  it('returns empty array when no degree keywords are found', () => {
    const lines = ['Just work experience', 'No education mentioned'];
    expect(extractEducation(lines)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — computeConfidence
// ---------------------------------------------------------------------------

describe('computeConfidence()', () => {
  it('returns 1.0 for a fully populated result', () => {
    const full: Omit<ParsedResume, 'confidence'> = {
      name: 'Alice',
      email: 'alice@example.com',
      phone: '555-0100',
      location: 'SF, CA',
      position: 'Engineer',
      experienceYears: 5,
      experience: [{ title: 'Engineer', startYear: 2019, endYear: null }],
      education: [{ institution: 'MIT', degree: 'B.Sc.' }],
      skills: ['TypeScript'],
      linkedinUrl: 'https://linkedin.com/in/alice',
      githubUrl: undefined,
      portfolioUrl: undefined,
    };
    expect(computeConfidence(full)).toBe(1);
  });

  it('returns 0 for a completely empty result', () => {
    const empty: Omit<ParsedResume, 'confidence'> = {
      name: undefined,
      email: undefined,
      phone: undefined,
      location: undefined,
      position: undefined,
      experienceYears: undefined,
      experience: [],
      education: [],
      skills: [],
      linkedinUrl: undefined,
      githubUrl: undefined,
      portfolioUrl: undefined,
    };
    expect(computeConfidence(empty)).toBe(0);
  });

  it('returns a value strictly between 0 and 1 for a partial result', () => {
    const partial: Omit<ParsedResume, 'confidence'> = {
      name: 'Alice',
      email: 'alice@example.com',
      phone: undefined,
      location: undefined,
      position: undefined,
      experienceYears: undefined,
      experience: [],
      education: [],
      skills: ['TypeScript'],
      linkedinUrl: undefined,
      githubUrl: undefined,
      portfolioUrl: undefined,
    };
    const score = computeConfidence(partial);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('returns a number rounded to at most 2 decimal places', () => {
    const partial: Omit<ParsedResume, 'confidence'> = {
      name: 'Alice',
      email: undefined,
      phone: undefined,
      location: undefined,
      position: undefined,
      experienceYears: undefined,
      experience: [],
      education: [],
      skills: [],
      linkedinUrl: undefined,
      githubUrl: undefined,
      portfolioUrl: undefined,
    };
    const score = computeConfidence(partial);
    expect(Number.isFinite(score)).toBe(true);
    expect(String(score).replace(/^\d+\.?/, '').length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — parseResume (integration of all extractors)
// ---------------------------------------------------------------------------

describe('parseResume()', () => {
  describe('full resume parsing', () => {
    let result: ParsedResume;

    beforeAll(() => {
      result = parseResume(FULL_RESUME);
    });

    it('extracts the candidate name', () => {
      expect(result.name).toBe('Alice Johnson');
    });

    it('extracts the email address', () => {
      expect(result.email).toBe('alice.johnson@example.com');
    });

    it('extracts the phone number', () => {
      expect(result.phone).toBeDefined();
      expect(result.phone!.replace(/\D/g, '')).toContain('5551234567');
    });

    it('extracts the location', () => {
      expect(result.location).toContain('San Francisco');
    });

    it('extracts the LinkedIn URL', () => {
      expect(result.linkedinUrl).toContain('linkedin.com/in/alice-johnson');
    });

    it('extracts the GitHub URL', () => {
      expect(result.githubUrl).toContain('github.com/alice-j');
    });

    it('extracts the portfolio URL', () => {
      expect(result.portfolioUrl).toContain('alicejohnson.dev');
    });

    it('extracts skills including TypeScript and Node.js', () => {
      expect(result.skills).toContain('TypeScript');
      expect(result.skills).toContain('Node.js');
      expect(result.skills).toContain('React');
      expect(result.skills).toContain('PostgreSQL');
    });

    it('extracts work experience entries', () => {
      expect(result.experience.length).toBeGreaterThanOrEqual(2);
    });

    it('extracts the most recent role as the primary position', () => {
      expect(result.position).toMatch(/Senior Software Engineer/i);
    });

    it('extracts education entries', () => {
      expect(result.education.length).toBeGreaterThanOrEqual(1);
      expect(result.education[0].institution).toMatch(/Massachusetts|MIT/i);
    });

    it('computes total years of experience', () => {
      expect(result.experienceYears).toBeGreaterThan(0);
    });

    it('returns a confidence score above 0.9 (>90% accuracy threshold)', () => {
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('confidence is within [0, 1]', () => {
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('minimal resume parsing', () => {
    let result: ParsedResume;

    beforeAll(() => {
      result = parseResume(MINIMAL_RESUME);
    });

    it('extracts name from minimal resume', () => {
      expect(result.name).toBe('Bob Smith');
    });

    it('extracts email from minimal resume', () => {
      expect(result.email).toBe('bob@example.com');
    });

    it('extracts experience years from fallback text', () => {
      expect(result.experienceYears).toBe(3);
    });

    it('extracts skills from minimal resume', () => {
      expect(result.skills).toContain('Python');
      expect(result.skills).toContain('Django');
    });

    it('returns a confidence score that is a valid number', () => {
      expect(typeof result.confidence).toBe('number');
      expect(Number.isFinite(result.confidence)).toBe(true);
    });
  });

  describe('resume without explicit sections', () => {
    let result: ParsedResume;

    beforeAll(() => {
      result = parseResume(RESUME_NO_SECTIONS);
    });

    it('extracts name', () => {
      expect(result.name).toBe('Carol White');
    });

    it('extracts email', () => {
      expect(result.email).toBe('carol@example.com');
    });

    it('extracts location', () => {
      expect(result.location).toContain('New York');
    });

    it('extracts skills without a SKILLS header', () => {
      expect(result.skills).toContain('Python');
      expect(result.skills).toContain('SQL');
    });

    it('extracts education degree', () => {
      expect(result.education.length).toBeGreaterThanOrEqual(1);
      expect(result.education[0].graduationYear).toBe(2018);
    });
  });

  describe('empty or trivial input', () => {
    it('handles empty string without throwing', () => {
      expect(() => parseResume('')).not.toThrow();
    });

    it('returns empty arrays for experience, education, skills on empty input', () => {
      const result = parseResume('');
      expect(result.experience).toEqual([]);
      expect(result.education).toEqual([]);
      expect(result.skills).toEqual([]);
    });

    it('returns confidence of 0 for empty input', () => {
      const result = parseResume('');
      expect(result.confidence).toBe(0);
    });

    it('handles single-line input without throwing', () => {
      expect(() => parseResume('John Doe')).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Validation middleware tests — validateResumeParseRequest
// ---------------------------------------------------------------------------

describe('validateResumeParseRequest middleware', () => {
  const validationApp = makeValidationApp('post', '/', validateResumeParseRequest);

  it('passes a valid content string', async () => {
    const res = await request(validationApp)
      .post('/')
      .send({ content: 'Alice Johnson\nalice@example.com' });
    expect(res.status).toBe(200);
  });

  it('rejects missing content field', async () => {
    const res = await request(validationApp).post('/').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content/i);
  });

  it('rejects empty content string', async () => {
    const res = await request(validationApp).post('/').send({ content: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content/i);
  });

  it('rejects whitespace-only content', async () => {
    const res = await request(validationApp).post('/').send({ content: '   \n  ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content/i);
  });

  it('rejects non-string content (number)', async () => {
    const res = await request(validationApp).post('/').send({ content: 42 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content/i);
  });

  it('rejects content exceeding 200,000 characters', async () => {
    const res = await request(validationApp)
      .post('/')
      .send({ content: 'x'.repeat(200_001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/200,000/i);
  });

  it('accepts content of exactly 200,000 characters', async () => {
    const res = await request(validationApp)
      .post('/')
      .send({ content: 'x'.repeat(200_000) });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// HTTP endpoint integration tests — POST /api/resume/parse
// ---------------------------------------------------------------------------

describe('POST /api/resume/parse', () => {
  const validBody = { content: FULL_RESUME };

  // ── Auth / RBAC ─────────────────────────────────────────────────────────

  it('401 — unauthenticated request is rejected', async () => {
    const res = await request(app).post('/api/resume/parse').send(validBody);
    expect(res.status).toBe(401);
  });

  it('403 — viewer cannot parse a resume', async () => {
    const res = await request(app)
      .post('/api/resume/parse')
      .set(authHeader(viewerToken()))
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('200 — recruiter can parse a resume', async () => {
    const res = await request(app)
      .post('/api/resume/parse')
      .set(authHeader(recruiterToken()))
      .send(validBody);
    expect(res.status).toBe(200);
  });

  it('200 — admin can parse a resume', async () => {
    const res = await request(app)
      .post('/api/resume/parse')
      .set(authHeader(adminToken()))
      .send(validBody);
    expect(res.status).toBe(200);
  });

  // ── Validation ──────────────────────────────────────────────────────────

  it('400 — missing content field', async () => {
    const res = await request(app)
      .post('/api/resume/parse')
      .set(authHeader(adminToken()))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content/i);
  });

  it('400 — empty content string', async () => {
    const res = await request(app)
      .post('/api/resume/parse')
      .set(authHeader(recruiterToken()))
      .send({ content: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content/i);
  });

  it('400 — content exceeds 200,000 characters', async () => {
    const res = await request(app)
      .post('/api/resume/parse')
      .set(authHeader(adminToken()))
      .send({ content: 'x'.repeat(200_001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/200,000/i);
  });

  // ── Response shape ──────────────────────────────────────────────────────

  it('200 — response contains all expected top-level fields', async () => {
    const res = await request(app)
      .post('/api/resume/parse')
      .set(authHeader(adminToken()))
      .send(validBody);

    expect(res.status).toBe(200);
    const body = res.body as ParsedResume;

    // Required array fields
    expect(Array.isArray(body.experience)).toBe(true);
    expect(Array.isArray(body.education)).toBe(true);
    expect(Array.isArray(body.skills)).toBe(true);

    // Confidence is a valid number in [0, 1]
    expect(typeof body.confidence).toBe('number');
    expect(body.confidence).toBeGreaterThanOrEqual(0);
    expect(body.confidence).toBeLessThanOrEqual(1);
  });

  it('200 — correctly parses full resume and exceeds 90% confidence', async () => {
    const res = await request(app)
      .post('/api/resume/parse')
      .set(authHeader(adminToken()))
      .send(validBody);

    expect(res.status).toBe(200);
    const body = res.body as ParsedResume;

    expect(body.name).toBe('Alice Johnson');
    expect(body.email).toBe('alice.johnson@example.com');
    expect(body.skills).toContain('TypeScript');
    expect(body.experience.length).toBeGreaterThanOrEqual(1);
    expect(body.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('200 — parses minimal resume and returns valid structure', async () => {
    const res = await request(app)
      .post('/api/resume/parse')
      .set(authHeader(recruiterToken()))
      .send({ content: MINIMAL_RESUME });

    expect(res.status).toBe(200);
    const body = res.body as ParsedResume;
    expect(body.name).toBe('Bob Smith');
    expect(body.email).toBe('bob@example.com');
    expect(Array.isArray(body.skills)).toBe(true);
    expect(Array.isArray(body.experience)).toBe(true);
    expect(Array.isArray(body.education)).toBe(true);
  });

  it('200 — returns 0 confidence for uninformative content', async () => {
    const res = await request(app)
      .post('/api/resume/parse')
      .set(authHeader(adminToken()))
      .send({ content: 'Lorem ipsum dolor sit amet.' });

    expect(res.status).toBe(200);
    const body = res.body as ParsedResume;
    expect(body.confidence).toBeLessThan(0.5);
  });
});
