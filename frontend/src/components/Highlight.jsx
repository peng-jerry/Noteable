/** Wraps occurrences of the search terms in <mark> (case-insensitive). */
export default function Highlight({ text, terms }) {
  const words = (terms ?? []).map((t) => t.trim()).filter(Boolean);
  if (!text || !words.length) return text ?? null;
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(pattern);
  return parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part));
}
