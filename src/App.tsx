import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import AppLayout from './layouts/AppLayout';

function AppContent() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AppLayout /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
