import { apiService } from './api';
import { Applicant, CreateApplicantDTO, UpdateApplicantDTO } from '../types/applicant';

class ApplicantService {
  async getAll(): Promise<Applicant[]> {
    return apiService.get<Applicant[]>('/applicants');
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
