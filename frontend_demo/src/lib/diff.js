import { diffWords } from 'diff';
export const computeWordDiff = (before, after) => {
    if (!before && !after) {
        return [];
    }
    return diffWords(before ?? '', after ?? '').map((part) => ({
        value: part.value,
        type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged'
    }));
};
