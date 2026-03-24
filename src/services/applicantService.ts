import { apiService } from './api';
import {
  Applicant,
  ApplicantFilters,
  CreateApplicantDTO,
  PaginatedApplicants,
  UpdateApplicantDTO,
} from '../types/applicant';

/**
 * Serialises an `ApplicantFilters` object into a URL query string,
 * omitting any keys whose value is `undefined`, `null`, or an empty string.
 */
function buildQueryString(filters: ApplicantFilters): string {
  const params = new URLSearchParams();

  const append = (key: string, value: string | number | undefined): void => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  };

  append('status', filters.status);
  append('source', filters.source);
  append('position', filters.position);
  append('location', filters.location);
  append('skills', filters.skills);
  append('assigned_to', filters.assigned_to);
  append('experience_years_min', filters.experience_years_min);
  append('experience_years_max', filters.experience_years_max);
  append('search', filters.search);
  append('page', filters.page);
  append('limit', filters.limit);

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

class ApplicantService {
  /**
   * Returns a paginated, optionally filtered list of applicants.
   * When no filters are supplied the first page (20 items) is returned.
   */
  async search(filters: ApplicantFilters = {}): Promise<PaginatedApplicants> {
    return apiService.get<PaginatedApplicants>(`/applicants${buildQueryString(filters)}`);
  }

  /** @deprecated Use `search()` instead — kept for backward compatibility. */
  async getAll(): Promise<Applicant[]> {
    const result = await this.search();
    return result.data;
  }

  async getById(id: string): Promise<Applicant> {
    return apiService.get<Applicant>(`/applicants/${id}`);
  }

  async create(data: CreateApplicantDTO): Promise<Applicant> {
    return apiService.post<Applicant>('/applicants', data);
  }

  async update(id: string, data: UpdateApplicantDTO): Promise<Applicant> {
    return apiService.put<Applicant>(`/applicants/${id}`, data);
  }

  async delete(id: string): Promise<void> {
    return apiService.delete<void>(`/applicants/${id}`);
  }
}

export const applicantService = new ApplicantService();
