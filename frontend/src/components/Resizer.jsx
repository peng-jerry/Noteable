import { useRef, useState } from "react";

/**
 * A draggable vertical divider. Drag (mouse, pen or touch), use the arrow
 * keys when focused, or double-click / press Enter to reset.
 *
 * `value` is in whatever unit the caller uses; `pxToValue(dx)` converts a
 * pointer movement in pixels into a change of that unit (default 1:1).
 */
export default function Resizer({ label, value, min, max, onChange, onReset, step = 16, pxToValue = (dx) => dx, format = (v) => `${Math.round(v)} pixels` }) {
  const start = useRef(null);
  const [dragging, setDragging] = useState(false);

  function onPointerDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, value, convert: pxToValue };
    setDragging(true);
  }

  function onPointerMove(e) {
    if (!start.current) return;
    const { x, value: startValue, convert } = start.current;
    onChange(startValue + convert(e.clientX - x));
  }

  function onPointerUp(e) {
    if (!start.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    start.current = null;
    setDragging(false);
  }

  function onKeyDown(e) {
    const delta = pxToValue(e.shiftKey ? step * 4 : step);
    if (e.key === "ArrowLeft") onChange(value - delta);
    else if (e.key === "ArrowRight") onChange(value + delta);
    else if (e.key === "Enter" || e.key === "Home") onReset();
    else return;
    e.preventDefault();
  }

  return (
    <div
      className={`resizer ${dragging ? "dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value * 100) / 100}
      aria-valuetext={format(value)}
      tabIndex={0}
      title={`${label} — drag to resize, double-click to reset`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
