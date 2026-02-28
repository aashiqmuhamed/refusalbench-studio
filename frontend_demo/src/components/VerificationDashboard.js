import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp, Loader2, Users, BarChart3, Clock, RefreshCw, ArrowLeft, ArrowRight, Code, X, Copy, Check, Database } from 'lucide-react';
import { apiUrl } from '@/api';
// ============================================
// CONFIGURATION - Color mapping for verifiers
// ============================================
const VERIFIER_COLORS = ['blue', 'purple', 'indigo', 'green', 'amber', 'gray'];
const getVerifierConfig = (result, index = 0) => {
    // Use display name from backend if available, otherwise fallback to model_name or model_id
    const displayName = result.verification_display_name ||
        result.verification_model_name ||
        result.verification_model.split('/').pop() ||
        result.verification_model;
    // Generate a short name from the display name
    const shortName = displayName.split(' ').map(word => word[0]).join('').slice(0, 4) ||
        displayName.slice(0, 4);
    // Assign color based on index to ensure variety
    const color = VERIFIER_COLORS[index % VERIFIER_COLORS.length];
    return {
        displayName,
        shortName,
        color
    };
};
// ============================================
// COMPONENTS
// ============================================
const StatusBadge = ({ status, isStreaming = false }) => {
    if (isStreaming) {
        return (_jsxs("span", { className: "verify-status-badge verify-status-badge--streaming", children: [_jsx(Loader2, { className: "w-3 h-3 animate-spin" }), " Streaming..."] }));
    }
    if (status === 'PASS') {
        return (_jsxs("span", { className: "verify-status-badge verify-status-badge--pass", children: [_jsx(CheckCircle, { className: "w-3.5 h-3.5" }), " PASS"] }));
    }
    if (status === 'FAIL') {
        return (_jsxs("span", { className: "verify-status-badge verify-status-badge--fail", children: [_jsx(XCircle, { className: "w-3.5 h-3.5" }), " FAIL"] }));
    }
    return (_jsxs("span", { className: "verify-status-badge verify-status-badge--pending", children: [_jsx(Loader2, { className: "w-3.5 h-3.5 animate-spin" }), " Pending"] }));
};
// JSON Modal Component
const JsonModal = ({ isOpen, onClose, data, title }) => {
    const [copied, setCopied] = useState(false);
    if (!isOpen)
        return null;
    const jsonString = JSON.stringify(data, null, 2);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(jsonString);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch (err) {
            console.error('Failed to copy:', err);
        }
    };
    return (_jsx("div", { className: "json-modal-overlay", onClick: onClose, children: _jsxs("div", { className: "json-modal", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "json-modal__header", children: [_jsxs("div", { className: "json-modal__title", children: [_jsx(Code, { className: "w-4 h-4" }), _jsx("span", { children: title })] }), _jsxs("div", { className: "json-modal__actions", children: [_jsxs("button", { onClick: handleCopy, className: "json-modal__copy-btn", title: "Copy to clipboard", children: [copied ? _jsx(Check, { className: "w-4 h-4" }) : _jsx(Copy, { className: "w-4 h-4" }), copied ? 'Copied!' : 'Copy'] }), _jsx("button", { onClick: onClose, className: "json-modal__close-btn", title: "Close", children: _jsx(X, { className: "w-5 h-5" }) })] })] }), _jsx("pre", { className: "json-modal__content", children: jsonString })] }) }));
};
const VerifierCard = ({ result, index = 0, isStreaming = false }) => {
    const [expanded, setExpanded] = useState(false);
    const [showJson, setShowJson] = useState(false);
    const config = getVerifierConfig(result, index);
    const v = result.verification_response;
    const isPending = !v || isStreaming;
    return (_jsxs("div", { className: `verify-card verify-card--${config.color}`, children: [_jsxs("div", { className: "verify-card__header", children: [_jsxs("div", { className: "verify-card__info", children: [_jsx("div", { className: `verify-card__dot verify-card__dot--${config.color} ${isPending ? 'verify-card__dot--pending' : ''}` }), _jsxs("div", { children: [_jsx("h3", { className: "verify-card__name", children: config.displayName }), _jsx("p", { className: "verify-card__model-id", children: result.verification_model })] })] }), _jsx(StatusBadge, { status: v?.verification_result, isStreaming: isPending })] }), v && (_jsxs("div", { className: "verify-card__meta", children: [_jsxs("div", { className: "verify-card__meta-row", children: [_jsx("span", { className: "verify-card__meta-label", children: "Predicted RAG Behavior" }), _jsx("span", { className: `verify-card__behavior ${v.predicted_rag_behavior?.includes('REFUSE') ? 'verify-card__behavior--refuse' : 'verify-card__behavior--answer'}`, children: v.predicted_rag_behavior || '—' })] }), _jsxs("div", { className: "verify-card__meta-row", children: [_jsx("span", { className: "verify-card__meta-label", children: "Final Ground Truth Label" }), _jsx("span", { className: `verify-card__behavior ${v.final_ground_truth_label?.includes('REFUSE') ? 'verify-card__behavior--refuse' : 'verify-card__behavior--answer'}`, children: v.final_ground_truth_label || '—' })] }), _jsxs("div", { className: "verify-card__meta-row", children: [_jsx("span", { className: "verify-card__meta-label", children: "Actual Intensity Observed" }), _jsxs("div", { className: "verify-card__intensity-group", children: [_jsx("span", { className: `verify-card__intensity ${v.actual_intensity_observed === 'HIGH' ? 'verify-card__intensity--high' :
                                            v.actual_intensity_observed === 'MEDIUM' ? 'verify-card__intensity--medium' :
                                                'verify-card__intensity--low'}`, children: v.actual_intensity_observed || '—' }), v.actual_intensity_observed !== result.intensity && (_jsxs("span", { className: "verify-card__intensity-exp", children: ["(exp: ", result.intensity, ")"] }))] })] })] })), v && (v.refusal_reasoning_analysis || v.constraint_analysis) && (_jsxs("div", { className: "verify-card__analysis", children: [v.refusal_reasoning_analysis && (_jsxs("div", { className: "verify-card__analysis-section", children: [_jsx("span", { className: "verify-card__analysis-label", children: "Refusal Reasoning Analysis" }), _jsx("p", { className: "verify-card__analysis-text", children: v.refusal_reasoning_analysis })] })), v.constraint_analysis && (_jsxs("div", { className: "verify-card__analysis-section", children: [_jsx("span", { className: "verify-card__analysis-label", children: "Constraint Analysis" }), _jsx("p", { className: "verify-card__analysis-text", children: v.constraint_analysis })] }))] })), v?.identified_issues && v.identified_issues.length > 0 && (_jsxs("div", { children: [_jsxs("button", { onClick: () => setExpanded(!expanded), className: "verify-card__issues-btn", children: [_jsx(AlertTriangle, { className: "w-3.5 h-3.5" }), v.identified_issues.length, " issue", v.identified_issues.length > 1 ? 's' : '', expanded ? _jsx(ChevronUp, { className: "w-3 h-3" }) : _jsx(ChevronDown, { className: "w-3 h-3" })] }), expanded && (_jsx("ul", { className: "verify-card__issues-list", children: v.identified_issues.map((issue, i) => (_jsx("li", { className: "verify-card__issue", children: issue }, i))) }))] })), _jsxs("button", { onClick: () => setShowJson(true), className: "verify-card__json-btn", children: [_jsx(Code, { className: "w-3.5 h-3.5" }), "View JSON"] }), _jsx(JsonModal, { isOpen: showJson, onClose: () => setShowJson(false), data: result, title: `${config.displayName} - Verification Response` })] }));
};
const AgreementMatrix = ({ results }) => {
    const verdicts = results.map(r => r.verification_response?.verification_result);
    const passCount = verdicts.filter(v => v === 'PASS').length;
    const failCount = verdicts.filter(v => v === 'FAIL').length;
    const total = passCount + failCount;
    const agreementRate = total > 1
        ? Math.round(Math.max(passCount, failCount) / total * 100)
        : null;
    return (_jsxs("div", { className: "verify-stats-card", children: [_jsxs("div", { className: "verify-stats-card__header", children: [_jsx(Users, { className: "w-4 h-4 verify-stats-card__icon" }), _jsx("h3", { className: "verify-stats-card__title", children: "Verifier Agreement" })] }), _jsxs("div", { className: "verify-agreement__counts verify-agreement__counts--two", children: [_jsxs("div", { className: "verify-agreement__count verify-agreement__count--pass", children: [_jsx("div", { className: "verify-agreement__number verify-agreement__number--pass", children: passCount }), _jsx("div", { className: "verify-agreement__label verify-agreement__label--pass", children: "Pass" })] }), _jsxs("div", { className: "verify-agreement__count verify-agreement__count--fail", children: [_jsx("div", { className: "verify-agreement__number verify-agreement__number--fail", children: failCount }), _jsx("div", { className: "verify-agreement__label verify-agreement__label--fail", children: "Fail" })] })] }), agreementRate !== null && (_jsxs("div", { className: "verify-agreement__progress", children: [_jsx("div", { className: "verify-agreement__bar", children: _jsx("div", { className: `verify-agreement__fill ${agreementRate === 100 ? 'verify-agreement__fill--full' : 'verify-agreement__fill--partial'}`, style: { width: `${agreementRate}%` } }) }), _jsxs("span", { className: `verify-agreement__percent ${agreementRate === 100 ? 'verify-agreement__percent--full' : 'verify-agreement__percent--partial'}`, children: [agreementRate, "%"] })] })), _jsx("div", { className: "verify-agreement__verdicts", children: results.map((r, i) => {
                    const config = getVerifierConfig(r, i);
                    const verdict = r.verification_response?.verification_result;
                    return (_jsx("span", { className: `verify-verdict-badge ${verdict === 'PASS' ? 'verify-verdict-badge--pass' :
                            verdict === 'FAIL' ? 'verify-verdict-badge--fail' :
                                'verify-verdict-badge--pending'}`, title: config.displayName, children: config.shortName }, i));
                }) })] }));
};
const CriteriaHeatmap = ({ results }) => {
    const criteria = [
        { key: 'lever_correctly_implemented', label: 'Lever' },
        { key: 'intensity_correctly_achieved', label: 'Intensity' },
        { key: 'uncertainty_successfully_induced', label: 'Uncertainty' },
        { key: 'implementation_quality_sound', label: 'Quality' },
        { key: 'answer_constraint_satisfied', label: 'Constraint' },
        { key: 'ground_truth_alignment', label: 'GT Align' },
        { key: 'refusal_class_correct', label: 'Refusal' }
    ];
    return (_jsxs("div", { className: "verify-stats-card", children: [_jsxs("div", { className: "verify-stats-card__header", children: [_jsx(BarChart3, { className: "w-4 h-4 verify-stats-card__icon" }), _jsx("h3", { className: "verify-stats-card__title", children: "Criteria Heatmap" })] }), _jsx("div", { style: { overflowX: 'auto' }, children: _jsxs("table", { className: "verify-heatmap__table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "verify-heatmap__th verify-heatmap__th--left", children: "Verifier" }), criteria.map(c => (_jsx("th", { className: "verify-heatmap__th", children: c.label }, c.key)))] }) }), _jsx("tbody", { children: results.map((r, i) => {
                                const config = getVerifierConfig(r, i);
                                const v = r.verification_response;
                                return (_jsxs("tr", { children: [_jsx("td", { className: "verify-heatmap__td verify-heatmap__td--name", children: config.shortName }), criteria.map(c => (_jsx("td", { className: "verify-heatmap__td verify-heatmap__td--center", children: v?.[c.key] === undefined ? (_jsx("span", { className: "verify-heatmap__cell verify-heatmap__cell--pending" })) : (_jsx("span", { className: `verify-heatmap__cell ${v[c.key] ? 'verify-heatmap__cell--pass' : 'verify-heatmap__cell--fail'}` })) }, c.key)))] }, i));
                            }) })] }) })] }));
};
const SampleInfo = ({ sample }) => {
    if (!sample)
        return null;
    return (_jsx("div", { className: "verify-sample", children: _jsxs("div", { className: "verify-sample__columns", children: [_jsxs("div", { className: "verify-sample__column", children: [_jsxs("div", { className: "verify-sample__column-header", children: [_jsx("h3", { className: "verify-sample__column-title", children: "Original Input" }), _jsxs("div", { className: "verify-sample__tags", children: [_jsx("span", { className: "verify-sample__tag verify-sample__tag--purple", children: sample.perturbation_class }), _jsx("span", { className: "verify-sample__tag verify-sample__tag--red", children: sample.intensity })] })] }), _jsxs("div", { className: "verify-sample__field", children: [_jsx("label", { className: "verify-sample__label", children: "Original Query" }), _jsx("p", { className: "verify-sample__text", children: sample.original_query })] }), _jsxs("div", { className: "verify-sample__field", children: [_jsx("label", { className: "verify-sample__label", children: "Original Context" }), _jsx("p", { className: "verify-sample__context verify-sample__context--original", children: sample.original_context })] }), _jsxs("div", { className: "verify-sample__field", children: [_jsx("label", { className: "verify-sample__label", children: "Original Answers" }), _jsx("p", { className: "verify-sample__text", children: Array.isArray(sample.original_answers) ? sample.original_answers.join(', ') : sample.original_answers })] })] }), _jsxs("div", { className: "verify-sample__column verify-sample__column--highlight", children: [_jsxs("div", { className: "verify-sample__column-header", children: [_jsx("h3", { className: "verify-sample__column-title", children: "Generator Output" }), _jsxs("div", { className: "verify-sample__tags", children: [sample.generator_display_name && (_jsx("span", { className: "verify-sample__tag verify-sample__tag--green", children: sample.generator_display_name })), _jsx("span", { className: "verify-sample__tag verify-sample__tag--blue", children: sample.lever_selected })] })] }), _jsxs("div", { className: "verify-sample__field", children: [_jsx("label", { className: "verify-sample__label", children: "Perturbed Query" }), _jsx("p", { className: "verify-sample__text", children: sample.perturbed_query || sample.original_query })] }), _jsxs("div", { className: "verify-sample__field", children: [_jsx("label", { className: "verify-sample__label", children: "Perturbed Context" }), _jsx("p", { className: "verify-sample__context verify-sample__context--perturbed", children: sample.perturbed_context })] }), _jsxs("div", { className: "verify-sample__field", children: [_jsx("label", { className: "verify-sample__label", children: "Lever Selected" }), _jsx("p", { className: "verify-sample__text verify-sample__text--lever", children: sample.lever_selected })] })] })] }) }));
};
// ============================================
// AUTO-SAVE LOGIC (replaces manual SatisfactionPrompt)
// ============================================
async function autoSaveResults(perturbationData, verificationResults) {
    const payload = {
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
export default function VerificationDashboard({ perturbationData, onBack, onInferenceLab }) {
    const [results, setResults] = useState([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState(null);
    const hasStartedRef = useRef(false);
    const [autoSaveStatus, setAutoSaveStatus] = useState('idle');
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
                    if (inString)
                        continue;
                    if (char === '{') {
                        if (depth === 0) {
                            objectStart = i;
                        }
                        depth++;
                    }
                    else if (char === '}') {
                        depth--;
                        if (depth === 0 && objectStart !== -1) {
                            const jsonStr = buffer.substring(objectStart, i + 1);
                            try {
                                const result = JSON.parse(jsonStr);
                                setResults(prev => [...prev, result]);
                            }
                            catch (e) {
                                console.error('Failed to parse result:', e);
                            }
                            buffer = buffer.substring(i + 1);
                            i = -1; // Reset index for new buffer
                            objectStart = -1;
                        }
                    }
                }
            }
        }
        catch (err) {
            console.error('Verification error:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
        }
        finally {
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
    return (_jsx("div", { className: "verify-page", children: _jsxs("div", { className: "verify-container", children: [_jsxs("div", { className: "verify-header", children: [_jsxs("div", { children: [_jsx("div", { style: { marginBottom: '0.5rem' }, children: _jsxs("button", { onClick: onBack, className: "verify-back-btn", children: [_jsx(ArrowLeft, { className: "w-4 h-4" }), "Back"] }) }), _jsx("h1", { className: "verify-header__title", children: "RefusalBenchStudio - Verification Pipeline" })] }), _jsxs("div", { className: "verify-header__actions", children: [isStreaming && (_jsxs("span", { className: "verify-stream-status", children: [_jsx(Loader2, { className: "w-4 h-4 animate-spin" }), "Streaming results..."] })), _jsxs("button", { onClick: () => startVerification(true), disabled: isStreaming, className: "verify-back-btn", children: [_jsx(RefreshCw, { className: `w-4 h-4 ${isStreaming ? 'animate-spin' : ''}` }), isStreaming ? 'Streaming...' : 'Re-verify'] }), !isStreaming && results.length > 0 && onInferenceLab && (_jsxs("button", { onClick: onInferenceLab, className: "verify-action-btn", children: ["Inference Lab", _jsx(ArrowRight, { className: "w-4 h-4" })] }))] })] }), error && (_jsx("div", { className: "verify-error", children: _jsxs("div", { className: "verify-error__content", children: [_jsx(XCircle, { className: "w-5 h-5 verify-error__icon" }), _jsxs("div", { children: [_jsx("h3", { className: "verify-error__title", children: "Verification Error" }), _jsx("p", { className: "verify-error__message", children: error })] })] }) })), _jsx(SampleInfo, { sample: perturbationData }), _jsxs("div", { className: "verify-stats", children: [_jsx(AgreementMatrix, { results: results }), _jsx(CriteriaHeatmap, { results: results })] }), _jsxs("div", { className: "verify-results-header", children: [_jsx(Clock, { className: "w-4 h-4 verify-results-header__icon" }), _jsxs("h2", { className: "verify-results-header__title", children: ["Verifier Results (", results.length, ")"] })] }), _jsxs("div", { className: "verify-cards-grid", children: [results.map((result, i) => (_jsx(VerifierCard, { result: result, index: i, isStreaming: isStreaming && i === results.length - 1 }, `${result.verification_model}-${i}`))), isStreaming && (_jsx("div", { className: "verify-card verify-card--placeholder", children: _jsxs("div", { className: "verify-card__placeholder-content", children: [_jsx(Loader2, { className: "w-6 h-6 animate-spin", style: { margin: '0 auto' } }), _jsx("span", { className: "verify-card__placeholder-text", children: "Awaiting next result..." })] }) }))] }), results.length === 0 && !isStreaming && !error && (_jsxs("div", { className: "verify-empty", children: [_jsx(Users, { className: "w-12 h-12 verify-empty__icon" }), _jsx("h3", { className: "verify-empty__title", children: "No verification results yet" }), _jsx("p", { className: "verify-empty__text", children: "Click \"Re-verify\" to start verification." })] })), results.length > 1 && !isStreaming && ((() => {
                    const verdicts = results.map(r => r.verification_response?.verification_result);
                    const hasDisagreement = new Set(verdicts.filter(Boolean)).size > 1;
                    if (!hasDisagreement)
                        return null;
                    return (_jsx("div", { className: "verify-alert verify-alert--warning", children: _jsxs("div", { className: "verify-alert__content", children: [_jsx(AlertTriangle, { className: "w-5 h-5 verify-alert__icon" }), _jsxs("div", { children: [_jsx("h3", { className: "verify-alert__title", children: "Verifier Disagreement Detected" }), _jsx("p", { className: "verify-alert__message", children: "The verifiers have reached different conclusions about this perturbation. Review individual assessments to understand the points of disagreement." })] })] }) }));
                })()), autoSaveStatus !== 'idle' && (_jsx("div", { className: `satisfaction-prompt ${autoSaveStatus === 'saved' ? 'satisfaction-prompt--success' : ''}`, children: _jsxs("div", { className: "satisfaction-prompt__content", children: [autoSaveStatus === 'saving' && (_jsxs("p", { className: "satisfaction-prompt__title", style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx(Loader2, { className: "w-4 h-4 animate-spin" }), "Saving results to the database..."] })), autoSaveStatus === 'saved' && (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx(Database, { className: "w-5 h-5" }), _jsx("h3", { className: "satisfaction-prompt__title", children: "Results saved" })] }), _jsx("p", { className: "satisfaction-prompt__subtitle", children: "Perturbation and verification data have been automatically saved to the database." })] })), autoSaveStatus === 'error' && (_jsxs("div", { className: "satisfaction-prompt__error", children: [_jsx(XCircle, { className: "w-4 h-4" }), _jsx("span", { children: "Auto-save failed. Results are still visible above." })] }))] }) })), !isStreaming && results.length > 0 && onInferenceLab && (_jsxs("div", { className: "verify-evaluate-prompt", children: [_jsxs("div", { className: "verify-evaluate-prompt__content", children: [_jsx("h3", { className: "verify-evaluate-prompt__title", children: "Ready to evaluate?" }), _jsx("p", { className: "verify-evaluate-prompt__text", children: "Compare how two models respond to this perturbation in the Inference Lab" })] }), _jsxs("button", { onClick: onInferenceLab, className: "verify-evaluate-btn", children: ["Inference Lab", _jsx(ArrowRight, { className: "w-4 h-4" })] })] }))] }) }));
}
