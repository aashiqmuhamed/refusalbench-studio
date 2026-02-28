import { useMemo } from 'react';
import clsx from 'clsx';
import { computeWordDiff } from '@/lib/diff';

interface DiffTextProps {
  before: string;
  after: string;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}

const DiffText = ({ before, after, className, as: Component = 'p' }: DiffTextProps) => {
  const segments = useMemo(() => computeWordDiff(before, after), [before, after]);

  return (
    <Component className={clsx('diff-text', className)}>
      {segments.length === 0 && <span className="diff-text__empty">No changes</span>}
      {segments.map((segment, index) => (
        <span
          key={`${segment.type}-${index}`}
          className={clsx('diff-text__segment', {
            'diff-text__segment--added': segment.type === 'added',
            'diff-text__segment--removed': segment.type === 'removed'
          })}
        >
          {segment.value}
        </span>
      ))}
    </Component>
  );
};

export default DiffText;
