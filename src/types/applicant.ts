export interface Applicant {
  id: string;
  name: string;
  email: string;
  phone?: string;
  position?: string;
  status: 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';
  resume_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateApplicantDTO {
  name: string;
  email: string;
  phone?: string;
  position?: string;
  status?: Applicant['status'];
  resume_url?: string;
}

export interface UpdateApplicantDTO {
  name?: string;
  email?: string;
  phone?: string;
  position?: string;
  status?: Applicant['status'];
  resume_url?: string;
}
