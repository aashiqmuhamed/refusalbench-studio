import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Loader2, ShieldAlert, RefreshCw, Layers, Send, PenTool, Save, Check, AlertCircle, CheckCircle2, Play, ArrowLeft, } from 'lucide-react';
import { apiUrl } from '@/api';
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
const PRESETS = [
    {
        id: 'refusalbench_baseline',
        label: 'RefusalBench Baseline',
        description: 'Call the model with the following EXACT prompt template (substitute {query} and {context} with the actual perturbed query and context):\n\n' +
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
        description: 'Generate 3 independent answers to the question at temperature 0.7. ' +
            'Compare each pair of answers for similarity using compare_texts. ' +
            'If all pairs have a combined similarity score >= 0.7, the answers are ' +
            'consistent — return the first one. If any pair disagrees (score < 0.7), ' +
            'the model is uncertain — refuse.',
    },
];
function buildCustomPromptWorkflow(promptTemplate) {
    return ('Call the model with the following EXACT prompt template (substitute {query} and {context} ' +
        'with the actual perturbed query and context):\n\n' +
        '---BEGIN PROMPT TEMPLATE---\n' +
        promptTemplate +
        '\n---END PROMPT TEMPLATE---\n\n' +
        'Return the model\'s raw response as the final output. ' +
        'If the model refuses, says it cannot answer, or outputs a refusal code, ' +
        'mark the decision as "refuse". Otherwise mark it as "answer".');
}
// ── Helpers ─────────────────────────────────────────────────────────
const STEP_ICONS = {
    call_model: '\u{1F916}', compare_texts: '\u{1F50D}', extract_quotes: '\u{1F4C4}',
    decision: '\u2696\uFE0F', reasoning: '\u{1F4AD}', error: '\u274C',
};
const STEP_LABELS = {
    call_model: 'Model Call', compare_texts: 'Text Comparison',
    extract_quotes: 'Quote Extraction', decision: 'Final Decision',
    reasoning: 'Orchestrator Reasoning', error: 'Error',
};
function stepLabel(step) { return STEP_LABELS[step] ?? step.replace(/_/g, ' '); }
function stepIcon(step) { return STEP_ICONS[step] ?? '\u{1F527}'; }
function tryParseJson(text) {
    try {
        const p = JSON.parse(text);
        if (typeof p === 'object' && p !== null)
            return p;
    }
    catch { /* */ }
    return null;
}
function renderTraceOutput(step) {
    if (step.output) {
        const p = tryParseJson(step.output);
        return p ? JSON.stringify(p, null, 2) : step.output;
    }
    if (step.outputs?.length)
        return step.outputs.map((o, i) => `Sample ${i + 1}: ${o}`).join('\n\n');
    return '';
}
// ── Component ───────────────────────────────────────────────────────
export default function DynamicInferenceLab({ initialQuery, initialContext, expectedModelOutput, onBack }) {
    const [queryText, setQueryText] = useState(initialQuery ?? '');
    const [contextText, setContextText] = useState(initialContext ?? '');
    const [workflowDesc, setWorkflowDesc] = useState('');
    const [activePreset, setActivePreset] = useState(null);
    const [customPrompt, setCustomPrompt] = useState('');
    const [customPromptError, setCustomPromptError] = useState('');
    const [queryError, setQueryError] = useState('');
    const [contextError, setContextError] = useState('');
    const [workflowError, setWorkflowError] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState('idle');
    const [executionModelName, setExecutionModelName] = useState(null);
    useEffect(() => {
        fetch(apiUrl('/config'))
            .then(r => r.json())
            .then(data => {
            setExecutionModelName(data?.execution_model?.display_name ?? null);
        })
            .catch(() => { });
    }, []);
    const isCustomPromptMode = activePreset === CUSTOM_PROMPT_ID;
    const promptPreview = useMemo(() => {
        const q = queryText.trim();
        const c = contextText.trim();
        if (!q && !c)
            return 'Paste perturbed query and context to preview the prompt.';
        return `QUESTION:\n${q}\n\nCONTEXT:\n${c}`;
    }, [queryText, contextText]);
    const handlePreset = (preset) => {
        setActivePreset(preset.id);
        setWorkflowError('');
        setCustomPromptError('');
        if (preset.id === CUSTOM_PROMPT_ID) {
            setWorkflowDesc('');
        }
        else {
            setWorkflowDesc(preset.description);
            setCustomPrompt('');
        }
    };
    const validate = () => {
        let valid = true;
        if (!queryText.trim()) {
            setQueryError('Perturbed query is required.');
            valid = false;
        }
        else {
            setQueryError('');
        }
        if (!contextText.trim()) {
            setContextError('Perturbed context is required.');
            valid = false;
        }
        else {
            setContextError('');
        }
        if (isCustomPromptMode) {
            if (!customPrompt.trim()) {
                setCustomPromptError('Custom prompt template is required.');
                valid = false;
            }
            else {
                setCustomPromptError('');
            }
            setWorkflowError('');
        }
        else {
            if (!workflowDesc.trim()) {
                setWorkflowError('Workflow description is required.');
                valid = false;
            }
            else {
                setWorkflowError('');
            }
            setCustomPromptError('');
        }
        return valid;
    };
    const buildWorkflow = () => {
        return isCustomPromptMode ? buildCustomPromptWorkflow(customPrompt.trim()) : workflowDesc.trim();
    };
    const runModel = useCallback(async () => {
        if (!validate())
            return;
        const workflow = buildWorkflow();
        setLoading(true);
        setError(null);
        setResult(null);
        setSaveStatus('idle');
        const payload = {
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
            const data = (await response.json());
            setResult(data);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        }
        finally {
            setLoading(false);
        }
    }, [queryText, contextText, workflowDesc, customPrompt, isCustomPromptMode, expectedModelOutput, activePreset]);
    const saveChoice = async () => {
        if (!result)
            return;
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
            if (!response.ok)
                throw new Error(await response.text() || 'Save failed');
            setSaveStatus('success');
        }
        catch {
            setSaveStatus('error');
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsx("div", { className: "eval-page", children: _jsxs("div", { className: "eval-container", children: [_jsx("div", { className: "eval-header", children: _jsxs("div", { children: [onBack && (_jsx("div", { style: { marginBottom: '0.5rem' }, children: _jsxs("button", { onClick: onBack, className: "ustudy-back-btn", children: [_jsx(ArrowLeft, { className: "w-4 h-4" }), "Back to Verification"] }) })), _jsx("h1", { className: "eval-header__title", children: "RefusalBenchStudio - Inference Lab" }), _jsxs("p", { className: "eval-header__subtitle", children: ["Describe a workflow and test it on", ' ', _jsx("strong", { children: executionModelName ?? 'the execution model' }), "."] })] }) }), _jsxs("div", { className: "lab-grid", children: [_jsxs("div", { className: "panel", children: [_jsx("div", { className: "panel__header", children: _jsxs("div", { children: [_jsx("h2", { className: "panel__title", children: "Inputs" }), _jsx("p", { className: "panel__subtitle", children: "The query and context are prefilled\u2014just enter your workflow description." })] }) }), _jsxs("div", { className: "form", children: [_jsxs("div", { className: "form__field", children: [_jsx("label", { className: "form__label", children: "Perturbed Query" }), _jsx("textarea", { className: `form__textarea ${queryError ? 'form__textarea--error' : ''}`, rows: 4, value: queryText, onChange: e => setQueryText(e.target.value), placeholder: "Paste the perturbed query text..." }), queryError && _jsx("span", { className: "form__error", children: queryError })] }), _jsxs("div", { className: "form__field", children: [_jsx("label", { className: "form__label", children: "Perturbed Context" }), _jsx("textarea", { className: `form__textarea ${contextError ? 'form__textarea--error' : ''}`, rows: 6, value: contextText, onChange: e => setContextText(e.target.value), placeholder: "Paste the perturbed context text..." }), contextError && _jsx("span", { className: "form__error", children: contextError })] }), _jsxs("div", { className: "presets", children: [_jsx("span", { className: "presets__label", children: "Presets:" }), _jsx("div", { className: "presets__buttons", children: PRESETS.map(preset => (_jsxs("button", { className: `preset-btn ${activePreset === preset.id ? 'preset-btn--active' : ''}`, onClick: () => handlePreset(preset), title: preset.id === CUSTOM_PROMPT_ID ? 'Write your own prompt template' : preset.description.slice(0, 120), children: [preset.id === 'refusalbench_baseline' && _jsx(Send, { className: "w-3.5 h-3.5" }), preset.id === CUSTOM_PROMPT_ID && _jsx(PenTool, { className: "w-3.5 h-3.5" }), preset.id === 'self_correction' && _jsx(RefreshCw, { className: "w-3.5 h-3.5" }), preset.id === 'consistency' && _jsx(Layers, { className: "w-3.5 h-3.5" }), preset.label] }, preset.id))) })] }), isCustomPromptMode && (_jsxs("div", { className: "form__field", children: [_jsx("label", { className: "form__label", children: "Custom Prompt Template" }), _jsxs("p", { className: "form__hint", children: ["Use ", '{{query}}', " and ", '{{context}}', " as placeholders."] }), _jsx("textarea", { className: `form__textarea form__textarea--tall ${customPromptError ? 'form__textarea--error' : ''}`, rows: 10, value: customPrompt, onChange: e => { setCustomPrompt(e.target.value); setCustomPromptError(''); }, placeholder: 'Example:\n\nAnswer the following question based ONLY on the context provided.\nIf the context does not contain enough information, say "I cannot answer."\n\nQuestion: {query}\n\nContext: {context}\n\nAnswer:' }), customPromptError && _jsx("span", { className: "form__error", children: customPromptError })] })), !isCustomPromptMode && (_jsxs("div", { className: "form__field", children: [_jsx("label", { className: "form__label", children: "Workflow Description" }), _jsx("p", { className: "form__hint", children: "Describe the evaluation loop in plain English, or pick a preset above." }), _jsx("textarea", { className: `form__textarea form__textarea--tall ${workflowError ? 'form__textarea--error' : ''}`, rows: 8, value: workflowDesc, onChange: e => { setWorkflowDesc(e.target.value); setActivePreset(null); setWorkflowError(''); }, placeholder: 'Example: "Generate 3 answers at temperature 0.7. Compare all pairs. If all pairs have similarity >= 0.7, return the first answer. Otherwise refuse."' }), workflowError && _jsx("span", { className: "form__error", children: workflowError })] })), _jsx("button", { className: "button button--primary", onClick: runModel, disabled: loading, children: loading ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "w-4 h-4 animate-spin", style: { display: 'inline', marginRight: 6 } }), "Running..."] })) : (_jsxs(_Fragment, { children: [_jsx(Play, { className: "w-4 h-4", style: { display: 'inline', marginRight: 6 } }), "Run Model"] })) })] })] }), _jsxs("div", { className: "panel lab-chat-panel", children: [_jsx("div", { className: "panel__header", children: _jsxs("div", { children: [_jsx("h2", { className: "panel__title", children: "Execution Trace" }), _jsx("p", { className: "panel__subtitle", children: "Step-by-step tool calls from the orchestrator." })] }) }), expectedModelOutput && (_jsxs("div", { className: `expected-output-banner ${expectedModelOutput === 'ANSWER_CORRECTLY'
                                        ? 'expected-output-banner--answer'
                                        : 'expected-output-banner--refuse'}`, children: [_jsx("span", { className: "expected-output-banner__label", children: "RefusalBench Expected Model Output" }), _jsx("span", { className: "expected-output-banner__value", children: expectedModelOutput })] })), error && (_jsx("div", { className: "eval-error", style: { margin: '0 16px 12px' }, children: _jsxs("div", { className: "eval-error__content", children: [_jsx(ShieldAlert, { className: "w-5 h-5 eval-error__icon" }), _jsxs("div", { children: [_jsx("h3", { className: "eval-error__title", children: "Inference Error" }), _jsx("p", { className: "eval-error__message", children: error })] })] }) })), _jsxs("div", { className: "lab-chat", children: [_jsxs("div", { className: "lab-chat__message lab-chat__message--user", children: [_jsx("div", { className: "lab-chat__label", children: "User Prompt" }), _jsx("pre", { className: "lab-chat__bubble", children: promptPreview })] }), result && (_jsxs("div", { className: "lab-chat__message lab-chat__message--user", children: [_jsx("div", { className: "lab-chat__label", children: "Workflow Description" }), _jsx("pre", { className: "lab-chat__bubble lab-chat__bubble--workflow", children: workflowDesc })] })), result?.trace.map((step, index) => (_jsxs("div", { className: `lab-chat__message ${step.step === 'decision' ? 'lab-chat__message--decision'
                                                : step.step === 'error' ? 'lab-chat__message--error'
                                                    : 'lab-chat__message--assistant'}`, children: [_jsxs("div", { className: "lab-chat__label", children: [_jsx("span", { className: "lab-chat__step-icon", children: stepIcon(step.step) }), stepLabel(step.step), step.temperature !== undefined && (_jsxs("span", { className: "lab-chat__temp", children: ["temp=", step.temperature] }))] }), step.prompt && (_jsxs("details", { className: "lab-chat__prompt-details", children: [_jsx("summary", { className: "lab-chat__prompt-summary", children: "View prompt sent" }), _jsx("pre", { className: "lab-chat__bubble lab-chat__bubble--prompt", children: step.prompt })] })), _jsx("pre", { className: "lab-chat__bubble", children: renderTraceOutput(step) })] }, `${step.step}-${index}`))), !result && !loading && (_jsx("div", { className: "panel__empty", children: "Select a preset and click \"Run Model\" to begin." })), loading && !result && (_jsxs("div", { className: "panel__empty", children: [_jsx(Loader2, { className: "w-5 h-5 animate-spin", style: { display: 'inline', marginRight: 8 } }), "Orchestrator running..."] }))] })] })] }), result && (_jsxs("div", { className: "panel lab-summary", children: [_jsx("div", { className: "panel__header", children: _jsxs("div", { children: [_jsxs("h2", { className: "panel__title", children: ["Run Summary \u2014 Execution Model: ", result.execution_display_name] }), _jsxs("p", { className: "panel__subtitle", children: ["Orchestrator: ", result.orchestrator_display_name, " \u00B7 Execution: ", result.execution_display_name, " \u00B7", result.trace.length, " steps"] })] }) }), _jsxs("div", { className: `lab-decision lab-decision--${result.final_decision}`, children: [_jsx("span", { className: "lab-decision__label", children: result.final_decision.toUpperCase() }), _jsx("span", { className: "lab-decision__text", children: result.final_output })] }), expectedModelOutput && (_jsxs("div", { className: "lab-expected-comparison", children: [_jsxs("div", { className: "lab-expected-comparison__row", children: [_jsx("span", { className: "lab-expected-comparison__label", children: "Expected:" }), _jsx("span", { className: `lab-expected-comparison__value ${expectedModelOutput === 'ANSWER_CORRECTLY'
                                                ? 'lab-expected-comparison__value--answer'
                                                : 'lab-expected-comparison__value--refuse'}`, children: expectedModelOutput })] }), _jsxs("div", { className: "lab-expected-comparison__row", children: [_jsx("span", { className: "lab-expected-comparison__label", children: "Actual:" }), _jsx("span", { className: `lab-expected-comparison__value ${result.final_decision === 'answer'
                                                ? 'lab-expected-comparison__value--answer'
                                                : 'lab-expected-comparison__value--refuse'}`, children: result.final_decision.toUpperCase() })] })] })), result.reference_answer != null && (_jsxs("div", { className: "lab-ref-check", children: [_jsxs("div", { className: "lab-ref-check__header", children: [result.reference_answer_match
                                            ? _jsx(CheckCircle2, { className: "w-4 h-4", style: { color: 'var(--color-success)' } })
                                            : _jsx(AlertCircle, { className: "w-4 h-4", style: { color: 'var(--color-error)' } }), _jsx("span", { className: `lab-ref-check__verdict ${result.reference_answer_match
                                                ? 'lab-ref-check__verdict--pass'
                                                : 'lab-ref-check__verdict--fail'}`, children: result.reference_answer_match ? 'Reference Answer Match' : 'Reference Answer Mismatch' })] }), _jsxs("div", { className: "lab-ref-check__details", children: [_jsxs("div", { className: "lab-ref-check__row", children: [_jsx("span", { className: "lab-ref-check__label", children: "Reference:" }), _jsx("span", { className: "lab-ref-check__value", children: result.reference_answer })] }), result.model_raw_output != null && (_jsxs("div", { className: "lab-ref-check__row", children: [_jsx("span", { className: "lab-ref-check__label", children: "Model Output:" }), _jsx("span", { className: "lab-ref-check__value lab-ref-check__value--mono", children: result.model_raw_output.length > 200
                                                        ? result.model_raw_output.slice(0, 200) + '...'
                                                        : result.model_raw_output })] }))] })] })), _jsx("button", { className: "button button--primary", onClick: saveChoice, disabled: saving || saveStatus === 'success', style: { marginTop: 16 }, children: saving ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "w-4 h-4 animate-spin", style: { display: 'inline', marginRight: 6 } }), "Saving..."] })) : saveStatus === 'success' ? (_jsxs(_Fragment, { children: [_jsx(Check, { className: "w-4 h-4", style: { display: 'inline', marginRight: 6 } }), "Saved"] })) : (_jsxs(_Fragment, { children: [_jsx(Save, { className: "w-4 h-4", style: { display: 'inline', marginRight: 6 } }), "Save Eval"] })) })] }))] }) }));
}
