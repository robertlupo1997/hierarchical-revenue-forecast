import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Explainability } from './pages/Explainability';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/explain/:store/:family" element={<Explainability />} />
    </Routes>
  );
}

export default App;
