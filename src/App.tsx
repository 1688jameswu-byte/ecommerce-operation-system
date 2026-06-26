import { lazy, Suspense } from 'react';
import ChangePasswordPage from './pages/login/ChangePasswordPage';
import LoginPage from './pages/login/LoginPage';
import { useCurrentUser } from './auth/currentUser';

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));

function App() {
  const { currentUser, loading, setCurrentUser } = useCurrentUser();

  if (window.location.hostname === 'localhost') {
    window.location.replace(window.location.href.replace('//localhost', '//127.0.0.1'));
    return null;
  }

  if (loading) {
    return null;
  }

  if (window.location.pathname === '/login') {
    if (currentUser) {
      window.location.replace(currentUser.forceChangePassword ? '/change-password' : '/admin');
      return null;
    }

    return <LoginPage onLogin={setCurrentUser} />;
  }

  if (window.location.pathname === '/change-password') {
    if (!currentUser) {
      window.location.replace('/login');
      return null;
    }

    return <ChangePasswordPage onChanged={setCurrentUser} />;
  }

  if (window.location.pathname.startsWith('/admin') || window.location.pathname.startsWith('/new-product-center')) {
    if (!currentUser) {
      window.location.replace('/login');
      return null;
    }

    if (currentUser.forceChangePassword) {
      window.location.replace('/change-password');
      return null;
    }

    return (
      <Suspense fallback={null}>
        <AdminLayout currentUser={currentUser} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
      <DashboardPage />
    </Suspense>
  );
}

export default App;
