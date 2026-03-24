import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ApplicantCard from '../components/ApplicantCard';
import { Applicant, ApplicantFilters, APPLICANT_STATUSES, APPLICANT_SOURCES } from '../types/applicant';
import { applicantService } from '../services/applicantService';
import './ApplicantsPage.css';

const DEBOUNCE_MS = 400;
const PAGE_SIZE = 20;

interface Pagination {
  page: number;
  totalPages: number;
  total: number;
}

function ApplicantsPage() {
  const [searchParams] = useSearchParams();

  // ── Filter state ────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  // Pre-populate status from ?status= query param (e.g. links from dashboard)
  const [status, setStatus] = useState(() => searchParams.get('status') ?? '');
  const [source, setSource] = useState('');
  const [location, setLocation] = useState('');
  const [position, setPosition] = useState('');
  const [skills, setSkills] = useState('');
  const [expMin, setExpMin] = useState('');
  const [expMax, setExpMax] = useState('');

  // ── Results state ───────────────────────────────────────────────────────
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Debounce timer ref ──────────────────────────────────────────────────
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived filters ─────────────────────────────────────────────────────
  const [activeFilters, setActiveFilters] = useState<ApplicantFilters>(() => {
    const initialStatus = searchParams.get('status') ?? undefined;
    return {
      page: 1,
      limit: PAGE_SIZE,
      ...(initialStatus ? { status: initialStatus as ApplicantFilters['status'] } : {}),
    };
  });

  /**
   * Schedules a filter update after the debounce window.
   * Resets to page 1 on every new filter change.
   */
  const scheduleSearch = (overrides: Partial<ApplicantFilters> = {}) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setActiveFilters((prev) => ({ ...prev, ...overrides, page: 1 }));
    }, DEBOUNCE_MS);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // ── Data fetching ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchApplicants = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await applicantService.search(activeFilters);
        if (!cancelled) {
          setApplicants(result.data);
          setPagination({
            page: result.page,
            totalPages: result.totalPages,
            total: result.total,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load applicants. Please try again.');
          console.error(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchApplicants();
    return () => {
      cancelled = true;
    };
  }, [activeFilters]);

  // ── Handler helpers ──────────────────────────────────────────────────────
  const handleSearchChange = (value: string) => {
    setSearch(value);
    scheduleSearch({ search: value || undefined });
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    scheduleSearch({ status: (value || undefined) as ApplicantFilters['status'] });
  };

  const handleSourceChange = (value: string) => {
    setSource(value);
    scheduleSearch({ source: (value || undefined) as ApplicantFilters['source'] });
  };

  const handleLocationChange = (value: string) => {
    setLocation(value);
    scheduleSearch({ location: value || undefined });
  };

  const handlePositionChange = (value: string) => {
    setPosition(value);
    scheduleSearch({ position: value || undefined });
  };

  const handleSkillsChange = (value: string) => {
    setSkills(value);
    scheduleSearch({ skills: value || undefined });
  };

  const handleExpMinChange = (value: string) => {
    setExpMin(value);
    const parsed = value !== '' ? parseInt(value, 10) : undefined;
    scheduleSearch({ experience_years_min: !isNaN(parsed as number) ? parsed : undefined });
  };

  const handleExpMaxChange = (value: string) => {
    setExpMax(value);
    const parsed = value !== '' ? parseInt(value, 10) : undefined;
    scheduleSearch({ experience_years_max: !isNaN(parsed as number) ? parsed : undefined });
  };

  const handlePageChange = (newPage: number) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setActiveFilters((prev) => ({ ...prev, page: newPage }));
  };

  const handleClearFilters = () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setSearch('');
    setStatus('');
    setSource('');
    setLocation('');
    setPosition('');
    setSkills('');
    setExpMin('');
    setExpMax('');
    setActiveFilters({ page: 1, limit: PAGE_SIZE });
  };

  const hasActiveFilters =
    search || status || source || location || position || skills || expMin || expMax;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="applicants-page">
      <div className="page-header">
        <div>
          <h1>Applicants</h1>
          <p className="page-subtitle">Manage and track all job applicants</p>
        </div>
        {!loading && (
          <p className="results-count">
            {pagination.total} {pagination.total === 1 ? 'result' : 'results'}
          </p>
        )}
      </div>

      {/* ── Search & Filter panel ─────────────────────────────────────── */}
      <div className="search-filter-panel card">
        {/* Primary search bar */}
        <div className="search-bar-row">
          <div className="search-input-wrapper">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Search by name, email, position or location…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              aria-label="Search applicants"
            />
            {search && (
              <button
                className="search-clear-btn"
                onClick={() => handleSearchChange('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          {hasActiveFilters && (
            <button className="btn btn-secondary clear-all-btn" onClick={handleClearFilters}>
              Clear all filters
            </button>
          )}
        </div>

        {/* Secondary filters row */}
        <div className="filters-row">
          <div className="filter-group">
            <label htmlFor="filter-status" className="filter-label">Status</label>
            <select
              id="filter-status"
              className="filter-select"
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
            >
              <option value="">All statuses</option>
              {APPLICANT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="filter-source" className="filter-label">Source</label>
            <select
              id="filter-source"
              className="filter-select"
              value={source}
              onChange={(e) => handleSourceChange(e.target.value)}
            >
              <option value="">All sources</option>
              {APPLICANT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="filter-position" className="filter-label">Position</label>
            <input
              id="filter-position"
              type="text"
              className="filter-input"
              placeholder="e.g. Engineer"
              value={position}
              onChange={(e) => handlePositionChange(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label htmlFor="filter-location" className="filter-label">Location</label>
            <input
              id="filter-location"
              type="text"
              className="filter-input"
              placeholder="e.g. Berlin"
              value={location}
              onChange={(e) => handleLocationChange(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label htmlFor="filter-skills" className="filter-label">
              Skills
              <span className="filter-hint">(comma-separated)</span>
            </label>
            <input
              id="filter-skills"
              type="text"
              className="filter-input"
              placeholder="e.g. TypeScript,React"
              value={skills}
              onChange={(e) => handleSkillsChange(e.target.value)}
            />
          </div>

          <div className="filter-group filter-group--range">
            <label className="filter-label">Exp. years</label>
            <div className="range-inputs">
              <input
                type="number"
                className="filter-input filter-input--short"
                placeholder="Min"
                min={0}
                value={expMin}
                onChange={(e) => handleExpMinChange(e.target.value)}
                aria-label="Minimum years of experience"
              />
              <span className="range-separator">–</span>
              <input
                type="number"
                className="filter-input filter-input--short"
                placeholder="Max"
                min={0}
                value={expMax}
                onChange={(e) => handleExpMaxChange(e.target.value)}
                aria-label="Maximum years of experience"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Results ───────────────────────────────────────────────────── */}
      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="loading">Loading applicants…</div>
      ) : applicants.length === 0 ? (
        <div className="empty-state card">
          {hasActiveFilters ? (
            <>
              <p>No applicants match your current filters.</p>
              <button className="btn btn-secondary" onClick={handleClearFilters}>
                Clear filters
              </button>
            </>
          ) : (
            <p>No applicants found. Start by adding new applicants to the system.</p>
          )}
        </div>
      ) : (
        <>
          <div className="applicants-grid">
            {applicants.map((applicant) => (
              <ApplicantCard key={applicant.id} applicant={applicant} />
            ))}
          </div>

          {/* ── Pagination ─────────────────────────────────────────── */}
          {pagination.totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn btn-secondary pagination-btn"
                disabled={pagination.page <= 1}
                onClick={() => handlePageChange(pagination.page - 1)}
                aria-label="Previous page"
              >
                ← Prev
              </button>

              <span className="pagination-info">
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <button
                className="btn btn-secondary pagination-btn"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
                aria-label="Next page"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ApplicantsPage;
