import type { Dashboard, User, UserList } from '../types';

export const adminUser: User = {
  id: 1,
  email: 'admin@example.com',
  display_name: 'Admin User',
  role: 'admin',
  is_active: true,
  auth_providers: ['google'],
  created_at: '2026-07-15T00:00:00Z',
  last_login_at: null,
};

export const ownerUser: User = {
  id: 4,
  email: 'owner@example.com',
  display_name: 'Owner User',
  role: 'owner',
  is_active: true,
  auth_providers: ['google'],
  created_at: '2026-07-15T00:00:00Z',
  last_login_at: null,
};

export const regularUser: User = {
  id: 2,
  email: 'user@example.com',
  display_name: 'Regular User',
  role: 'user',
  is_active: true,
  auth_providers: ['google'],
  created_at: '2026-07-15T00:00:00Z',
  last_login_at: null,
};

export const microsoftUser: User = {
  id: 3,
  email: 'microsoft@example.com',
  display_name: null,
  role: 'user',
  is_active: false,
  auth_providers: ['microsoft'],
  created_at: '2026-07-14T00:00:00Z',
  last_login_at: null,
};

export const dashboard: Dashboard = {
  message: 'ok',
  stats: {
    total_users: 3,
    active_users: 2,
  },
};

export const userList: UserList = {
  items: [adminUser, regularUser, microsoftUser],
  total: 3,
};
