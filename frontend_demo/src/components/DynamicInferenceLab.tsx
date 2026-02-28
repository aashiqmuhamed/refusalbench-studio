import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Loader2, ShieldAlert, RefreshCw, Layers, Send,
  PenTool, Save, Check, AlertCircle, CheckCircle2, Play, ArrowLeft,
} from 'lucide-react';
import {
  DynamicInferenceRequest,
  DynamicInferenceResponse,
  TraceStep,
  WorkflowPreset,
} from '@/types';
import { apiUrl } from '@/api';

// ── Props ────────────────────────────────────────────────────────────
interface DynamicInferenceLabProps {
  initialQuery?: string;
  initialContext?: string;
  expectedModelOutput?: string;
  onBack?: () => void;
}

// ── RefusalBench prompt template ────────────────────────────────────
const REFUSALBENCH_PROMPT_TEMPLATE = `You are an advanced AI assistant designed to answer questions based **only** on the provided context passages. You must not use any external knowledge or prior training. Your goal is to be precise, factual, and aware of the limitations of the provided information.

Read the following Query and Context Passages carefully.

QUERY:
{query}

CONTEXT PASSAGES:
{context}

**INSTRUCTIONS:**
1.  Your primary task is to answer the QUERY if, and only if, a complete and faithful answer can be derived *solely* from the facts within the CONTEXT PASSAGES.
2.  You are permitted and expected to perform reasoning, including common-sense inference and basic mathematics, as long as it operates *exclusively* on the information provided in the context.
3.  If a direct and faithful answer is not possible due to one of the issues below, you MUST respond with **only** the corresponding refusal code. Do not add any other text or explanation.

**REFUSAL CODES:**

*   **REFUSE_AMBIGUOUS_QUERY** — When the query or context creates multiple plausible interpretations, making a single definitive answer impossible.
*   **REFUSE_CONTRADICTORY_CONTEXT** — When the context contains directly contradictory or logically inconsistent information that is essential for answering the query.
*   **REFUSE_INFO_MISSING_IN_CONTEXT** — When the context is silent on the matter. The specific fact, entity, or value needed to answer is entirely absent.
*   **REFUSE_FALSE_PREMISE_IN_QUERY** — When the query assumes a fact that is contradicted by or unsupported by the context.
*   **REFUSE_GRANULARITY_MISMATCH** — When the context contains relevant information, but at the wrong scale or level of abstraction.
*   **REFUSE_NONFACTUAL_QUERY** — When the query asks for subjective opinions, predictions, hypotheticals, or moral judgments that cannot be objectively derived from the provided facts.
*   **REFUSE_OTHER** — For any other specific issue not covered above that makes a faithful answer impossible.

Provide your response below:
ANSWER:`;

const CUSTOM_PROMPT_ID = 'custom_prompt';

const PRESETS: WorkflowPreset[] = [
  {
    id: 'refusalbench_baseline',
    label: 'RefusalBench Baseline',
    description:
      'Call the model with the following EXACT prompt template (substitute {query} and {context} with the actual perturbed query and context):\n\n' +
      '---BEGIN PROMPT TEMPLATE---\n' +
      REFUSALBENCH_PROMPT_TEMPLATE +
      '\n---END PROMPT TEMPLATE---\n\n' +
      'Return the model\'s raw response as the final output. ' +
      'If the response contains any REFUSE_* code (REFUSE_AMBIGUOUS_QUERY, REFUSE_CONTRADICTORY_CONTEXT, ' +
      'REFUSE_INFO_MISSING_IN_CONTEXT, REFUSE_FALSE_PREMISE_IN_QUERY, REFUSE_GRANULARITY_MISMATCH, ' +
      'REFUSE_NONFACTUAL_QUERY, or REFUSE_OTHER), mark the decision as "refuse". ' +
      'Otherwise mark it as "answer".',
  },
  {
    id: CUSTOM_PROMPT_ID,
    label: 'Custom Prompt',
    description: '',
  },
  {
    id: 'self_correction',
    label: 'Self-Correction',
    description: `First, draft an answer to the question using the provided context.
Then, ask the model whether the draft answer is explicitly supported by the context (answer YES or NO).
If YES, check if the draft actually answers the question directly OR if it instead explains why the question cannot be answered (e.g., points out false premises, contradictions, missing information, or ambiguity).
- If the draft directly answers the question without hedging or explaining problems, return it as the final answer (decision: answer).
- If the draft explains why the question is problematic, contains false premises, has contradictions, or cannot be answered, refuse (decision: refuse).
- If the draft contains refusal language (e.g., 'cannot determine', 'insufficient information', 'not clear', 'unable to answer'), refuse (decision: refuse).
If NO, refuse (decision: refuse).`,
  },
  {
    id: 'consistency',
    label: 'Consistency Checker',
    description:
      'Generate 3 independent answers to the question at temperature 0.7. ' +
      'Compare each pair of answers for similarity using compare_texts. ' +
      'If all pairs have a combined similarity score >= 0.7, the answers are ' +
      'consistent — return the first one. If any pair disagrees (score < 0.7), ' +
      'the model is uncertain — refuse.',
  },
];

function buildCustomPromptWorkflow(promptTemplate: string): string {
  return (
    'Call the model with the following EXACT prompt template (substitute {query} and {context} ' +
    'with the actual perturbed query and context):\n\n' +
    '---BEGIN PROMPT TEMPLATE---\n' +
    promptTemplate +
    '\n---END PROMPT TEMPLATE---\n\n' +
    'Return the model\'s raw response as the final output. ' +
    'If the model refuses, says it cannot answer, or outputs a refusal code, ' +
    'mark the decision as "refuse". Otherwise mark it as "answer".'
  );
}

// ── Helpers ─────────────────────────────────────────────────────────
const STEP_ICONS: Record<string, string> = {
  call_model: '\u{1F916}', compare_texts: '\u{1F50D}', extract_quotes: '\u{1F4C4}',
  decision: '\u2696\uFE0F', reasoning: '\u{1F4AD}', error: '\u274C',
};
const STEP_LABELS: Record<string, string> = {
  call_model: 'Model Call', compare_texts: 'Text Comparison',
  extract_quotes: 'Quote Extraction', decision: 'Final Decision',
  reasoning: 'Orchestrator Reasoning', error: 'Error',
};
function stepLabel(step: string) { return STEP_LABELS[step] ?? step.replace(/_/g, ' '); }
function stepIcon(step: string) { return STEP_ICONS[step] ?? '\u{1F527}'; }

function tryParseJson(text: string): object | null {
  try { const p = JSON.parse(text); if (typeof p === 'object' && p !== null) return p; } catch { /* */ }
  return null;
}
function renderTraceOutput(step: TraceStep): string {
  if (step.output) { const p = tryParseJson(step.output); return p ? JSON.stringify(p, null, 2) : step.output; }
  if (step.outputs?.length) return step.outputs.map((o, i) => `Sample ${i + 1}: ${o}`).join('\n\n');
  return '';
}

// ── Component ───────────────────────────────────────────────────────
export default function DynamicInferenceLab({ initialQuery, initialContext, expectedModelOutput, onBack }: DynamicInferenceLabProps) {
  const [queryText, setQueryText] = useState(initialQuery ?? '');
  const [contextText, setContextText] = useState(initialContext ?? '');
  const [workflowDesc, setWorkflowDesc] = useState('');
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [customPromptError, setCustomPromptError] = useState('');
  const [queryError, setQueryError] = useState('');
  const [contextError, setContextError] = useState('');
  const [workflowError, setWorkflowError] = useState('');

  const [result, setResult] = useState<DynamicInferenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const [executionModelName, setExecutionModelName] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl('/config'))
      .then(r => r.json())
      .then(data => {
        setExecutionModelName(data?.execution_model?.display_name ?? null);
      })
      .catch(() => {});
  }, []);

  const isCustomPromptMode = activePreset === CUSTOM_PROMPT_ID;

  const promptPreview = useMemo(() => {
    const q = queryText.trim();
    const c = contextText.trim();
    if (!q && !c) return 'Paste perturbed query and context to preview the prompt.';
    return `QUESTION:\n${q}\n\nCONTEXT:\n${c}`;
  }, [queryText, contextText]);

  const handlePreset = (preset: WorkflowPreset) => {
    setActivePreset(preset.id);
    setWorkflowError('');
    setCustomPromptError('');
    if (preset.id === CUSTOM_PROMPT_ID) {
      setWorkflowDesc('');
    } else {
      setWorkflowDesc(preset.description);
      setCustomPrompt('');
    }
  };

  const validate = () => {
    let valid = true;
    if (!queryText.trim()) { setQueryError('Perturbed query is required.'); valid = false; } else { setQueryError(''); }
    if (!contextText.trim()) { setContextError('Perturbed context is required.'); valid = false; } else { setContextError(''); }
    if (isCustomPromptMode) {
      if (!customPrompt.trim()) { setCustomPromptError('Custom prompt template is required.'); valid = false; } else { setCustomPromptError(''); }
      setWorkflowError('');
    } else {
      if (!workflowDesc.trim()) { setWorkflowError('Workflow description is required.'); valid = false; } else { setWorkflowError(''); }
      setCustomPromptError('');
    }
    return valid;
  };

  const buildWorkflow = (): string => {
    return isCustomPromptMode ? buildCustomPromptWorkflow(customPrompt.trim()) : workflowDesc.trim();
  };

  const runModel = useCallback(async () => {
    if (!validate()) return;
    const workflow = buildWorkflow();

    setLoading(true);
    setError(null);
    setResult(null);
    setSaveStatus('idle');

    const payload: DynamicInferenceRequest = {
      perturbed_query: queryText.trim(),
      perturbed_context: contextText.trim(),
      workflow_description: workflow,
      ...(expectedModelOutput && { reference_answer: expectedModelOutput }),
      ...(activePreset && { workflow_id: activePreset }),
    };

    try {
      const response = await fetch(apiUrl('/inference_lab'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const msg = await response.text();
        throw new Error(msg || `Inference failed: ${response.status}`);
      }
      const data = (await response.json()) as DynamicInferenceResponse;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [queryText, contextText, workflowDesc, customPrompt, isCustomPromptMode, expectedModelOutput, activePreset]);

  const saveChoice = async () => {
    if (!result) return;
    setSaving(true);
    setSaveStatus('idle');

    try {
      const response = await fetch(apiUrl('/inference_lab_choice'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchestrator_model_id: result.orchestrator_model_id,
          execution_model_id: result.execution_model_id,
          workflow: result.workflow,
          final_output: result.final_output,
          final_decision: result.final_decision,
          trace: result.trace,
        }),
      });
      if (!response.ok) throw new Error(await response.text() || 'Save failed');
      setSaveStatus('success');
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="eval-page">
      <div className="eval-container">
        {/* Header */}
        <div className="eval-header">
          <div>
            {onBack && (
              <div style={{ marginBottom: '0.5rem' }}>
                <button onClick={onBack} className="ustudy-back-btn">
                  <ArrowLeft className="w-4 h-4" />
                  Back to Verification
                </button>
              </div>
            )}
            <h1 className="eval-header__title">RefusalBenchStudio - Inference Lab</h1>
            <p className="eval-header__subtitle">
              Describe a workflow and test it on{' '}
              <strong>{executionModelName ?? 'the execution model'}</strong>.
            </p>
          </div>
        </div>

        <div className="lab-grid">
          {/* Left panel: Inputs */}
          <div className="panel">
            <div className="panel__header">
              <div>
                <h2 className="panel__title">Inputs</h2>
                <p className="panel__subtitle">The query and context are prefilled—just enter your workflow description.</p>
              </div>
            </div>

            <div className="form">
              <div className="form__field">
                <label className="form__label">Perturbed Query</label>
                <textarea
                  className={`form__textarea ${queryError ? 'form__textarea--error' : ''}`}
                  rows={4}
                  value={queryText}
                  onChange={e => setQueryText(e.target.value)}
                  placeholder="Paste the perturbed query text..."
                />
                {queryError && <span className="form__error">{queryError}</span>}
              </div>

              <div className="form__field">
                <label className="form__label">Perturbed Context</label>
                <textarea
                  className={`form__textarea ${contextError ? 'form__textarea--error' : ''}`}
                  rows={6}
                  value={contextText}
                  onChange={e => setContextText(e.target.value)}
                  placeholder="Paste the perturbed context text..."
                />
                {contextError && <span className="form__error">{contextError}</span>}
              </div>

              <div className="presets">
                <span className="presets__label">Presets:</span>
                <div className="presets__buttons">
                  {PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      className={`preset-btn ${activePreset === preset.id ? 'preset-btn--active' : ''}`}
                      onClick={() => handlePreset(preset)}
                      title={preset.id === CUSTOM_PROMPT_ID ? 'Write your own prompt template' : preset.description.slice(0, 120)}
                    >
                      {preset.id === 'refusalbench_baseline' && <Send className="w-3.5 h-3.5" />}
                      {preset.id === CUSTOM_PROMPT_ID && <PenTool className="w-3.5 h-3.5" />}
                      {preset.id === 'self_correction' && <RefreshCw className="w-3.5 h-3.5" />}
                      {preset.id === 'consistency' && <Layers className="w-3.5 h-3.5" />}
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {isCustomPromptMode && (
                <div className="form__field">
                  <label className="form__label">Custom Prompt Template</label>
                  <p className="form__hint">
                    Use {'{{query}}'} and {'{{context}}'} as placeholders.
                  </p>
                  <textarea
                    className={`form__textarea form__textarea--tall ${customPromptError ? 'form__textarea--error' : ''}`}
                    rows={10}
                    value={customPrompt}
                    onChange={e => { setCustomPrompt(e.target.value); setCustomPromptError(''); }}
                    placeholder={'Example:\n\nAnswer the following question based ONLY on the context provided.\nIf the context does not contain enough information, say "I cannot answer."\n\nQuestion: {query}\n\nContext: {context}\n\nAnswer:'}
                  />
                  {customPromptError && <span className="form__error">{customPromptError}</span>}
                </div>
              )}

              {!isCustomPromptMode && (
                <div className="form__field">
                  <label className="form__label">Workflow Description</label>
                  <p className="form__hint">
                    Describe the evaluation loop in plain English, or pick a preset above.
                  </p>
                  <textarea
                    className={`form__textarea form__textarea--tall ${workflowError ? 'form__textarea--error' : ''}`}
                    rows={8}
                    value={workflowDesc}
                    onChange={e => { setWorkflowDesc(e.target.value); setActivePreset(null); setWorkflowError(''); }}
                    placeholder={'Example: "Generate 3 answers at temperature 0.7. Compare all pairs. If all pairs have similarity >= 0.7, return the first answer. Otherwise refuse."'}
                  />
                  {workflowError && <span className="form__error">{workflowError}</span>}
                </div>
              )}

              <button className="button button--primary" onClick={runModel} disabled={loading}>
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" style={{ display: 'inline', marginRight: 6 }} />Running...</>
                ) : (
                  <><Play className="w-4 h-4" style={{ display: 'inline', marginRight: 6 }} />Run Model</>
                )}
              </button>
            </div>
          </div>

          {/* Right panel: Execution Trace */}
          <div className="panel lab-chat-panel">
            <div className="panel__header">
              <div>
                <h2 className="panel__title">Execution Trace</h2>
                <p className="panel__subtitle">Step-by-step tool calls from the orchestrator.</p>
              </div>
            </div>

            {expectedModelOutput && (
              <div className={`expected-output-banner ${
                expectedModelOutput === 'ANSWER_CORRECTLY'
                  ? 'expected-output-banner--answer'
                  : 'expected-output-banner--refuse'
              }`}>
                <span className="expected-output-banner__label">RefusalBench Expected Model Output</span>
                <span className="expected-output-banner__value">{expectedModelOutput}</span>
              </div>
            )}

            {error && (
              <div className="eval-error" style={{ margin: '0 16px 12px' }}>
                <div className="eval-error__content">
                  <ShieldAlert className="w-5 h-5 eval-error__icon" />
                  <div>
                    <h3 className="eval-error__title">Inference Error</h3>
                    <p className="eval-error__message">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="lab-chat">
              <div className="lab-chat__message lab-chat__message--user">
                <div className="lab-chat__label">User Prompt</div>
                <pre className="lab-chat__bubble">{promptPreview}</pre>
              </div>

              {result && (
                <div className="lab-chat__message lab-chat__message--user">
                  <div className="lab-chat__label">Workflow Description</div>
                  <pre className="lab-chat__bubble lab-chat__bubble--workflow">{workflowDesc}</pre>
                </div>
              )}

              {result?.trace.map((step, index) => (
                <div
                  key={`${step.step}-${index}`}
                  className={`lab-chat__message ${
                    step.step === 'decision' ? 'lab-chat__message--decision'
                    : step.step === 'error' ? 'lab-chat__message--error'
                    : 'lab-chat__message--assistant'
                  }`}
                >
                  <div className="lab-chat__label">
                    <span className="lab-chat__step-icon">{stepIcon(step.step)}</span>
                    {stepLabel(step.step)}
                    {step.temperature !== undefined && (
                      <span className="lab-chat__temp">temp={step.temperature}</span>
                    )}
                  </div>
                  {step.prompt && (
                    <details className="lab-chat__prompt-details">
                      <summary className="lab-chat__prompt-summary">View prompt sent</summary>
                      <pre className="lab-chat__bubble lab-chat__bubble--prompt">{step.prompt}</pre>
                    </details>
                  )}
                  <pre className="lab-chat__bubble">{renderTraceOutput(step)}</pre>
                </div>
              ))}

              {!result && !loading && (
                <div className="panel__empty">
                  Select a preset and click "Run Model" to begin.
                </div>
              )}

              {loading && !result && (
                <div className="panel__empty">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ display: 'inline', marginRight: 8 }} />
                  Orchestrator running...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Run Summary */}
        {result && (
          <div className="panel lab-summary">
            <div className="panel__header">
              <div>
                <h2 className="panel__title">Run Summary — Execution Model: {result.execution_display_name}</h2>
                <p className="panel__subtitle">
                  Orchestrator: {result.orchestrator_display_name} &middot;
                  Execution: {result.execution_display_name} &middot;
                  {result.trace.length} steps
                </p>
              </div>
            </div>
            <div className={`lab-decision lab-decision--${result.final_decision}`}>
              <span className="lab-decision__label">{result.final_decision.toUpperCase()}</span>
              <span className="lab-decision__text">{result.final_output}</span>
            </div>
            {expectedModelOutput && (
              <div className="lab-expected-comparison">
                <div className="lab-expected-comparison__row">
                  <span className="lab-expected-comparison__label">Expected:</span>
                  <span className={`lab-expected-comparison__value ${
                    expectedModelOutput === 'ANSWER_CORRECTLY'
                      ? 'lab-expected-comparison__value--answer'
                      : 'lab-expected-comparison__value--refuse'
                  }`}>{expectedModelOutput}</span>
                </div>
                <div className="lab-expected-comparison__row">
                  <span className="lab-expected-comparison__label">Actual:</span>
                  <span className={`lab-expected-comparison__value ${
                    result.final_decision === 'answer'
                      ? 'lab-expected-comparison__value--answer'
                      : 'lab-expected-comparison__value--refuse'
                  }`}>{result.final_decision.toUpperCase()}</span>
                </div>
              </div>
            )}
            {result.reference_answer != null && (
              <div className="lab-ref-check">
                <div className="lab-ref-check__header">
                  {result.reference_answer_match
                    ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                    : <AlertCircle className="w-4 h-4" style={{ color: 'var(--color-error)' }} />}
                  <span className={`lab-ref-check__verdict ${
                    result.reference_answer_match
                      ? 'lab-ref-check__verdict--pass'
                      : 'lab-ref-check__verdict--fail'
                  }`}>
                    {result.reference_answer_match ? 'Reference Answer Match' : 'Reference Answer Mismatch'}
                  </span>
                </div>
                <div className="lab-ref-check__details">
                  <div className="lab-ref-check__row">
                    <span className="lab-ref-check__label">Reference:</span>
                    <span className="lab-ref-check__value">{result.reference_answer}</span>
                  </div>
                  {result.model_raw_output != null && (
                    <div className="lab-ref-check__row">
                      <span className="lab-ref-check__label">Model Output:</span>
                      <span className="lab-ref-check__value lab-ref-check__value--mono">
                        {result.model_raw_output.length > 200
                          ? result.model_raw_output.slice(0, 200) + '...'
                          : result.model_raw_output}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <button
              className="button button--primary"
              onClick={saveChoice}
              disabled={saving || saveStatus === 'success'}
              style={{ marginTop: 16 }}
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" style={{ display: 'inline', marginRight: 6 }} />Saving...</>
              ) : saveStatus === 'success' ? (
                <><Check className="w-4 h-4" style={{ display: 'inline', marginRight: 6 }} />Saved</>
              ) : (
                <><Save className="w-4 h-4" style={{ display: 'inline', marginRight: 6 }} />Save Eval</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
