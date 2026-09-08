export const useAuth = () => {
  const [token, setToken] = React.useState<string | null>(null);
  const [user, setUser] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const initAuth = async () => {
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        const initData = window.Telegram.WebApp.initData;
        try {
          const response = await fetch('/api/auth/telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData }),
          });
          const data = await response.json();
          setToken(data.token);
          setUser(data.user);
          localStorage.setItem('auth_token', data.token);
        } catch (error) {
          console.error('Auth failed:', error);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  return { token, user, loading };
};
