import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navigation.css';

function Navigation() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav className="navigation">
      <div className="container">
        <div className="nav-content">
          <Link to="/" className="nav-brand">
            ATS Test
          </Link>

          <ul className="nav-links">
            <li>
              <Link to="/" className="nav-link">
                Home
              </Link>
            </li>
            {isAuthenticated && (
              <li>
                <Link to="/applicants" className="nav-link">
                  Applicants
                </Link>
              </li>
            )}
          </ul>

          <div className="nav-auth">
            {isAuthenticated ? (
              <>
                <span className="nav-user">
                  <span className="nav-user-name">{user?.name}</span>
                  <span className="nav-user-role">{user?.role}</span>
                </span>
                <button onClick={handleLogout} className="btn btn-secondary nav-logout-btn">
                  Sign Out
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn-primary">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navigation;
