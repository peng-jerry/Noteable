import { useId } from "react";

/** Labelled input with an inline, screen-reader-announced error message. */
export default function FormField({ label, error, hint, id, ...inputProps }) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = [error && `${inputId}-error`, hint && `${inputId}-hint`].filter(Boolean).join(" ");

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        {...inputProps}
      />
      {hint && !error && (
        <p className="field-hint" id={`${inputId}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${inputId}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
