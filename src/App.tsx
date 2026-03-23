import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ApplicantsPage from './pages/ApplicantsPage';
import ApplicantDetailPage from './pages/ApplicantDetailPage';
import './App.css';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/applicants" element={<ApplicantsPage />} />
          <Route path="/applicants/:id" element={<ApplicantDetailPage />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
