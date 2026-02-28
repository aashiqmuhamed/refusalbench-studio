import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import InputPanel from '@/components/InputPanel';
import TransformVisualization from '@/components/TransformVisualization';
import VerificationDashboard from '@/components/VerificationDashboard';
import DynamicInferenceLab from '@/components/DynamicInferenceLab';
import { apiUrl } from '@/api';
import './styles/app.css';
const App = () => {
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentView, setCurrentView] = useState('generate');
    const handleGenerate = async (payload) => {
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
            const data = (await response.json());
            console.log('Response data:', data);
            if (!data.generation_successful) {
                throw new Error(data.error || 'Generation failed.');
            }
            setResult(data);
        }
        catch (err) {
            console.error('Error details:', err);
            if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
                setError('Cannot connect to backend. Make sure the backend is running on port 4075 and the Vite dev server has been restarted.');
            }
            else {
                setError(err instanceof Error ? err.message : 'Unexpected error.');
            }
        }
        finally {
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
        return (_jsx(DynamicInferenceLab, { initialQuery: result.perturbed_query, initialContext: result.perturbed_context, expectedModelOutput: result.ground_truth_label, onBack: handleBackToVerify }));
    }
    if (currentView === 'verify' && result) {
        return (_jsx(VerificationDashboard, { perturbationData: result, onBack: handleBackToGenerate, onInferenceLab: handleInferenceLab }));
    }
    return (_jsxs("div", { className: "page", children: [_jsxs("header", { className: "page__header", children: [_jsxs("div", { children: [_jsx("h1", { className: "page__title", children: "RefusalBenchStudio - Generate Perturbation" }), _jsx("p", { className: "page__subtitle", children: "Enter a question, context, and answer, choose a perturbation class and intensity, and generate a perturbation." })] }), _jsx("div", { className: "page__tags" })] }), _jsxs("main", { className: "page__content", children: [_jsx(InputPanel, { loading: loading, onSubmit: handleGenerate }), _jsx(TransformVisualization, { data: result, loading: loading, error: error, onVerify: result?.generation_successful ? handleVerify : undefined })] })] }));
};
export default App;
