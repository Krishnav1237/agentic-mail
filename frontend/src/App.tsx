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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route element={<AppShell />}>
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
  );
}
