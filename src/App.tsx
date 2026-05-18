import DashboardPage from './pages/dashboard/DashboardPage';
import AdminLayout from './pages/admin/AdminLayout';

function App() {
  if (window.location.hostname === 'localhost') {
    window.location.replace(window.location.href.replace('//localhost', '//127.0.0.1'));
    return null;
  }

  if (window.location.pathname.startsWith('/admin')) {
    return <AdminLayout />;
  }

  return <DashboardPage />;
}

export default App;
