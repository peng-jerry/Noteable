import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// react-markdown never renders raw HTML from the note, so previews are safe
// from script injection. External links open in a new tab.
const components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

function MarkdownPreview({ content }) {
  if (!content.trim()) {
    return <p className="preview-empty">Nothing to preview yet.</p>;
  }
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownPreview);
