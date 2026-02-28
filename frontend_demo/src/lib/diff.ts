import { diffWords } from 'diff';

export type DiffSegmentType = 'added' | 'removed' | 'unchanged';

export interface DiffSegment {
  value: string;
  type: DiffSegmentType;
}

export const computeWordDiff = (before: string, after: string): DiffSegment[] => {
  if (!before && !after) {
    return [];
  }

  return diffWords(before ?? '', after ?? '').map((part) => ({
    value: part.value,
    type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged'
  }));
};
