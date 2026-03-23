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

export interface Applicant {
  id: number;
  name: string;
  email: string;
  phone?: string;
  position?: string;
  status: ApplicantStatus;
  resume_url?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateApplicantDTO {
  name: string;
  email: string;
  phone?: string;
  position?: string;
  status?: ApplicantStatus;
  resume_url?: string;
}

export interface UpdateApplicantDTO {
  name?: string;
  email?: string;
  phone?: string;
  position?: string;
  status?: ApplicantStatus;
  resume_url?: string;
}

export interface ApplicantFilters {
  status?: ApplicantStatus;
  position?: string;
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
