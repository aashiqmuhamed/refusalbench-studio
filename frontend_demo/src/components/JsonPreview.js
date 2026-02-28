import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const JsonPreview = ({ metadata, title = 'Output JSON' }) => {
    if (!metadata || Object.keys(metadata).length === 0) {
        return (_jsx("div", { className: "json-preview json-preview--empty", children: _jsx("p", { children: "No JSON output available yet." }) }));
    }
    return (_jsxs("div", { className: "json-preview", children: [_jsx("div", { className: "json-preview__header", children: _jsx("h3", { children: title }) }), _jsx("pre", { className: "json-preview__body", children: JSON.stringify(metadata, null, 2) })] }));
};
export default JsonPreview;
