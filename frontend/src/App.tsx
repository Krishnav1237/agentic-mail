import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import LandingPage from './pages/Landing';
import DashboardPage from './pages/Dashboard';
import TasksPage from './pages/Tasks';
import DeadlinesPage from './pages/Deadlines';
import OpportunitiesPage from './pages/Opportunities';
import InboxPage from './pages/Inbox';
import AgentPage from './pages/Agent';
import SettingsPage from './pages/Settings';
import AuthCallbackPage from './pages/AuthCallback';
import { useApp } from './lib/useApp';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { hasToken, authLoading } = useApp();
  if (authLoading) {
    return (
      <div className="glass-card rounded-xl border border-neutral-800 p-10 text-center text-neutral-300">
        Validating your secure session...
      </div>
    );
  }
  if (!hasToken) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/deadlines" element={<DeadlinesPage />} />
        <Route path="/opportunities" element={<OpportunitiesPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/agent" element={<AgentPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
