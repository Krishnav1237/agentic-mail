import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import Dashboard from './pages/workspace/Dashboard';
import Inbox from './pages/workspace/Inbox';
import Actions from './pages/workspace/Actions';
import Opportunities from './pages/workspace/Opportunities';
import Approvals from './pages/workspace/Approvals';
import Completed from './pages/workspace/Completed';
import Settings from './pages/workspace/Settings';
import Profile from './pages/workspace/Profile';
import Foundation from './pages/workspace/Foundation';

/**
 * Landing is the only consumer of Three.js/@react-three/fiber in the app
 * (its starfield). Lazy-loaded so the workspace bundle — every authenticated
 * route — never downloads a 3D renderer it will never mount. Performance
 * change only; Landing's own implementation is untouched.
 */
const LandingPage = lazy(() => import('./pages/Landing'));

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Suspense fallback={null}>
            <LandingPage />
          </Suspense>
        }
      />
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/inbox/:view" element={<Inbox />} />
        <Route path="/actions" element={<Actions />} />
        <Route path="/opportunities" element={<Opportunities />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/completed" element={<Completed />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
        {/* Permanent dev-only style guide for the shared foundation — see
            Foundation.tsx. Deliberately outside the sidebar and MAIL_VIEWS. */}
        <Route path="/foundation" element={<Foundation />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
