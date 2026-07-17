import { Navigate, Outlet } from 'react-router-dom';
import { Role } from '../types';
import { useAuth } from './AuthContext';

export function AdminRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="page-loader">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== Role.Owner && user.role !== Role.Admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
