import { FormEvent, useState } from 'react';
import { loginCurrentUser } from '../../auth/currentUser';
import type { CurrentUser } from '../../types/auth';
import './login.css';

interface LoginPageProps {
  onLogin: (user: CurrentUser) => void;
}

function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const user = await loginCurrentUser(username, password);
      window.localStorage.setItem('currentUser', JSON.stringify(user));
      onLogin(user);
      window.location.replace(user.forceChangePassword ? '/change-password' : '/admin');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '账号或密码错误');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={handleSubmit}>
        <header>
          <span>电商运营系统</span>
          <h1>用户登录</h1>
        </header>

        <label>
          用户名
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        <label>
          密码
          <input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error && <p className="login-error">{error}</p>}

        <button disabled={submitting} type="submit">
          {submitting ? '登录中...' : '登录'}
        </button>
      </form>
    </main>
  );
}

export default LoginPage;
