import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { MasterDataProvider } from './lib/MasterDataContext';
import { ToastProvider } from './lib/ToastContext';
import { ThemeProvider } from './lib/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import Layout from './components/Layout';
import Login from './pages/Login';

// Optional: you can update APP_VERSION to force a client cache clear
const APP_VERSION = '1.0.1';

// Placeholder fragments for other pages
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const ImportExcel = React.lazy(() => import('./pages/ImportExcel'));
const ReportCenter = React.lazy(() => import('./pages/ReportCenter'));
const PerformanceCompare = React.lazy(() => import('./pages/PerformanceCompare'));
const BranchMapping = React.lazy(() => import('./pages/BranchMapping'));
const DatabaseHealth = React.lazy(() => import('./pages/DatabaseHealth'));
const ImportHistory = React.lazy(() => import('./pages/ImportHistory'));
const ReportPrintView = React.lazy(() => import('./pages/ReportPrintView'));
const CompanySettings = React.lazy(() => import('./pages/CompanySettings'));
const MasterSettings = React.lazy(() => import('./pages/MasterSettings'));
const CommissionDashboard = React.lazy(() => import('./pages/CommissionDashboard'));
const CommissionMapping = React.lazy(() => import('./pages/CommissionMapping'));
const CommissionSummary = React.lazy(() => import('./pages/CommissionSummary'));
const UnmappedCommission = React.lazy(() => import('./pages/UnmappedCommission'));
const UserManagement = React.lazy(() => import('./pages/UserManagement'));
const ForgotPassword = React.lazy(() => import('./pages/ForgotPassword'));
const AccessDenied = React.lazy(() => import('./pages/AccessDenied'));

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function RoleRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: ('admin' | 'manager' | 'staff' | 'viewer')[] }) {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const role = profile?.role;
  if (!role || !allowedRoles.includes(role as any)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}

export default function App() {
  useEffect(() => {
    const currentVersion = localStorage.getItem('APP_VERSION');
    if (currentVersion !== APP_VERSION) {
      // Clear cache on version mismatch
      localStorage.removeItem('recently_used_menus');
      sessionStorage.clear();
      localStorage.setItem('APP_VERSION', APP_VERSION);
      // Optional: window.location.reload() if strictly needed, but careful of infinite loops
    }
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <MasterDataProvider>
              <BrowserRouter>
              <React.Suspense fallback={
              <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            }>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              
              <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
                 <Route index element={<Dashboard />} />
                 <Route path="import" element={<ImportExcel />} />
                 <Route path="report-center" element={<ReportCenter />} />
                 <Route path="performance-compare" element={<PerformanceCompare />} />
                 <Route path="branch-mapping" element={<BranchMapping />} />
                 <Route path="database-health" element={
                   <RoleRoute allowedRoles={['admin']}>
                     <DatabaseHealth />
                   </RoleRoute>
                 } />
                 <Route path="history" element={<ImportHistory />} />
                 <Route path="settings" element={
                   <RoleRoute allowedRoles={['admin']}>
                     <CompanySettings />
                   </RoleRoute>
                 } />
                 <Route path="master-settings" element={
                   <RoleRoute allowedRoles={['admin', 'manager']}>
                     <MasterSettings />
                   </RoleRoute>
                 } />
                 <Route path="commission" element={<CommissionDashboard />} />
                 <Route path="commission-mapping" element={
                   <RoleRoute allowedRoles={['admin', 'manager']}>
                     <CommissionMapping />
                   </RoleRoute>
                 } />
                 <Route path="commission-summary" element={<CommissionSummary />} />
                 <Route path="unmapped-commission" element={<UnmappedCommission />} />
                 <Route path="users" element={
                   <RoleRoute allowedRoles={['admin']}>
                     <UserManagement />
                   </RoleRoute>
                 } />
                 <Route path="access-denied" element={<AccessDenied />} />
              </Route>
              
              <Route path="/print/report/:reportId" element={
                <PrivateRoute>
                  <ReportPrintView />
                </PrivateRoute>
              } />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </React.Suspense>
        </BrowserRouter>
      </MasterDataProvider>
      </ToastProvider>
    </AuthProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}
