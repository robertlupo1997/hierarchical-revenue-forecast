import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Explainability } from './pages/Explainability';
import { Compare } from './pages/Compare';
import { Batch } from './pages/Batch';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/explain/:store/:family" element={<Explainability />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/batch" element={<Batch />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
