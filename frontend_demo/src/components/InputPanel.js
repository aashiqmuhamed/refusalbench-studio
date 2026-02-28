import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import clsx from 'clsx';
const intensityOptions = [
    { value: 'LOW', label: 'Low' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH', label: 'High' }
];
const perturbationClassOptions = [
    { value: 'P-Ambiguity', label: 'P-Ambiguity' },
    { value: 'P-Contradiction', label: 'P-Contradiction' },
    { value: 'P-MissingInfo', label: 'P-Missing Information' },
    { value: 'P-FalsePremise', label: 'P-False Premise' },
    { value: 'P-GranularityMismatch', label: 'P-Granularity Mismatch' },
    { value: 'P-EpistemicMismatch', label: 'P-Epistemic Mismatch' }
];
const sample = {
    question: '',
    context: '',
    answers: '',
    intensity: intensityOptions[0].value,
    perturbation_class: perturbationClassOptions[0].value
};
const InputPanel = ({ loading = false, onSubmit }) => {
    const [form, setForm] = useState({ ...sample });
    const [errors, setErrors] = useState({});
    const isDisabled = loading;
    const handleFieldChange = (field) => (event) => {
        setForm((prev) => ({
            ...prev,
            [field]: event.target.value
        }));
    };
    const validate = () => {
        const nextErrors = {};
        if (!form.question.trim()) {
            nextErrors.question = 'Question is required.';
        }
        if (!form.perturbation_class) {
            nextErrors.perturbation_class = 'Perturbation class is required.';
        }
        if (!form.intensity) {
            nextErrors.intensity = 'Intensity is required.';
        }
        if (!form.context.trim()) {
            nextErrors.context = 'Context is required.';
        }
        if (!form.answers.trim()) {
            nextErrors.answers = 'Answer is required.';
        }
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };
    const handlePopulateSample = () => {
        setForm({ ...sample });
        setErrors({});
    };
    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!validate()) {
            return;
        }
        await onSubmit(form);
    };
    return (_jsxs("div", { className: "panel", children: [_jsx("header", { className: "panel__header", children: _jsxs("div", { children: [_jsx("h2", { className: "panel__title", children: "Input Box" }), _jsx("p", { className: "panel__subtitle", children: "Provide a Q&A example and choose generation settings." })] }) }), _jsxs("form", { className: "form", onSubmit: handleSubmit, children: [_jsxs("div", { className: "form__field", children: [_jsx("label", { htmlFor: "question", className: "form__label", children: "Question" }), _jsx("textarea", { id: "question", className: clsx('form__textarea', errors.question && 'form__textarea--error'), rows: 3, value: form.question, onChange: handleFieldChange('question'), placeholder: "Type or paste the question...", disabled: isDisabled }), errors.question && _jsx("p", { className: "form__error", children: errors.question })] }), _jsxs("div", { className: "form__field", children: [_jsx("label", { htmlFor: "context", className: "form__label", children: "Context" }), _jsx("textarea", { id: "context", className: clsx('form__textarea', errors.context && 'form__textarea--error'), rows: 8, value: form.context, onChange: handleFieldChange('context'), placeholder: "Paste the supporting context passage...", disabled: isDisabled }), errors.context && _jsx("p", { className: "form__error", children: errors.context })] }), _jsxs("div", { className: "form__field", children: [_jsx("label", { htmlFor: "answers", className: "form__label", children: "Expected answer" }), _jsx("textarea", { id: "answers", className: clsx('form__textarea', errors.answers && 'form__textarea--error'), rows: 3, value: form.answers, onChange: handleFieldChange('answers'), placeholder: "Type the expected answer(s)...", disabled: isDisabled }), errors.answers && _jsx("p", { className: "form__error", children: errors.answers })] }), _jsxs("div", { className: "form__two-column", children: [_jsxs("div", { className: "form__field", children: [_jsx("label", { htmlFor: "perturbation_class", className: "form__label", children: "Perturbation class" }), _jsx("select", { id: "perturbation_class", className: clsx('form__select', errors.perturbation_class && 'form__select--error'), value: form.perturbation_class, onChange: handleFieldChange('perturbation_class'), disabled: isDisabled, children: perturbationClassOptions.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) }), errors.perturbation_class && _jsx("p", { className: "form__error", children: errors.perturbation_class })] }), _jsxs("div", { className: "form__field", children: [_jsx("label", { htmlFor: "intensity", className: "form__label", children: "Intensity" }), _jsx("select", { id: "intensity", className: clsx('form__select', errors.intensity && 'form__select--error'), value: form.intensity, onChange: handleFieldChange('intensity'), disabled: isDisabled, children: intensityOptions.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) }), errors.intensity && _jsx("p", { className: "form__error", children: errors.intensity })] })] }), _jsx("button", { type: "submit", className: "button button--primary", disabled: isDisabled, children: loading ? 'Generating...' : 'Generate perturbation' })] })] }));
};
export default InputPanel;
