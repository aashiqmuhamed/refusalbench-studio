import { useState } from 'react';
import InputPanel from '@/components/InputPanel';
import TransformVisualization from '@/components/TransformVisualization';
import VerificationDashboard from '@/components/VerificationDashboard';
import DynamicInferenceLab from '@/components/DynamicInferenceLab';
import { GeneratePerturbationRequest, PerturbationResponse } from '@/types';
import { apiUrl } from '@/api';
import './styles/app.css';

type View = 'generate' | 'verify' | 'inference-lab';

const App = () => {
  const [result, setResult] = useState<PerturbationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<View>('generate');

  const handleGenerate = async (payload: GeneratePerturbationRequest) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      console.log('Sending request to /perturb with payload:', payload);
      const response = await fetch(apiUrl('/perturb'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      console.log('Response status:', response.status, response.statusText);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const message = await response.text();
        console.error('Response error:', message);
        throw new Error(message || `Failed to generate perturbation: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as PerturbationResponse;
      console.log('Response data:', data);
      
      if (!data.generation_successful) {
        throw new Error(data.error || 'Generation failed.');
      }
      setResult(data);
    } catch (err) {
      console.error('Error details:', err);
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        setError('Cannot connect to backend. Make sure the backend is running on port 4075 and the Vite dev server has been restarted.');
      } else {
        setError(err instanceof Error ? err.message : 'Unexpected error.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = () => {
    setCurrentView('verify');
  };

  const handleInferenceLab = () => {
    setCurrentView('inference-lab');
  };

  const handleBackToGenerate = () => {
    setCurrentView('generate');
  };

  const handleBackToVerify = () => {
    setCurrentView('verify');
  };

  if (currentView === 'inference-lab' && result) {
    return (
      <DynamicInferenceLab
        initialQuery={result.perturbed_query}
        initialContext={result.perturbed_context}
        expectedModelOutput={result.ground_truth_label}
        onBack={handleBackToVerify}
      />
    );
  }

  if (currentView === 'verify' && result) {
    return (
      <VerificationDashboard
        perturbationData={result}
        onBack={handleBackToGenerate}
        onInferenceLab={handleInferenceLab}
      />
    );
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">RefusalBenchStudio - Generate Perturbation</h1>
          <p className="page__subtitle">
            Enter a question, context, and answer, choose a perturbation class and intensity, and generate a perturbation.
          </p>
        </div>
        <div className="page__tags">
        </div>
      </header>

      <main className="page__content">
        <InputPanel loading={loading} onSubmit={handleGenerate} />
        <TransformVisualization 
          data={result} 
          loading={loading} 
          error={error}
          onVerify={result?.generation_successful ? handleVerify : undefined}
        />
      </main>
    </div>
  );
};

export default App;
