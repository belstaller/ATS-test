import { useEffect, useState } from 'react';
import ApplicantCard from '../components/ApplicantCard';
import { Applicant } from '../types/applicant';
import { applicantService } from '../services/applicantService';
import './ApplicantsPage.css';

function ApplicantsPage() {
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadApplicants();
  }, []);

  const loadApplicants = async () => {
    try {
      setLoading(true);
      const data = await applicantService.getAll();
      setApplicants(data);
      setError(null);
    } catch (err) {
      setError('Failed to load applicants. Please try again later.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading applicants...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="applicants-page">
      <div className="page-header">
        <h1>Applicants</h1>
        <p className="page-subtitle">Manage and track all job applicants</p>
      </div>

      {applicants.length === 0 ? (
        <div className="empty-state card">
          <p>No applicants found. Start by adding new applicants to the system.</p>
        </div>
      ) : (
        <div className="applicants-grid">
          {applicants.map((applicant) => (
            <ApplicantCard key={applicant.id} applicant={applicant} />
          ))}
        </div>
      )}
    </div>
  );
}

export default ApplicantsPage;
