import { Link } from 'react-router-dom';
import './AuthPage.css';

function UnauthorizedPage() {
  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h1 className="auth-title">Access Denied</h1>
        <p className="auth-subtitle">
          You don&apos;t have permission to view this page.
        </p>
        <Link to="/" className="btn btn-primary btn-full" style={{ display: 'block', textAlign: 'center', marginTop: '1.5rem', textDecoration: 'none' }}>
          Go to Home
        </Link>
      </div>
    </div>
  );
}

export default UnauthorizedPage;
