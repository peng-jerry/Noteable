import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { linkifyWikiLinks } from "../utils/notes";

// react-markdown never renders raw HTML from the note, so previews are safe
// from script injection. External links open in a new tab; [[wiki links]]
// stay in the app (they're hash routes like #/notes/<id>).
function Anchor({ node: _node, href = "", title, children, ...props }) {
  if (title === "wikilink" || title === "wikilink-missing") {
    const missing = title === "wikilink-missing";
    return (
      <a
        {...props}
        href={href}
        className={`wiki-link ${missing ? "missing" : ""}`}
        title={missing ? "No note with this title yet — click to create it" : undefined}
      >
        {children}
      </a>
    );
  }
  const internal = href.startsWith("#");
  return (
    <a {...props} href={href} title={title} {...(internal ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
      {children}
    </a>
  );
}

const components = { a: Anchor };
const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeSlug];

/**
 * Rendered Markdown. Pass `resolveTitle` (title → note id) to turn
 * [[Note title]] into links; without it they're left as typed.
 */
function MarkdownPreview({ content, resolveTitle }) {
  const source = useMemo(
    () => (resolveTitle ? linkifyWikiLinks(content, resolveTitle) : content),
    [content, resolveTitle],
  );
  if (!content.trim()) {
    return <p className="preview-empty">Nothing to preview yet.</p>;
  }
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownPreview);
