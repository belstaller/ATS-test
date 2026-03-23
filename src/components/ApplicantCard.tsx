import { Link } from 'react-router-dom';
import { Applicant } from '../types/applicant';
import './ApplicantCard.css';

interface ApplicantCardProps {
  applicant: Applicant;
}

function ApplicantCard({ applicant }: ApplicantCardProps) {
  const statusColor =
    applicant.status === 'hired'
      ? 'status-success'
      : applicant.status === 'rejected'
        ? 'status-error'
        : 'status-pending';

  return (
    <div className="applicant-card card">
      <div className="applicant-header">
        <h3>{applicant.name}</h3>
        <span className={`status-badge ${statusColor}`}>{applicant.status}</span>
      </div>
      <p className="applicant-email">{applicant.email}</p>
      {applicant.position && <p className="applicant-position">Position: {applicant.position}</p>}
      {applicant.phone && <p className="applicant-phone">Phone: {applicant.phone}</p>}
      <div className="applicant-footer">
        <Link to={`/applicants/${applicant.id}`} className="btn btn-primary">
          View Details
        </Link>
      </div>
    </div>
  );
}

export default ApplicantCard;
