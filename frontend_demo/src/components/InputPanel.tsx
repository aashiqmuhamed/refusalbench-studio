import { ChangeEvent, FormEvent, useState } from 'react';
import clsx from 'clsx';
import { GeneratePerturbationRequest } from '@/types';

const intensityOptions: { value: GeneratePerturbationRequest['intensity']; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' }
];

const perturbationClassOptions: {
  value: GeneratePerturbationRequest['perturbation_class'];
  label: string;
}[] = [
  { value: 'P-Ambiguity', label: 'P-Ambiguity' },
  { value: 'P-Contradiction', label: 'P-Contradiction' },
  { value: 'P-MissingInfo', label: 'P-Missing Information' },
  { value: 'P-FalsePremise', label: 'P-False Premise' },
  { value: 'P-GranularityMismatch', label: 'P-Granularity Mismatch' },
  { value: 'P-EpistemicMismatch', label: 'P-Epistemic Mismatch' }
];

const sample: GeneratePerturbationRequest = {
  question: '',
  context: '',
  answers: '',
  intensity: intensityOptions[0].value,
  perturbation_class: perturbationClassOptions[0].value
};

export interface InputPanelProps {
  loading?: boolean;
  onSubmit: (payload: GeneratePerturbationRequest) => Promise<void> | void;
}

const InputPanel = ({ loading = false, onSubmit }: InputPanelProps) => {
  const [form, setForm] = useState<GeneratePerturbationRequest>({ ...sample });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isDisabled = loading;

  const handleFieldChange =
    <Field extends keyof GeneratePerturbationRequest>(field: Field) =>
    (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement>) => {
      setForm((prev) => ({
        ...prev,
        [field]: event.target.value as GeneratePerturbationRequest[Field]
      }));
    };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }
    await onSubmit(form);
  };

  return (
    <div className="panel">
      <header className="panel__header">
        <div>
          <h2 className="panel__title">Input Box</h2>
          <p className="panel__subtitle">Provide a Q&amp;A example and choose generation settings.</p>
        </div>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        <div className="form__field">
          <label htmlFor="question" className="form__label">
            Question
          </label>
          <textarea
            id="question"
            className={clsx('form__textarea', errors.question && 'form__textarea--error')}
            rows={3}
            value={form.question}
            onChange={handleFieldChange('question')}
            placeholder="Type or paste the question..."
            disabled={isDisabled}
          />
          {errors.question && <p className="form__error">{errors.question}</p>}
        </div>

        <div className="form__field">
          <label htmlFor="context" className="form__label">
            Context
          </label>
          <textarea
            id="context"
            className={clsx('form__textarea', errors.context && 'form__textarea--error')}
            rows={8}
            value={form.context}
            onChange={handleFieldChange('context')}
            placeholder="Paste the supporting context passage..."
            disabled={isDisabled}
          />
          {errors.context && <p className="form__error">{errors.context}</p>}
        </div>

        <div className="form__field">
          <label htmlFor="answers" className="form__label">
            Expected answer
          </label>
          <textarea
            id="answers"
            className={clsx('form__textarea', errors.answers && 'form__textarea--error')}
            rows={3}
            value={form.answers}
            onChange={handleFieldChange('answers')}
            placeholder="Type the expected answer(s)..."
            disabled={isDisabled}
          />
          {errors.answers && <p className="form__error">{errors.answers}</p>}
        </div>

        <div className="form__two-column">
          <div className="form__field">
            <label htmlFor="perturbation_class" className="form__label">
              Perturbation class
            </label>
            <select
              id="perturbation_class"
              className={clsx('form__select', errors.perturbation_class && 'form__select--error')}
              value={form.perturbation_class}
              onChange={handleFieldChange('perturbation_class')}
              disabled={isDisabled}
            >
              {perturbationClassOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.perturbation_class && <p className="form__error">{errors.perturbation_class}</p>}
          </div>

          <div className="form__field">
            <label htmlFor="intensity" className="form__label">
              Intensity
            </label>
            <select
              id="intensity"
              className={clsx('form__select', errors.intensity && 'form__select--error')}
              value={form.intensity}
              onChange={handleFieldChange('intensity')}
              disabled={isDisabled}
            >
              {intensityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.intensity && <p className="form__error">{errors.intensity}</p>}
          </div>
        </div>

        <button type="submit" className="button button--primary" disabled={isDisabled}>
          {loading ? 'Generating...' : 'Generate perturbation'}
        </button>
      </form>
    </div>
  );
};

export default InputPanel;
