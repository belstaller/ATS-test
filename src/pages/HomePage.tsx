import { Link } from 'react-router-dom';
import './HomePage.css';

function HomePage() {
  return (
    <div className="home-page">
      <div className="hero">
        <h1>Welcome to ATS Test</h1>
        <p className="hero-subtitle">
          A modern Applicant Tracking System to manage your recruitment process efficiently
        </p>
        <div className="hero-actions">
          <Link to="/applicants" className="btn btn-primary btn-large">
            View Applicants
          </Link>
        </div>
      </div>

      <div className="features">
        <div className="feature-card card">
          <h3>Track Applicants</h3>
          <p>Manage all your job applicants in one centralized location</p>
        </div>
        <div className="feature-card card">
          <h3>Monitor Status</h3>
          <p>Keep track of each applicant's progress through the hiring pipeline</p>
        </div>
        <div className="feature-card card">
          <h3>Efficient Workflow</h3>
          <p>Streamline your recruitment process with modern tools</p>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
