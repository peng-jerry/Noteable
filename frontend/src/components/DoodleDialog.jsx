import { useCallback, useEffect, useRef, useState } from "react";
import { attachmentsApi } from "../api";
import { refreshAttachment } from "../utils/images";
import Dialog from "./Dialog";
import Icon from "./Icon";
import Spinner from "./Spinner";

// Drawing space (the saved PNG is this size); the canvas scales to fit.
export const DOODLE_WIDTH = 1200;
export const DOODLE_HEIGHT = 750;

const COLORS = [
  ["#111827", "Black"],
  ["#2563eb", "Blue"],
  ["#dc2626", "Red"],
  ["#16a34a", "Green"],
  ["#ea580c", "Orange"],
  ["#7c3aed", "Purple"],
  ["#facc15", "Yellow"],
];
const SIZES = [
  [2, "Fine"],
  [5, "Medium"],
  [10, "Bold"],
];
const TOOLS = [
  ["pen", "Pen", "pen"],
  ["highlighter", "Highlighter", "highlighter"],
  ["eraser", "Eraser", "eraser"],
];

/** Draw one stroke ({ tool, color, size, points: [[x, y, pressure], …] }). */
export function drawStroke(ctx, stroke) {
  const pts = stroke.points;
  if (!pts.length) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = ctx.fillStyle = "#000";
  } else {
    ctx.strokeStyle = ctx.fillStyle = stroke.color;
    if (stroke.tool === "highlighter") ctx.globalAlpha = 0.35;
  }
  const scale = stroke.tool === "pen" ? 1 : 4;
  const widthAt = (p) => (stroke.tool === "pen" ? stroke.size * (0.35 + 1.3 * (p ?? 0.5)) : stroke.size * scale);

  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], widthAt(pts[0][2]) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (stroke.tool === "pen") {
    // Pressure varies the width, so draw short smoothed segments.
    for (let i = 1; i < pts.length; i += 1) {
      const [x0, y0, p0] = pts[i - 1];
      const [x1, y1, p1] = pts[i];
      const prev = pts[i - 2];
      ctx.beginPath();
      ctx.lineWidth = widthAt((p0 + p1) / 2);
      if (prev) {
        ctx.moveTo((prev[0] + x0) / 2, (prev[1] + y0) / 2);
        ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      } else {
        ctx.moveTo(x0, y0);
        ctx.lineTo((x0 + x1) / 2, (y0 + y1) / 2);
      }
      if (i === pts.length - 1) ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  } else {
    // Highlighter and eraser: one path (so overlaps don't darken).
    ctx.beginPath();
    ctx.lineWidth = widthAt();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i += 1) {
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.stroke();
  }
  ctx.restore();
}

function renderAll(canvas, strokes) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) drawStroke(ctx, stroke);
}

/**
 * Draw a new doodle, or edit one (`attachmentId`). Saving uploads a PNG plus
 * the strokes; `onSaved(attachment, isNew)` follows.
 */
export default function DoodleDialog({ open, attachmentId, noteId, onClose, onSaved }) {
  // The pad knows whether there are unsaved strokes, so it decides how a
  // close request (Cancel, ✕, Escape) is handled.
  const closeGuard = useRef(null);
  const requestClose = () => (closeGuard.current ? closeGuard.current() : onClose());

  return (
    <Dialog open={open} title={attachmentId ? "Edit doodle" : "New doodle"} onClose={requestClose} size="xl">
      {open && <DoodlePad attachmentId={attachmentId} noteId={noteId} onSaved={onSaved} onClose={onClose} closeGuard={closeGuard} />}
    </Dialog>
  );
}

function DoodlePad({ attachmentId, noteId, onSaved, onClose, closeGuard }) {
  const inkRef = useRef(null);
  const liveRef = useRef(null);
  const current = useRef(null);
  const [strokes, setStrokes] = useState([]);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState(COLORS[0][0]);
  const [size, setSize] = useState(SIZES[1][0]);
  const [status, setStatus] = useState(attachmentId ? "loading" : "ready"); // loading | ready | saving | error
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty = past.length > 0;

  // Ask before throwing away strokes; otherwise close straight away.
  const requestClose = () => (dirty && status !== "saving" ? setConfirmClose(true) : onClose());
  closeGuard.current = requestClose;
  useEffect(() => () => {
    closeGuard.current = null;
  }, [closeGuard]);

  // Load an existing doodle's strokes.
  useEffect(() => {
    if (!attachmentId) return undefined;
    let alive = true;
    attachmentsApi
      .doodle(attachmentId)
      .then((doodle) => {
        if (!alive) return;
        setStrokes(Array.isArray(doodle.strokes) ? doodle.strokes : []);
        setStatus("ready");
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
        setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [attachmentId]);

  useEffect(() => {
    if (inkRef.current) renderAll(inkRef.current, strokes);
  }, [strokes]);

  const commit = useCallback((next) => {
    setPast((p) => [...p, strokes]);
    setFuture([]);
    setStrokes(next);
  }, [strokes]);

  const undo = useCallback(() => {
    if (!past.length) return;
    setFuture((f) => [strokes, ...f]);
    setStrokes(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  }, [past, strokes]);

  const redo = useCallback(() => {
    if (!future.length) return;
    setPast((p) => [...p, strokes]);
    setStrokes(future[0]);
    setFuture((f) => f.slice(1));
  }, [future, strokes]);

  // Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl/⌘+Y
  useEffect(() => {
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  function pointFrom(e) {
    const rect = inkRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * DOODLE_WIDTH) / rect.width;
    const y = ((e.clientY - rect.top) * DOODLE_HEIGHT) / rect.height;
    // Mice report 0.5 while pressed; touch often reports 0 or 1, so treat it as even.
    const pressure = e.pointerType === "pen" ? e.pressure || 0.5 : 0.5;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pressure * 100) / 100];
  }

  function onPointerDown(e) {
    if (status !== "ready" || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    current.current = { tool, color, size, points: [pointFrom(e)] };
    drawLive();
  }

  function onPointerMove(e) {
    const stroke = current.current;
    if (!stroke) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events) {
      const p = pointFrom(ev);
      const last = stroke.points[stroke.points.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1.5) stroke.points.push(p);
    }
    drawLive();
  }

  function onPointerUp() {
    const stroke = current.current;
    if (!stroke) return;
    current.current = null;
    const live = liveRef.current;
    live.getContext("2d").clearRect(0, 0, live.width, live.height);
    commit([...strokes, stroke]);
  }

  // The stroke in progress: erasing shows on the ink itself, others on a top layer.
  function drawLive() {
    const stroke = current.current;
    if (stroke.tool === "eraser") {
      renderAll(inkRef.current, [...strokes, stroke]);
      return;
    }
    const live = liveRef.current;
    const ctx = live.getContext("2d");
    ctx.clearRect(0, 0, live.width, live.height);
    drawStroke(ctx, stroke);
  }

  async function save() {
    setStatus("saving");
    setError("");
    try {
      const out = document.createElement("canvas");
      out.width = DOODLE_WIDTH;
      out.height = DOODLE_HEIGHT;
      const ctx = out.getContext("2d");
      ctx.fillStyle = "#fff"; // paper, so ink shows in dark mode too
      ctx.fillRect(0, 0, DOODLE_WIDTH, DOODLE_HEIGHT);
      ctx.drawImage(inkRef.current, 0, 0);
      const blob = await new Promise((resolve) => out.toBlob(resolve, "image/png"));
      const fields = {
        blob,
        kind: "doodle",
        width: DOODLE_WIDTH,
        height: DOODLE_HEIGHT,
        noteId,
        doodle: { version: 1, width: DOODLE_WIDTH, height: DOODLE_HEIGHT, strokes },
      };
      if (attachmentId) {
        const attachment = await attachmentsApi.replace(attachmentId, fields);
        refreshAttachment(attachmentId);
        onSaved(attachment, false);
      } else {
        onSaved(await attachmentsApi.upload(fields), true);
      }
    } catch (err) {
      setError(err.message);
      setStatus("ready");
    }
  }

  return (
    <div className="doodle">
      <div className="doodle-toolbar" role="toolbar" aria-label="Drawing tools">
        <div className="segmented" role="group" aria-label="Tool">
          {TOOLS.map(([id, label, icon]) => (
            <button key={id} type="button" className={tool === id ? "active" : ""} aria-pressed={tool === id} onClick={() => setTool(id)} title={label}>
              <Icon name={icon} /> <span className="hide-sm">{label}</span>
            </button>
          ))}
        </div>
        <div className="doodle-colors" role="group" aria-label="Colour">
          {COLORS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`doodle-swatch ${color === value ? "active" : ""}`}
              style={{ "--swatch": value }}
              aria-pressed={color === value}
              aria-label={label}
              title={label}
              disabled={tool === "eraser"}
              onClick={() => setColor(value)}
            />
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Size">
          {SIZES.map(([value, label]) => (
            <button key={value} type="button" className={size === value ? "active" : ""} aria-pressed={size === value} onClick={() => setSize(value)} title={label}>
              <span className="size-dot" style={{ "--dot": `${Math.min(14, value + 3)}px` }} aria-hidden="true" />
              <span className="sr-only">{label}</span>
            </button>
          ))}
        </div>
        <div className="doodle-history">
          <button type="button" className="icon-btn" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo (Ctrl+Z)">
            <Icon name="undo" />
          </button>
          <button type="button" className="icon-btn" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
            <Icon name="redo" />
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => strokes.length && commit([])} disabled={!strokes.length}>
            Clear
          </button>
        </div>
      </div>

      <div className="doodle-paper">
        <canvas ref={inkRef} width={DOODLE_WIDTH} height={DOODLE_HEIGHT} aria-hidden="true" />
        <canvas
          ref={liveRef}
          width={DOODLE_WIDTH}
          height={DOODLE_HEIGHT}
          className={`doodle-input tool-${tool}`}
          role="img"
          aria-label="Drawing area. Draw with a mouse, finger or stylus."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {status === "loading" && (
          <div className="doodle-overlay">
            <Spinner size={22} /> Loading drawing…
          </div>
        )}
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        {confirmClose ? (
          <span className="confirm-inline">
            Discard this drawing?
            <button type="button" className="btn btn-sm btn-danger" onClick={() => onClose()}>
              Discard
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmClose(false)}>
              Keep drawing
            </button>
          </span>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" onClick={requestClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={status !== "ready" || (!dirty && !!attachmentId)}>
              {status === "saving" ? "Saving…" : attachmentId ? "Save changes" : "Insert doodle"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
