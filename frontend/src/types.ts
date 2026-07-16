export type Role = 'owner' | 'admin' | 'user';
export type Provider = 'google' | 'microsoft';

export interface User {
  id: number;
  email: string;
  display_name: string | null;
  role: Role;
  is_active: boolean;
  auth_providers: Provider[];
  created_at: string;
  last_login_at: string | null;
}

export interface UserList {
  items: User[];
  total: number;
}

export interface DashboardStats {
  total_users: number;
  active_users: number;
}

export interface Dashboard {
  message: string;
  stats: DashboardStats;
}
