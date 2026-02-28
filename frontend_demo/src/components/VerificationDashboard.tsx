import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp, 
  Loader2, 
  Users, 
  BarChart3, 
  Clock, 
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Code,
  X,
  Copy,
  Check,
  Database
} from 'lucide-react';
import { PerturbationResponse, VerificationResult, VerifierConfig, SaveResultsRequest } from '@/types';
import { apiUrl } from '@/api';

// ============================================
// CONFIGURATION - Color mapping for verifiers
// ============================================
const VERIFIER_COLORS: string[] = ['blue', 'purple', 'indigo', 'green', 'amber', 'gray'];

const getVerifierConfig = (result: VerificationResult, index: number = 0): VerifierConfig => {
  // Use display name from backend if available, otherwise fallback to model_name or model_id
  const displayName = result.verification_display_name || 
                      result.verification_model_name || 
                      result.verification_model.split('/').pop() || 
                      result.verification_model;
  
  // Generate a short name from the display name
  const shortName = displayName.split(' ').map(word => word[0]).join('').slice(0, 4) || 
                    displayName.slice(0, 4);
  
  // Assign color based on index to ensure variety
  const color = VERIFIER_COLORS[index % VERIFIER_COLORS.length] as VerifierConfig['color'];
  
  return {
    displayName,
    shortName,
    color
  };
};

// ============================================
// COMPONENTS
// ============================================

const StatusBadge = ({ status, isStreaming = false }: { status?: string; isStreaming?: boolean }) => {
  if (isStreaming) {
    return (
      <span className="verify-status-badge verify-status-badge--streaming">
        <Loader2 className="w-3 h-3 animate-spin" /> Streaming...
      </span>
    );
  }
  if (status === 'PASS') {
    return (
      <span className="verify-status-badge verify-status-badge--pass">
        <CheckCircle className="w-3.5 h-3.5" /> PASS
      </span>
    );
  }
  if (status === 'FAIL') {
    return (
      <span className="verify-status-badge verify-status-badge--fail">
        <XCircle className="w-3.5 h-3.5" /> FAIL
      </span>
    );
  }
  return (
    <span className="verify-status-badge verify-status-badge--pending">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Pending
    </span>
  );
};

// JSON Modal Component
const JsonModal = ({ 
  isOpen, 
  onClose, 
  data, 
  title 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  data: unknown; 
  title: string;
}) => {
  const [copied, setCopied] = useState(false);
  
  if (!isOpen) return null;

  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="json-modal-overlay" onClick={onClose}>
      <div className="json-modal" onClick={e => e.stopPropagation()}>
        <div className="json-modal__header">
          <div className="json-modal__title">
            <Code className="w-4 h-4" />
            <span>{title}</span>
          </div>
          <div className="json-modal__actions">
            <button onClick={handleCopy} className="json-modal__copy-btn" title="Copy to clipboard">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button onClick={onClose} className="json-modal__close-btn" title="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <pre className="json-modal__content">
          {jsonString}
        </pre>
      </div>
    </div>
  );
};

const VerifierCard = ({ result, index = 0, isStreaming = false }: { result: VerificationResult; index?: number; isStreaming?: boolean }) => {
  const [expanded, setExpanded] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const config = getVerifierConfig(result, index);
  const v = result.verification_response;
  const isPending = !v || isStreaming;

  return (
    <div className={`verify-card verify-card--${config.color}`}>
      {/* Header */}
      <div className="verify-card__header">
        <div className="verify-card__info">
          <div className={`verify-card__dot verify-card__dot--${config.color} ${isPending ? 'verify-card__dot--pending' : ''}`} />
          <div>
            <h3 className="verify-card__name">{config.displayName}</h3>
            <p className="verify-card__model-id">{result.verification_model}</p>
          </div>
        </div>
        <StatusBadge status={v?.verification_result} isStreaming={isPending} />
      </div>

      {/* Predicted Behavior & Intensity */}
      {v && (
        <div className="verify-card__meta">
          <div className="verify-card__meta-row">
            <span className="verify-card__meta-label">Predicted RAG Behavior</span>
            <span className={`verify-card__behavior ${
              v.predicted_rag_behavior?.includes('REFUSE') ? 'verify-card__behavior--refuse' : 'verify-card__behavior--answer'
            }`}>
              {v.predicted_rag_behavior || '—'}
            </span>
          </div>
          <div className="verify-card__meta-row">
            <span className="verify-card__meta-label">Final Ground Truth Label</span>
            <span className={`verify-card__behavior ${
              v.final_ground_truth_label?.includes('REFUSE') ? 'verify-card__behavior--refuse' : 'verify-card__behavior--answer'
            }`}>
              {v.final_ground_truth_label || '—'}
            </span>
          </div>
          <div className="verify-card__meta-row">
            <span className="verify-card__meta-label">Actual Intensity Observed</span>
            <div className="verify-card__intensity-group">
              <span className={`verify-card__intensity ${
                v.actual_intensity_observed === 'HIGH' ? 'verify-card__intensity--high' :
                v.actual_intensity_observed === 'MEDIUM' ? 'verify-card__intensity--medium' :
                'verify-card__intensity--low'
              }`}>
                {v.actual_intensity_observed || '—'}
              </span>
              {v.actual_intensity_observed !== result.intensity && (
                <span className="verify-card__intensity-exp">(exp: {result.intensity})</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reasoning Analysis */}
      {v && (v.refusal_reasoning_analysis || v.constraint_analysis) && (
        <div className="verify-card__analysis">
          {v.refusal_reasoning_analysis && (
            <div className="verify-card__analysis-section">
              <span className="verify-card__analysis-label">Refusal Reasoning Analysis</span>
              <p className="verify-card__analysis-text">{v.refusal_reasoning_analysis}</p>
            </div>
          )}
          {v.constraint_analysis && (
            <div className="verify-card__analysis-section">
              <span className="verify-card__analysis-label">Constraint Analysis</span>
              <p className="verify-card__analysis-text">{v.constraint_analysis}</p>
            </div>
          )}
        </div>
      )}

      {/* Issues */}
      {v?.identified_issues && v.identified_issues.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="verify-card__issues-btn"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {v.identified_issues.length} issue{v.identified_issues.length > 1 ? 's' : ''}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {expanded && (
            <ul className="verify-card__issues-list">
              {v.identified_issues.map((issue, i) => (
                <li key={i} className="verify-card__issue">
                  {issue}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* View JSON Button */}
      <button
        onClick={() => setShowJson(true)}
        className="verify-card__json-btn"
      >
        <Code className="w-3.5 h-3.5" />
        View JSON
      </button>

      {/* JSON Modal */}
      <JsonModal
        isOpen={showJson}
        onClose={() => setShowJson(false)}
        data={result}
        title={`${config.displayName} - Verification Response`}
      />
    </div>
  );
};

const AgreementMatrix = ({ results }: { results: VerificationResult[] }) => {
  const verdicts = results.map(r => r.verification_response?.verification_result);
  
  const passCount = verdicts.filter(v => v === 'PASS').length;
  const failCount = verdicts.filter(v => v === 'FAIL').length;
  const total = passCount + failCount;
  
  const agreementRate = total > 1
    ? Math.round(Math.max(passCount, failCount) / total * 100)
    : null;

  return (
    <div className="verify-stats-card">
      <div className="verify-stats-card__header">
        <Users className="w-4 h-4 verify-stats-card__icon" />
        <h3 className="verify-stats-card__title">Verifier Agreement</h3>
      </div>
      
      <div className="verify-agreement__counts verify-agreement__counts--two">
        <div className="verify-agreement__count verify-agreement__count--pass">
          <div className="verify-agreement__number verify-agreement__number--pass">{passCount}</div>
          <div className="verify-agreement__label verify-agreement__label--pass">Pass</div>
        </div>
        <div className="verify-agreement__count verify-agreement__count--fail">
          <div className="verify-agreement__number verify-agreement__number--fail">{failCount}</div>
          <div className="verify-agreement__label verify-agreement__label--fail">Fail</div>
        </div>
      </div>

      {agreementRate !== null && (
        <div className="verify-agreement__progress">
          <div className="verify-agreement__bar">
            <div 
              className={`verify-agreement__fill ${agreementRate === 100 ? 'verify-agreement__fill--full' : 'verify-agreement__fill--partial'}`}
              style={{ width: `${agreementRate}%` }}
            />
          </div>
          <span className={`verify-agreement__percent ${agreementRate === 100 ? 'verify-agreement__percent--full' : 'verify-agreement__percent--partial'}`}>
            {agreementRate}%
          </span>
        </div>
      )}

      {/* Mini verdict row */}
      <div className="verify-agreement__verdicts">
        {results.map((r, i) => {
          const config = getVerifierConfig(r, i);
          const verdict = r.verification_response?.verification_result;
          return (
            <span
              key={i}
              className={`verify-verdict-badge ${
                verdict === 'PASS' ? 'verify-verdict-badge--pass' :
                verdict === 'FAIL' ? 'verify-verdict-badge--fail' :
                'verify-verdict-badge--pending'
              }`}
              title={config.displayName}
            >
              {config.shortName}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const CriteriaHeatmap = ({ results }: { results: VerificationResult[] }) => {
  const criteria = [
    { key: 'lever_correctly_implemented', label: 'Lever' },
    { key: 'intensity_correctly_achieved', label: 'Intensity' },
    { key: 'uncertainty_successfully_induced', label: 'Uncertainty' },
    { key: 'implementation_quality_sound', label: 'Quality' },
    { key: 'answer_constraint_satisfied', label: 'Constraint' },
    { key: 'ground_truth_alignment', label: 'GT Align' },
    { key: 'refusal_class_correct', label: 'Refusal' }
  ] as const;

  return (
    <div className="verify-stats-card">
      <div className="verify-stats-card__header">
        <BarChart3 className="w-4 h-4 verify-stats-card__icon" />
        <h3 className="verify-stats-card__title">Criteria Heatmap</h3>
      </div>
      
      <div style={{ overflowX: 'auto' }}>
        <table className="verify-heatmap__table">
          <thead>
            <tr>
              <th className="verify-heatmap__th verify-heatmap__th--left">Verifier</th>
              {criteria.map(c => (
                <th key={c.key} className="verify-heatmap__th">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const config = getVerifierConfig(r, i);
              const v = r.verification_response;
              return (
                <tr key={i}>
                  <td className="verify-heatmap__td verify-heatmap__td--name">{config.shortName}</td>
                  {criteria.map(c => (
                    <td key={c.key} className="verify-heatmap__td verify-heatmap__td--center">
                      {v?.[c.key] === undefined ? (
                        <span className="verify-heatmap__cell verify-heatmap__cell--pending" />
                      ) : (
                        <span className={`verify-heatmap__cell ${v[c.key] ? 'verify-heatmap__cell--pass' : 'verify-heatmap__cell--fail'}`} />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SampleInfo = ({ sample }: { sample: PerturbationResponse | null }) => {
  if (!sample) return null;
  
  return (
    <div className="verify-sample">
      <div className="verify-sample__columns">
        {/* Left Column - Original Input */}
        <div className="verify-sample__column">
          <div className="verify-sample__column-header">
            <h3 className="verify-sample__column-title">Original Input</h3>
            <div className="verify-sample__tags">
              <span className="verify-sample__tag verify-sample__tag--purple">
                {sample.perturbation_class}
              </span>
              <span className="verify-sample__tag verify-sample__tag--red">
                {sample.intensity}
              </span>
            </div>
          </div>
          
          <div className="verify-sample__field">
            <label className="verify-sample__label">Original Query</label>
            <p className="verify-sample__text">{sample.original_query}</p>
          </div>
          
          <div className="verify-sample__field">
            <label className="verify-sample__label">Original Context</label>
            <p className="verify-sample__context verify-sample__context--original">{sample.original_context}</p>
          </div>

          <div className="verify-sample__field">
            <label className="verify-sample__label">Original Answers</label>
            <p className="verify-sample__text">{Array.isArray(sample.original_answers) ? sample.original_answers.join(', ') : sample.original_answers}</p>
          </div>
        </div>

        {/* Right Column - Generator Output */}
        <div className="verify-sample__column verify-sample__column--highlight">
          <div className="verify-sample__column-header">
            <h3 className="verify-sample__column-title">Generator Output</h3>
            <div className="verify-sample__tags">
              {sample.generator_display_name && (
                <span className="verify-sample__tag verify-sample__tag--green">
                  {sample.generator_display_name}
                </span>
              )}
              <span className="verify-sample__tag verify-sample__tag--blue">
                {sample.lever_selected}
              </span>
            </div>
          </div>
          
          <div className="verify-sample__field">
            <label className="verify-sample__label">Perturbed Query</label>
            <p className="verify-sample__text">{sample.perturbed_query || sample.original_query}</p>
          </div>
          
          <div className="verify-sample__field">
            <label className="verify-sample__label">Perturbed Context</label>
            <p className="verify-sample__context verify-sample__context--perturbed">{sample.perturbed_context}</p>
          </div>

          <div className="verify-sample__field">
            <label className="verify-sample__label">Lever Selected</label>
            <p className="verify-sample__text verify-sample__text--lever">{sample.lever_selected}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// AUTO-SAVE LOGIC (replaces manual SatisfactionPrompt)
// ============================================
async function autoSaveResults(
  perturbationData: PerturbationResponse,
  verificationResults: VerificationResult[],
): Promise<void> {
  const payload: SaveResultsRequest = {
    perturbation_data: perturbationData,
    verification_results: verificationResults,
  };

  const response = await fetch(apiUrl('/save_results'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Auto-save failed: ${response.status}`);
  }
}

// ============================================
// MAIN DASHBOARD
// ============================================
interface VerificationDashboardProps {
  perturbationData: PerturbationResponse;
  onBack: () => void;
  onInferenceLab?: () => void;
}

export default function VerificationDashboard({ perturbationData, onBack, onInferenceLab }: VerificationDashboardProps) {
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasStartedRef = useRef(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTriggeredRef = useRef(false);

  const startVerification = useCallback(async (isManualRetry = false) => {
    // Prevent double-invocation from React StrictMode (only for auto-start)
    if (!isManualRetry && hasStartedRef.current) {
      return;
    }
    hasStartedRef.current = true;
    
    setResults([]);
    setIsStreaming(true);
    setError(null);
    setAutoSaveStatus('idle');
    autoSaveTriggeredRef.current = false;

    try {
      const response = await fetch(apiUrl('/verify'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(perturbationData)
      });

      if (!response.ok) {
        throw new Error(`Verification failed: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let depth = 0;
      let inString = false;
      let escapeNext = false;
      let objectStart = -1;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Parse JSON objects from the stream
        // The backend sends: [result1,result2]
        for (let i = 0; i < buffer.length; i++) {
          const char = buffer[i];
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\' && inString) {
            escapeNext = true;
            continue;
          }
          
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }
          
          if (inString) continue;
          
          if (char === '{') {
            if (depth === 0) {
              objectStart = i;
            }
            depth++;
          } else if (char === '}') {
            depth--;
            if (depth === 0 && objectStart !== -1) {
              const jsonStr = buffer.substring(objectStart, i + 1);
              try {
                const result = JSON.parse(jsonStr) as VerificationResult;
                setResults(prev => [...prev, result]);
              } catch (e) {
                console.error('Failed to parse result:', e);
              }
              buffer = buffer.substring(i + 1);
              i = -1; // Reset index for new buffer
              objectStart = -1;
            }
          }
        }
      }
    } catch (err) {
      console.error('Verification error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsStreaming(false);
    }
  }, [perturbationData]);

  // Auto-start verification when component mounts (with StrictMode protection)
  useEffect(() => {
    startVerification(false);
  }, [startVerification]);

  // Auto-save results when verification streaming completes
  useEffect(() => {
    if (!isStreaming && results.length > 0 && !autoSaveTriggeredRef.current) {
      autoSaveTriggeredRef.current = true;
      setAutoSaveStatus('saving');
      autoSaveResults(perturbationData, results)
        .then(() => setAutoSaveStatus('saved'))
        .catch((err) => {
          console.error('Auto-save failed:', err);
          setAutoSaveStatus('error');
        });
    }
  }, [isStreaming, results, perturbationData]);

  return (
    <div className="verify-page">
      <div className="verify-container">
        {/* Header */}
        <div className="verify-header">
          <div>
            <div style={{ marginBottom: '0.5rem' }}>  
              <button onClick={onBack} className="verify-back-btn">
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            </div>
            <h1 className="verify-header__title">RefusalBenchStudio - Verification Pipeline</h1>
          </div>
          
          <div className="verify-header__actions">
            {isStreaming && (
              <span className="verify-stream-status">
                <Loader2 className="w-4 h-4 animate-spin" />
                Streaming results...
              </span>
            )}
            <button
              onClick={() => startVerification(true)}
              disabled={isStreaming}
              className="verify-back-btn"
            >
              <RefreshCw className={`w-4 h-4 ${isStreaming ? 'animate-spin' : ''}`} />
              {isStreaming ? 'Streaming...' : 'Re-verify'}
            </button>
            {!isStreaming && results.length > 0 && onInferenceLab && (
              <button onClick={onInferenceLab} className="verify-action-btn">
                Inference Lab
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="verify-error">
            <div className="verify-error__content">
              <XCircle className="w-5 h-5 verify-error__icon" />
              <div>
                <h3 className="verify-error__title">Verification Error</h3>
                <p className="verify-error__message">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Sample Info */}
        <SampleInfo sample={perturbationData} />

        {/* Stats Row */}
        <div className="verify-stats">
          <AgreementMatrix results={results} />
          <CriteriaHeatmap results={results} />
        </div>

        {/* Verifier Cards Grid */}
        <div className="verify-results-header">
          <Clock className="w-4 h-4 verify-results-header__icon" />
          <h2 className="verify-results-header__title">
            Verifier Results ({results.length})
          </h2>
        </div>
        
        <div className="verify-cards-grid">
          {results.map((result, i) => (
            <VerifierCard 
              key={`${result.verification_model}-${i}`} 
              result={result}
              index={i}
              isStreaming={isStreaming && i === results.length - 1}
            />
          ))}
          
          {/* Placeholder cards while streaming */}
          {isStreaming && (
            <div className="verify-card verify-card--placeholder">
              <div className="verify-card__placeholder-content">
                <Loader2 className="w-6 h-6 animate-spin" style={{ margin: '0 auto' }} />
                <span className="verify-card__placeholder-text">Awaiting next result...</span>
              </div>
            </div>
          )}
        </div>

        {/* Empty State */}
        {results.length === 0 && !isStreaming && !error && (
          <div className="verify-empty">
            <Users className="w-12 h-12 verify-empty__icon" />
            <h3 className="verify-empty__title">No verification results yet</h3>
            <p className="verify-empty__text">Click "Re-verify" to start verification.</p>
          </div>
        )}

        {/* Disagreement Alert */}
        {results.length > 1 && !isStreaming && (
          (() => {
            const verdicts = results.map(r => r.verification_response?.verification_result);
            const hasDisagreement = new Set(verdicts.filter(Boolean)).size > 1;
            
            if (!hasDisagreement) return null;
            
            return (
              <div className="verify-alert verify-alert--warning">
                <div className="verify-alert__content">
                  <AlertTriangle className="w-5 h-5 verify-alert__icon" />
                  <div>
                    <h3 className="verify-alert__title">Verifier Disagreement Detected</h3>
                    <p className="verify-alert__message">
                      The verifiers have reached different conclusions about this perturbation.
                      Review individual assessments to understand the points of disagreement.
                    </p>
                  </div>
                </div>
              </div>
            );
          })()
        )}

        {/* Auto-save status indicator */}
        {autoSaveStatus !== 'idle' && (
          <div className={`satisfaction-prompt ${autoSaveStatus === 'saved' ? 'satisfaction-prompt--success' : ''}`}>
            <div className="satisfaction-prompt__content">
              {autoSaveStatus === 'saving' && (
                <p className="satisfaction-prompt__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving results to the database...
                </p>
              )}
              {autoSaveStatus === 'saved' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Database className="w-5 h-5" />
                    <h3 className="satisfaction-prompt__title">Results saved</h3>
                  </div>
                  <p className="satisfaction-prompt__subtitle">
                    Perturbation and verification data have been automatically saved to the database.
                  </p>
                </>
              )}
              {autoSaveStatus === 'error' && (
                <div className="satisfaction-prompt__error">
                  <XCircle className="w-4 h-4" />
                  <span>Auto-save failed. Results are still visible above.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inference Lab CTA - shown after verification completes */}
        {!isStreaming && results.length > 0 && onInferenceLab && (
          <div className="verify-evaluate-prompt">
            <div className="verify-evaluate-prompt__content">
              <h3 className="verify-evaluate-prompt__title">Ready to evaluate?</h3>
              <p className="verify-evaluate-prompt__text">
                Compare how two models respond to this perturbation in the Inference Lab
              </p>
            </div>
            <button onClick={onInferenceLab} className="verify-evaluate-btn">
              Inference Lab
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
