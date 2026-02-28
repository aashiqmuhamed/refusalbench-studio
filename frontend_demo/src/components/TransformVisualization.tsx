import DiffText from '@/components/DiffText';
import { PerturbationResponse } from '@/types';

export interface TransformVisualizationProps {
  data?: PerturbationResponse | null;
  loading?: boolean;
  error?: string | null;
  onVerify?: () => void;
}

const formatAnswers = (answers?: string | string[]) => {
  if (!answers) {
    return 'Not provided';
  }
  return Array.isArray(answers) ? answers.join(', ') : answers;
};

const TransformVisualization = ({ data, loading = false, error, onVerify }: TransformVisualizationProps) => {
  const hasResult = Boolean(data && data.generation_successful);
  const result = hasResult ? data : null;
  const hasData = Boolean(data);

  return (
    <div className="panel">
      <header className="panel__header">
        <div>
          <h2 className="panel__title">Perturbation Viewer</h2>
        </div>
      </header>

      {error && <div className="panel__banner panel__banner--error">{error}</div>}
      {loading && !result && <div className="panel__banner">Generating perturbation...</div>}

      {result ? (
        <>
          <div className="transform-panel">
            <article className="transform-card">
              <h3 className="transform-card__title">Original Input</h3>
              <div className="transform-card__section">
                <span className="transform-card__label">Question</span>
                <p className="transform-card__text">{result.original_query}</p>
              </div>
              <div className="transform-card__section">
                <span className="transform-card__label">Context</span>
                <p className="transform-card__text transform-card__text--context">
                  {result.original_context}
                </p>
              </div>
              <div className="transform-card__section">
                <span className="transform-card__label">Answer</span>
                <p className="transform-card__text">{formatAnswers(result.original_answers)}</p>
              </div>
            </article>

            <article className="transform-card transform-card--highlight">
              <h3 className="transform-card__title">Perturbed Output</h3>
              <div className="transform-card__section">
                <span className="transform-card__label">Perturbed question</span>
                <DiffText
                  before={result.original_query}
                  after={result.perturbed_query ?? result.original_query}
                  className="transform-card__text"
                />
              </div>
              <div className="transform-card__section">
                <span className="transform-card__label">Perturbed context</span>
                <DiffText
                  before={result.original_context}
                  after={result.perturbed_context ?? result.original_context}
                  className="transform-card__text transform-card__text--context"
                  as="div"
                />
              </div>
            </article>
          </div>

          <div className="transform-meta">
            <div className="transform-meta__item">
              <span className="transform-meta__label">Class</span>
              <span className="transform-meta__value">{result.perturbation_class}</span>
            </div>
            <div className="transform-meta__item">
              <span className="transform-meta__label">Intensity</span>
              <span className="transform-meta__value">{result.intensity}</span>
            </div>
            {result.ground_truth_label && (
              <div className="transform-meta__item">
                <span className="transform-meta__label">Expected Output (Ground Truth)</span>
                <span className={`transform-meta__value transform-meta__value--ground-truth ${
                  result.ground_truth_label === 'ANSWER_CORRECTLY'
                    ? 'transform-meta__value--answer'
                    : 'transform-meta__value--refuse'
                }`}>
                  {result.ground_truth_label}
                </span>
              </div>
            )}
            {result.generator_display_name && (
              <div className="transform-meta__item">
                <span className="transform-meta__label">Generator Model</span>
                <span className="transform-meta__value">{result.generator_display_name}</span>
              </div>
            )}
            {result.lever_selected && (
              <div className="transform-meta__item transform-meta__item--wide">
                <span className="transform-meta__label">Lever selected</span>
                <span className="transform-meta__value">{result.lever_selected}</span>
              </div>
            )}
            {result.implementation_reasoning && (
              <div className="transform-meta__item transform-meta__item--wide">
                <span className="transform-meta__label">Implementation reasoning</span>
                <p className="transform-meta__value">{result.implementation_reasoning}</p>
              </div>
            )}
          </div>
        </>
      ) : (
        !loading &&
        !error && (
          <div className="panel__empty">
            <p>Submit a QA example to visualize perturbations.</p>
          </div>
        )
      )}

      {onVerify && (
        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'center', width: '100%' }}>
          <button
            type="button"
            className="button button--primary"
            style={{ cursor: 'pointer', width: 'auto', minWidth: '200px' }}
            onClick={onVerify}
          >
            Verify Perturbation →
          </button>
        </div>
      )}
    </div>
  );
};

export default TransformVisualization;
