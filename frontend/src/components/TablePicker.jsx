import { useEffect, useRef, useState } from "react";

const MAX = 8;

/**
 * Hover (or use the arrow keys) to choose columns × rows, then click or press
 * Enter to insert. Rows are body rows; a header row is always added.
 */
export default function TablePicker({ onPick, onClose }) {
  const [size, setSize] = useState({ cols: 3, rows: 2 });
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    const close = (e) => !ref.current?.contains(e.target) && onClose();
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [onClose]);

  function onKeyDown(e) {
    const moves = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dc, dr] = moves[e.key];
      setSize((s) => ({
        cols: Math.min(MAX, Math.max(1, s.cols + dc)),
        rows: Math.min(MAX, Math.max(1, s.rows + dr)),
      }));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick(size.cols, size.rows);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  const label = `${size.cols} column${size.cols === 1 ? "" : "s"} × ${size.rows} row${size.rows === 1 ? "" : "s"}`;

  return (
    <div
      ref={ref}
      className="table-picker"
      role="dialog"
      aria-label={`Insert table: ${label}. Use the arrow keys to change the size and Enter to insert.`}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="table-grid" style={{ "--cols": MAX }}>
        {Array.from({ length: MAX * MAX }, (_, i) => {
          const c = (i % MAX) + 1;
          const r = Math.floor(i / MAX) + 1;
          const on = c <= size.cols && r <= size.rows;
          return (
            <span
              key={i}
              className={`table-cell ${on ? "on" : ""}`}
              onMouseEnter={() => setSize({ cols: c, rows: r })}
              onClick={() => onPick(c, r)}
              aria-hidden="true"
            />
          );
        })}
      </div>
      <p className="table-picker-label" aria-live="polite">
        {label} <span className="muted">+ header</span>
      </p>
    </div>
  );
}
