import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DashboardPreview from './DashboardPreview';
import LandingPage from './LandingPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<DashboardPreview />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;