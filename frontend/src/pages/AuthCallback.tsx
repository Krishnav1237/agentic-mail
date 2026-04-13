import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../lib/useApp';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { refreshSession, setStatus } = useApp();

  useEffect(() => {
    const run = async () => {
      const queryParams = new URLSearchParams(window.location.search);
      const provider = queryParams.get('provider');
      const status = queryParams.get('status');

      try {
        const authenticated = await refreshSession();
        if (status === 'error') {
          setStatus(
            `Unable to connect ${provider ?? 'provider'}. Please try again.`
          );
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
  }, [navigate, refreshSession, setStatus]);

  return (
    <div className="glass-card rounded-xl p-10 text-center text-neutral-400">
      Completing secure sign-in...
    </div>
  );
}
