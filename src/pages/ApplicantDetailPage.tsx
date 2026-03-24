import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Applicant } from '../types/applicant';
import { Note, CreateNoteDTO } from '../types/note';
import { applicantService } from '../services/applicantService';
import { noteService } from '../services/noteService';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateTime } from '../utils/formatters';
import './ApplicantDetailPage.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps each pipeline status to a human-readable label and a CSS modifier. */
const STATUS_META: Record<
  string,
  { label: string; modifier: string; description: string }
> = {
  applied: {
    label: 'Applied',
    modifier: 'applied',
    description: 'Application received',
  },
  screening: {
    label: 'Screening',
    modifier: 'screening',
    description: 'Under initial review',
  },
  interview: {
    label: 'Interview',
    modifier: 'interview',
    description: 'Interview stage',
  },
  offer: {
    label: 'Offer',
    modifier: 'offer',
    description: 'Offer extended',
  },
  hired: {
    label: 'Hired',
    modifier: 'hired',
    description: 'Candidate has been hired',
  },
  rejected: {
    label: 'Rejected',
    modifier: 'rejected',
    description: 'Application not progressed',
  },
};

/** Ordered pipeline stages used for the progress indicator. */
const PIPELINE_STAGES = ['applied', 'screening', 'interview', 'offer', 'hired'] as const;

/** Human-readable source labels. */
function formatSource(source: string): string {
  return source
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format a salary number with locale-aware formatting. */
function formatSalary(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  icon: string;
  children: React.ReactNode;
}

function Section({ title, icon, children }: SectionProps) {
  return (
    <section className="profile-section" aria-labelledby={`section-${title.replace(/\s+/g, '-').toLowerCase()}`}>
      <h2
        id={`section-${title.replace(/\s+/g, '-').toLowerCase()}`}
        className="profile-section__title"
      >
        <span className="profile-section__icon" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      <div className="profile-section__body">{children}</div>
    </section>
  );
}

interface FieldProps {
  label: string;
  value?: string | number | null;
  children?: React.ReactNode;
}

function Field({ label, value, children }: FieldProps) {
  const content = children ?? (value !== undefined && value !== null ? String(value) : null);
  if (!content) return null;
  return (
    <div className="profile-field">
      <dt className="profile-field__label">{label}</dt>
      <dd className="profile-field__value">{content}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes sub-section
// ---------------------------------------------------------------------------

interface NoteSectionProps {
  applicantId: string;
  canWrite: boolean;
}

function NotesSection({ applicantId, canWrite }: NoteSectionProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);

  // New note form
  const [newNoteBody, setNewNoteBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Inline edit state
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Delete confirmation
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingNotes(true);
    setNotesError(null);

    noteService
      .getByApplicant(applicantId)
      .then((data) => {
        if (!cancelled) setNotes(data);
      })
      .catch(() => {
        if (!cancelled) setNotesError('Failed to load notes. Please refresh to try again.');
      })
      .finally(() => {
        if (!cancelled) setLoadingNotes(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applicantId]);

  // Focus edit textarea when entering edit mode
  useEffect(() => {
    if (editingNoteId !== null) {
      editTextareaRef.current?.focus();
    }
  }, [editingNoteId]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = newNoteBody.trim();
    if (!body) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await noteService.create(applicantId, { body } as CreateNoteDTO);
      setNotes((prev) => [created, ...prev]);
      setNewNoteBody('');
      textareaRef.current?.focus();
    } catch {
      setSubmitError('Failed to add note. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (note: Note) => {
    setEditingNoteId(note.id);
    setEditBody(note.body);
    setEditError(null);
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditBody('');
    setEditError(null);
  };

  const handleSaveEdit = async (noteId: number) => {
    const body = editBody.trim();
    if (!body) return;

    setEditError(null);
    try {
      const updated = await noteService.update(applicantId, noteId, { body });
      setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
      setEditingNoteId(null);
      setEditBody('');
    } catch {
      setEditError('Failed to update note. Please try again.');
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    setDeletingNoteId(noteId);
    try {
      await noteService.remove(applicantId, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      // Re-enable the button on failure so the user can retry
    } finally {
      setDeletingNoteId(null);
    }
  };

  const canEditOrDelete = (note: Note) =>
    user?.role === 'admin' || user?.id === note.author_id;

  return (
    <Section title="Notes" icon="📝">
      {/* Add note form — visible to recruiters and admins */}
      {canWrite && (
        <form
          className="notes-form"
          onSubmit={handleAddNote}
          aria-label="Add a new note"
          noValidate
        >
          <label htmlFor="new-note-body" className="notes-form__label">
            Add a note
          </label>
          <textarea
            id="new-note-body"
            ref={textareaRef}
            className="notes-form__textarea"
            placeholder="Write a note about this candidate…"
            value={newNoteBody}
            onChange={(e) => setNewNoteBody(e.target.value)}
            rows={3}
            maxLength={2000}
            disabled={submitting}
            aria-describedby={submitError ? 'note-submit-error' : undefined}
          />
          {submitError && (
            <p id="note-submit-error" className="notes-form__error" role="alert">
              {submitError}
            </p>
          )}
          <div className="notes-form__actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !newNoteBody.trim()}
              aria-busy={submitting}
            >
              {submitting ? 'Adding…' : 'Add Note'}
            </button>
          </div>
        </form>
      )}

      {/* Notes list */}
      {loadingNotes ? (
        <p className="notes-loading" role="status" aria-live="polite">
          Loading notes…
        </p>
      ) : notesError ? (
        <p className="notes-error" role="alert">
          {notesError}
        </p>
      ) : notes.length === 0 ? (
        <p className="notes-empty">No notes yet.</p>
      ) : (
        <ul className="notes-list" aria-label="Candidate notes">
          {notes.map((note) => (
            <li key={note.id} className="note-item">
              <div className="note-item__meta">
                <span className="note-item__author">{note.author_name}</span>
                <time
                  className="note-item__date"
                  dateTime={note.created_at}
                  title={formatDateTime(note.created_at)}
                >
                  {formatDate(note.created_at)}
                  {note.updated_at !== note.created_at && (
                    <span className="note-item__edited"> (edited)</span>
                  )}
                </time>
              </div>

              {editingNoteId === note.id ? (
                <div className="note-item__edit-form">
                  <label htmlFor={`edit-note-${note.id}`} className="sr-only">
                    Edit note
                  </label>
                  <textarea
                    id={`edit-note-${note.id}`}
                    ref={editTextareaRef}
                    className="notes-form__textarea"
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    aria-describedby={editError ? `edit-error-${note.id}` : undefined}
                  />
                  {editError && (
                    <p id={`edit-error-${note.id}`} className="notes-form__error" role="alert">
                      {editError}
                    </p>
                  )}
                  <div className="note-item__edit-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn--sm"
                      onClick={() => handleSaveEdit(note.id)}
                      disabled={!editBody.trim()}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn--sm"
                      onClick={handleCancelEdit}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="note-item__body">{note.body}</p>
              )}

              {canEditOrDelete(note) && editingNoteId !== note.id && (
                <div className="note-item__actions">
                  <button
                    type="button"
                    className="note-action-btn"
                    onClick={() => handleStartEdit(note)}
                    aria-label={`Edit note by ${note.author_name}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="note-action-btn note-action-btn--danger"
                    onClick={() => handleDeleteNote(note.id)}
                    disabled={deletingNoteId === note.id}
                    aria-label={`Delete note by ${note.author_name}`}
                    aria-busy={deletingNoteId === note.id}
                  >
                    {deletingNoteId === note.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

function ApplicantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();

  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canWrite = hasRole('admin', 'recruiter');

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    applicantService
      .getById(id)
      .then((data) => {
        if (!cancelled) setApplicant(data);
      })
      .catch(() => {
        if (!cancelled)
          setError('Failed to load candidate profile. Please try again later.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="loading" role="status" aria-live="polite">
        Loading candidate profile…
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (error || !applicant) {
    return (
      <div className="error-container" role="alert">
        <p className="error">{error ?? 'Candidate not found.'}</p>
        <button onClick={() => navigate('/applicants')} className="btn btn-secondary">
          ← Back to Applicants
        </button>
      </div>
    );
  }

  // Derived status metadata
  const statusMeta = STATUS_META[applicant.status] ?? {
    label: applicant.status,
    modifier: 'applied',
    description: applicant.status,
  };

  // Pipeline stage index for the progress bar (-1 when rejected)
  const isRejected = applicant.status === 'rejected';
  const currentStageIndex = isRejected
    ? -1
    : PIPELINE_STAGES.indexOf(applicant.status as (typeof PIPELINE_STAGES)[number]);

  // Determine whether any professional-background fields exist
  const hasProfessionalInfo =
    applicant.position ||
    applicant.experience_years !== undefined ||
    applicant.education ||
    (applicant.skills && applicant.skills.length > 0);

  // Determine whether any pipeline fields exist (besides status which is always shown)
  const hasPipelineDetails =
    applicant.source ||
    applicant.salary_expected !== undefined ||
    applicant.availability_date;

  // Determine whether any external links exist
  const hasLinks =
    applicant.resume_url ||
    applicant.linkedin_url ||
    applicant.github_url ||
    applicant.portfolio_url;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="candidate-profile">
      {/* ── Back navigation ──────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="profile-breadcrumb">
        <ol className="breadcrumb-list">
          <li className="breadcrumb-item">
            <Link to="/applicants" className="breadcrumb-link">
              Applicants
            </Link>
          </li>
          <li className="breadcrumb-item breadcrumb-item--current" aria-current="page">
            {applicant.name}
          </li>
        </ol>
      </nav>

      {/* ── Profile hero card ─────────────────────────────────────────── */}
      <header className="profile-hero card" role="banner">
        <div className="profile-hero__identity">
          {/* Avatar initials */}
          <div
            className="profile-avatar"
            aria-hidden="true"
            aria-label={`Avatar for ${applicant.name}`}
          >
            {applicant.name
              .split(' ')
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase() ?? '')
              .join('')}
          </div>

          <div className="profile-hero__info">
            <h1 className="profile-hero__name">{applicant.name}</h1>

            {applicant.position && (
              <p className="profile-hero__position">{applicant.position}</p>
            )}

            <div className="profile-hero__meta">
              {applicant.location && (
                <span className="profile-hero__meta-item">
                  <span aria-hidden="true">📍</span>
                  {applicant.location}
                </span>
              )}
              {applicant.experience_years !== undefined && (
                <span className="profile-hero__meta-item">
                  <span aria-hidden="true">💼</span>
                  {applicant.experience_years}{' '}
                  {applicant.experience_years === 1 ? 'year' : 'years'} experience
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div className="profile-hero__status">
          <span
            className={`status-badge status-badge--${statusMeta.modifier}`}
            role="status"
            aria-label={`Pipeline status: ${statusMeta.description}`}
          >
            {statusMeta.label}
          </span>
        </div>
      </header>

      {/* ── Pipeline progress ─────────────────────────────────────────── */}
      <div className="pipeline-progress card" aria-label="Hiring pipeline progress">
        <h2 className="sr-only">Hiring Pipeline Progress</h2>
        <ol className="pipeline-stages" role="list">
          {PIPELINE_STAGES.map((stage, idx) => {
            const isCompleted = !isRejected && idx < currentStageIndex;
            const isCurrent = !isRejected && idx === currentStageIndex;
            const meta = STATUS_META[stage];
            return (
              <li
                key={stage}
                className={[
                  'pipeline-stage',
                  isCompleted ? 'pipeline-stage--completed' : '',
                  isCurrent ? 'pipeline-stage--current' : '',
                  isRejected ? 'pipeline-stage--inactive' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span className="pipeline-stage__dot" aria-hidden="true" />
                <span className="pipeline-stage__label">{meta.label}</span>
              </li>
            );
          })}

          {/* Show rejected as a distinct terminal stage when applicable */}
          {isRejected && (
            <li className="pipeline-stage pipeline-stage--rejected pipeline-stage--current" aria-current="step">
              <span className="pipeline-stage__dot" aria-hidden="true" />
              <span className="pipeline-stage__label">Rejected</span>
            </li>
          )}
        </ol>
      </div>

      {/* ── Content grid ──────────────────────────────────────────────── */}
      <div className="profile-content">
        {/* ── LEFT COLUMN ───────────────────────────────────────────── */}
        <div className="profile-column profile-column--main">

          {/* Personal Details */}
          <div className="card">
            <Section title="Personal Details" icon="👤">
              <dl className="profile-fields">
                <Field label="Full Name" value={applicant.name} />
                <Field label="Email">
                  <a href={`mailto:${applicant.email}`} className="profile-link">
                    {applicant.email}
                  </a>
                </Field>
                {applicant.phone && (
                  <Field label="Phone">
                    <a href={`tel:${applicant.phone}`} className="profile-link">
                      {applicant.phone}
                    </a>
                  </Field>
                )}
                <Field label="Location" value={applicant.location} />
              </dl>
            </Section>
          </div>

          {/* Professional Background */}
          {hasProfessionalInfo && (
            <div className="card">
              <Section title="Professional Background" icon="🎓">
                <dl className="profile-fields">
                  <Field label="Current / Target Role" value={applicant.position} />
                  {applicant.experience_years !== undefined && (
                    <Field
                      label="Years of Experience"
                      value={`${applicant.experience_years} ${applicant.experience_years === 1 ? 'year' : 'years'}`}
                    />
                  )}
                  <Field label="Education" value={applicant.education} />
                </dl>

                {applicant.skills && applicant.skills.length > 0 && (
                  <div className="skills-block">
                    <p className="skills-block__label" id="skills-label">
                      Skills
                    </p>
                    <ul
                      className="skills-list"
                      aria-labelledby="skills-label"
                      role="list"
                    >
                      {applicant.skills.map((skill) => (
                        <li key={skill} className="skill-tag">
                          {skill}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>
            </div>
          )}

          {/* Notes */}
          <div className="card">
            <NotesSection applicantId={id!} canWrite={canWrite} />
          </div>
        </div>

        {/* ── RIGHT COLUMN ──────────────────────────────────────────── */}
        <aside className="profile-column profile-column--sidebar" aria-label="Candidate sidebar">

          {/* Pipeline & Recruitment */}
          <div className="card">
            <Section title="Pipeline Details" icon="📋">
              <dl className="profile-fields">
                <Field label="Status">
                  <span
                    className={`status-badge status-badge--${statusMeta.modifier}`}
                    aria-label={`Status: ${statusMeta.description}`}
                  >
                    {statusMeta.label}
                  </span>
                </Field>
                {applicant.source && (
                  <Field label="Source" value={formatSource(applicant.source)} />
                )}
                {hasPipelineDetails && (
                  <>
                    {applicant.salary_expected !== undefined && (
                      <Field
                        label="Expected Salary"
                        value={formatSalary(applicant.salary_expected)}
                      />
                    )}
                    {applicant.availability_date && (
                      <Field
                        label="Available From"
                        value={formatDate(applicant.availability_date)}
                      />
                    )}
                  </>
                )}
              </dl>
            </Section>
          </div>

          {/* External Links */}
          {hasLinks && (
            <div className="card">
              <Section title="Links & Documents" icon="🔗">
                <ul className="external-links" role="list">
                  {applicant.resume_url && (
                    <li>
                      <a
                        href={applicant.resume_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="external-link"
                        aria-label="View resume (opens in new tab)"
                      >
                        <span className="external-link__icon" aria-hidden="true">📄</span>
                        <span>Resume</span>
                        <span className="external-link__new-tab" aria-hidden="true">↗</span>
                      </a>
                    </li>
                  )}
                  {applicant.linkedin_url && (
                    <li>
                      <a
                        href={applicant.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="external-link"
                        aria-label="View LinkedIn profile (opens in new tab)"
                      >
                        <span className="external-link__icon" aria-hidden="true">💼</span>
                        <span>LinkedIn Profile</span>
                        <span className="external-link__new-tab" aria-hidden="true">↗</span>
                      </a>
                    </li>
                  )}
                  {applicant.github_url && (
                    <li>
                      <a
                        href={applicant.github_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="external-link"
                        aria-label="View GitHub profile (opens in new tab)"
                      >
                        <span className="external-link__icon" aria-hidden="true">🐱</span>
                        <span>GitHub Profile</span>
                        <span className="external-link__new-tab" aria-hidden="true">↗</span>
                      </a>
                    </li>
                  )}
                  {applicant.portfolio_url && (
                    <li>
                      <a
                        href={applicant.portfolio_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="external-link"
                        aria-label="View portfolio (opens in new tab)"
                      >
                        <span className="external-link__icon" aria-hidden="true">🌐</span>
                        <span>Portfolio</span>
                        <span className="external-link__new-tab" aria-hidden="true">↗</span>
                      </a>
                    </li>
                  )}
                </ul>
              </Section>
            </div>
          )}

          {/* Timeline */}
          <div className="card">
            <Section title="Timeline" icon="🕐">
              <dl className="profile-fields">
                <Field
                  label="Applied On"
                  value={formatDate(applicant.created_at)}
                />
                <Field
                  label="Last Updated"
                  value={formatDate(applicant.updated_at)}
                />
              </dl>
            </Section>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default ApplicantDetailPage;
