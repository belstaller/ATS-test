import { apiService, setStoredToken, removeStoredToken } from './api';
import { AuthResponse, LoginDTO, RegisterDTO, User } from '../types/auth';

class AuthService {
  async login(data: LoginDTO): Promise<AuthResponse> {
    const response = await apiService.post<AuthResponse>('/auth/login', data);
    setStoredToken(response.token);
    return response;
  }

  async register(data: RegisterDTO): Promise<AuthResponse> {
    const response = await apiService.post<AuthResponse>('/auth/register', data);
    setStoredToken(response.token);
    return response;
  }

  async getMe(): Promise<User> {
    return apiService.get<User>('/auth/me');
  }

  logout(): void {
    removeStoredToken();
  }
}

export const authService = new AuthService();
