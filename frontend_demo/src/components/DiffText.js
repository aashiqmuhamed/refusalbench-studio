import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import clsx from 'clsx';
import { computeWordDiff } from '@/lib/diff';
const DiffText = ({ before, after, className, as: Component = 'p' }) => {
    const segments = useMemo(() => computeWordDiff(before, after), [before, after]);
    return (_jsxs(Component, { className: clsx('diff-text', className), children: [segments.length === 0 && _jsx("span", { className: "diff-text__empty", children: "No changes" }), segments.map((segment, index) => (_jsx("span", { className: clsx('diff-text__segment', {
                    'diff-text__segment--added': segment.type === 'added',
                    'diff-text__segment--removed': segment.type === 'removed'
                }), children: segment.value }, `${segment.type}-${index}`)))] }));
};
export default DiffText;
