import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Applicant } from '../types/applicant';
import { applicantService } from '../services/applicantService';
import './ApplicantDetailPage.css';

function ApplicantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadApplicant(id);
    }
  }, [id]);

  const loadApplicant = async (applicantId: string) => {
    try {
      setLoading(true);
      const data = await applicantService.getById(applicantId);
      setApplicant(data);
      setError(null);
    } catch (err) {
      setError('Failed to load applicant details. Please try again later.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading applicant details...</div>;
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error">{error}</div>
        <button onClick={() => navigate('/applicants')} className="btn btn-secondary">
          Back to Applicants
        </button>
      </div>
    );
  }

  if (!applicant) {
    return (
      <div className="error-container">
        <div className="error">Applicant not found</div>
        <button onClick={() => navigate('/applicants')} className="btn btn-secondary">
          Back to Applicants
        </button>
      </div>
    );
  }

  return (
    <div className="applicant-detail-page">
      <button onClick={() => navigate('/applicants')} className="btn btn-secondary back-btn">
        ← Back to Applicants
      </button>

      <div className="detail-card card">
        <div className="detail-header">
          <h1>{applicant.name}</h1>
          <span className={`status-badge status-${applicant.status}`}>{applicant.status}</span>
        </div>

        <div className="detail-section">
          <h3>Contact Information</h3>
          <div className="detail-grid">
            <div className="detail-item">
              <label>Email</label>
              <p>{applicant.email}</p>
            </div>
            {applicant.phone && (
              <div className="detail-item">
                <label>Phone</label>
                <p>{applicant.phone}</p>
              </div>
            )}
          </div>
        </div>

        {applicant.position && (
          <div className="detail-section">
            <h3>Application Details</h3>
            <div className="detail-item">
              <label>Position</label>
              <p>{applicant.position}</p>
            </div>
          </div>
        )}

        {applicant.resume_url && (
          <div className="detail-section">
            <h3>Documents</h3>
            <a href={applicant.resume_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              View Resume
            </a>
          </div>
        )}

        <div className="detail-section">
          <h3>Timeline</h3>
          <div className="detail-item">
            <label>Applied On</label>
            <p>{new Date(applicant.created_at).toLocaleDateString()}</p>
          </div>
          <div className="detail-item">
            <label>Last Updated</label>
            <p>{new Date(applicant.updated_at).toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ApplicantDetailPage;
