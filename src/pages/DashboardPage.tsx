import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { applicantService } from '../services/applicantService';
import { Applicant, APPLICANT_STATUSES, ApplicantStatus } from '../types/applicant';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/formatters';
import './DashboardPage.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatusCounts extends Record<ApplicantStatus, number> {
  applied: number;
  screening: number;
  interview: number;
  offer: number;
  hired: number;
  rejected: number;
}

interface DashboardStats {
  total: number;
  statusCounts: StatusCounts;
  newThisWeek: number;
  hiredCount: number;
  activeCount: number; // all non-rejected, non-hired
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  ApplicantStatus,
  { label: string; icon: string; colorClass: string }
> = {
  applied: { label: 'Applied', icon: '📥', colorClass: 'widget--applied' },
  screening: { label: 'Screening', icon: '🔍', colorClass: 'widget--screening' },
  interview: { label: 'Interview', icon: '🗣️', colorClass: 'widget--interview' },
  offer: { label: 'Offer', icon: '📋', colorClass: 'widget--offer' },
  hired: { label: 'Hired', icon: '✅', colorClass: 'widget--hired' },
  rejected: { label: 'Rejected', icon: '❌', colorClass: 'widget--rejected' },
};

const PIPELINE_STAGES: ApplicantStatus[] = ['applied', 'screening', 'interview', 'offer', 'hired'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildStats(applicants: Applicant[]): DashboardStats {
  const statusCounts: StatusCounts = {
    applied: 0,
    screening: 0,
    interview: 0,
    offer: 0,
    hired: 0,
    rejected: 0,
  };

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let newThisWeek = 0;

  for (const a of applicants) {
    statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
    if (new Date(a.created_at).getTime() >= oneWeekAgo) {
      newThisWeek += 1;
    }
  }

  const activeCount = applicants.filter(
    (a) => a.status !== 'hired' && a.status !== 'rejected'
  ).length;

  return {
    total: applicants.length,
    statusCounts,
    newThisWeek,
    hiredCount: statusCounts.hired,
    activeCount,
  };
}

function hireRate(stats: DashboardStats): string {
  if (stats.total === 0) return '0%';
  return `${Math.round((stats.hiredCount / stats.total) * 100)}%`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatWidgetProps {
  icon: string;
  label: string;
  value: number | string;
  colorClass?: string;
  linkTo?: string;
  linkLabel?: string;
}

function StatWidget({ icon, label, value, colorClass = '', linkTo, linkLabel }: StatWidgetProps) {
  return (
    <div className={`stat-widget card ${colorClass}`}>
      <div className="stat-widget__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="stat-widget__body">
        <p className="stat-widget__value">{value}</p>
        <p className="stat-widget__label">{label}</p>
      </div>
      {linkTo && (
        <Link to={linkTo} className="stat-widget__link" aria-label={linkLabel ?? label}>
          →
        </Link>
      )}
    </div>
  );
}

interface PipelineBarProps {
  stats: DashboardStats;
}

function PipelineBar({ stats }: PipelineBarProps) {
  const active = PIPELINE_STAGES.filter((s) => s !== 'rejected');
  const activeTotal = active.reduce((sum, s) => sum + stats.statusCounts[s], 0);

  if (activeTotal === 0) {
    return (
      <p className="pipeline-bar__empty">No active candidates in the pipeline.</p>
    );
  }

  return (
    <div className="pipeline-bar" role="img" aria-label="Pipeline stage distribution">
      <div className="pipeline-bar__track">
        {active.map((status) => {
          const count = stats.statusCounts[status];
          if (count === 0) return null;
          const pct = (count / activeTotal) * 100;
          return (
            <div
              key={status}
              className={`pipeline-bar__segment pipeline-bar__segment--${status}`}
              style={{ width: `${pct}%` }}
              title={`${STATUS_CONFIG[status].label}: ${count}`}
            />
          );
        })}
      </div>
      <ul className="pipeline-bar__legend" role="list">
        {active.map((status) => (
          <li key={status} className="pipeline-bar__legend-item">
            <span
              className={`pipeline-bar__legend-dot pipeline-bar__legend-dot--${status}`}
              aria-hidden="true"
            />
            <span className="pipeline-bar__legend-label">
              {STATUS_CONFIG[status].label}
            </span>
            <span className="pipeline-bar__legend-count">
              {stats.statusCounts[status]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface RecentApplicantsProps {
  applicants: Applicant[];
}

function RecentApplicants({ applicants }: RecentApplicantsProps) {
  if (applicants.length === 0) {
    return (
      <p className="recent-applicants__empty">
        No applicants yet.{' '}
      </p>
    );
  }

  return (
    <ul className="recent-list" role="list" aria-label="Recent applicants">
      {applicants.map((a) => {
        const cfg = STATUS_CONFIG[a.status];
        return (
          <li key={a.id} className="recent-list__item">
            <div className="recent-list__avatar" aria-hidden="true">
              {a.name
                .split(' ')
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? '')
                .join('')}
            </div>
            <div className="recent-list__info">
              <Link to={`/applicants/${a.id}`} className="recent-list__name">
                {a.name}
              </Link>
              {a.position && (
                <p className="recent-list__position">{a.position}</p>
              )}
            </div>
            <div className="recent-list__meta">
              <span className={`status-pill status-pill--${a.status}`} aria-label={`Status: ${cfg.label}`}>
                {cfg.label}
              </span>
              <time
                className="recent-list__date"
                dateTime={a.created_at}
                title={a.created_at}
              >
                {formatDate(a.created_at)}
              </time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function DashboardPage() {
  const { user } = useAuth();

  const [allApplicants, setAllApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch ALL applicants (up to 500) so we can compute stats client-side.
  // A real app would expose a dedicated `/stats` endpoint; for this ATS
  // we re-use the existing paginated endpoint with a generous limit.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    applicantService
      .search({ page: 1, limit: 500 })
      .then((result) => {
        if (!cancelled) setAllApplicants(result.data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load dashboard data. Please refresh.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = buildStats(allApplicants);
  const recentApplicants = [...allApplicants]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="loading" role="status" aria-live="polite">
          Loading dashboard…
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="dashboard-page">
        <div className="error" role="alert">
          {error}
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-page">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="dashboard-header">
        <div className="dashboard-header__text">
          <h1 className="dashboard-header__title">
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="dashboard-header__subtitle">
            Here&apos;s what&apos;s happening with your recruitment pipeline.
          </p>
        </div>
        <div className="dashboard-header__actions">
          <Link to="/applicants" className="btn btn-primary">
            View All Applicants
          </Link>
        </div>
      </header>

      {/* ── Top-level stat widgets ───────────────────────────────────── */}
      <section aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="section-heading">
          Overview
        </h2>
        <div className="stats-grid">
          <StatWidget
            icon="👥"
            label="Total Applicants"
            value={stats.total}
            colorClass="widget--total"
            linkTo="/applicants"
            linkLabel="View all applicants"
          />
          <StatWidget
            icon="⚡"
            label="Active in Pipeline"
            value={stats.activeCount}
            colorClass="widget--active"
            linkTo="/applicants"
            linkLabel="View active applicants"
          />
          <StatWidget
            icon="🆕"
            label="New This Week"
            value={stats.newThisWeek}
            colorClass="widget--new"
          />
          <StatWidget
            icon="🏆"
            label="Hire Rate"
            value={hireRate(stats)}
            colorClass="widget--hire-rate"
          />
        </div>
      </section>

      {/* ── Pipeline status widgets ──────────────────────────────────── */}
      <section aria-labelledby="pipeline-status-heading">
        <h2 id="pipeline-status-heading" className="section-heading">
          Pipeline Status
        </h2>
        <div className="status-widgets-grid">
          {APPLICANT_STATUSES.map((status) => {
            const cfg = STATUS_CONFIG[status];
            return (
              <Link
                key={status}
                to={`/applicants?status=${status}`}
                className={`status-widget card ${cfg.colorClass}`}
                aria-label={`${cfg.label}: ${stats.statusCounts[status]} applicants`}
              >
                <span className="status-widget__icon" aria-hidden="true">
                  {cfg.icon}
                </span>
                <span className="status-widget__count">
                  {stats.statusCounts[status]}
                </span>
                <span className="status-widget__label">{cfg.label}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Main content grid: pipeline chart + recent applicants ────── */}
      <div className="dashboard-main-grid">

        {/* Pipeline breakdown */}
        <section className="card pipeline-section" aria-labelledby="pipeline-breakdown-heading">
          <h2 id="pipeline-breakdown-heading" className="section-heading section-heading--card">
            Pipeline Breakdown
          </h2>
          <PipelineBar stats={stats} />
        </section>

        {/* Recent applicants */}
        <section className="card recent-section" aria-labelledby="recent-applicants-heading">
          <div className="recent-section__header">
            <h2
              id="recent-applicants-heading"
              className="section-heading section-heading--card"
            >
              Recent Applicants
            </h2>
            <Link to="/applicants" className="recent-section__see-all">
              See all →
            </Link>
          </div>
          <RecentApplicants applicants={recentApplicants} />
        </section>

      </div>

      {/* ── Quick actions ────────────────────────────────────────────── */}
      <section aria-labelledby="quick-actions-heading">
        <h2 id="quick-actions-heading" className="section-heading">
          Quick Actions
        </h2>
        <div className="quick-actions-grid">
          <Link to="/applicants" className="quick-action-card card">
            <span className="quick-action-card__icon" aria-hidden="true">🔍</span>
            <div className="quick-action-card__body">
              <p className="quick-action-card__title">Search Applicants</p>
              <p className="quick-action-card__desc">
                Filter and search through your talent pool
              </p>
            </div>
            <span className="quick-action-card__arrow" aria-hidden="true">→</span>
          </Link>

          <Link
            to="/applicants?status=interview"
            className="quick-action-card card"
          >
            <span className="quick-action-card__icon" aria-hidden="true">🗓️</span>
            <div className="quick-action-card__body">
              <p className="quick-action-card__title">Interviews Scheduled</p>
              <p className="quick-action-card__desc">
                View candidates currently in the interview stage
              </p>
            </div>
            <span className="quick-action-card__arrow" aria-hidden="true">→</span>
          </Link>

          <Link
            to="/applicants?status=offer"
            className="quick-action-card card"
          >
            <span className="quick-action-card__icon" aria-hidden="true">📬</span>
            <div className="quick-action-card__body">
              <p className="quick-action-card__title">Pending Offers</p>
              <p className="quick-action-card__desc">
                Track applicants with outstanding offers
              </p>
            </div>
            <span className="quick-action-card__arrow" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

    </div>
  );
}

export default DashboardPage;
