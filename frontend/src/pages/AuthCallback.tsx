import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../lib/appContext';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { refreshSession, setStatus, setToken } = useApp();

  useEffect(() => {
    const run = async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
      const queryParams = new URLSearchParams(window.location.search);
      const token = hashParams.get('token') || queryParams.get('token');
      const provider = queryParams.get('provider');
      const status = queryParams.get('status');

      if (token) {
        setToken(token);
      }

      try {
        const authenticated = await refreshSession();
        if (status === 'error') {
          setStatus(`Unable to connect ${provider ?? 'provider'}. Please try again.`);
          navigate('/', { replace: true });
          return;
        }

        if (!authenticated) {
          setStatus('Authentication could not be completed. Please try again.');
          navigate('/', { replace: true });
          return;
        }

        setStatus(`Connected ${provider ?? 'inbox'} successfully.`);
        navigate('/dashboard', { replace: true });
      } catch (error) {
        console.error(error);
        setStatus('Authentication failed. Please try again.');
        navigate('/', { replace: true });
      }
    };

    void run();
  }, [navigate, refreshSession, setStatus, setToken]);

  return (
    <div className="glass-card rounded-[28px] p-10 text-center text-slate-500">
      Completing secure sign-in...
    </div>
  );
}
