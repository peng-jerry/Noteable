import { Suspense, lazy } from "react";

// The Markdown renderer is the largest dependency, so it loads in its own
// chunk; pages without a preview (login, register, settings) skip it.
const MarkdownPreview = lazy(() => import("./MarkdownPreview"));

export default function LazyMarkdownPreview(props) {
  return (
    <Suspense fallback={<p className="preview-empty">Loading preview…</p>}>
      <MarkdownPreview {...props} />
    </Suspense>
  );
}
