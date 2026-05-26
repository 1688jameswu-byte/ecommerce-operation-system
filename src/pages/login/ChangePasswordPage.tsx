import { FormEvent, useState } from 'react';
import { changeCurrentUserPassword } from '../../auth/currentUser';
import type { CurrentUser } from '../../types/auth';
import './login.css';

function ChangePasswordPage({ onChanged }: { onChanged: (user: CurrentUser) => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!password || password !== confirmPassword) {
      setError('请确认两次输入的新密码一致');
      return;
    }

    setSubmitting(true);
    try {
      const user = await changeCurrentUserPassword(password);
      window.localStorage.setItem('currentUser', JSON.stringify(user));
      onChanged(user);
      window.location.replace('/admin');
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : '密码修改失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={handleSubmit}>
        <header>
          <span>电商运营系统</span>
          <h1>修改密码</h1>
        </header>
        <label>
          新密码
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label>
          确认新密码
          <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button disabled={submitting} type="submit">
          {submitting ? '提交中...' : '保存新密码'}
        </button>
      </form>
    </main>
  );
}

export default ChangePasswordPage;
