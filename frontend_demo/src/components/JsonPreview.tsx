import { PerturbationMetadata } from '@/types';

export interface JsonPreviewProps {
  metadata?: PerturbationMetadata;
  title?: string;
}

const JsonPreview = ({ metadata, title = 'Output JSON' }: JsonPreviewProps) => {
  if (!metadata || Object.keys(metadata).length === 0) {
    return (
      <div className="json-preview json-preview--empty">
        <p>No JSON output available yet.</p>
      </div>
    );
  }

  return (
    <div className="json-preview">
      <div className="json-preview__header">
        <h3>{title}</h3>
      </div>
      <pre className="json-preview__body">
        {JSON.stringify(metadata, null, 2)}
      </pre>
    </div>
  );
};

export default JsonPreview;
