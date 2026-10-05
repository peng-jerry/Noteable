import { useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";

/** A coloured tag pill. Colours are names (sky, rose, …) mapped in CSS. */
export function TagChip({ tag, onRemove, size = "md", as: As = "span", ...props }) {
  return (
    <As className={`tag-chip tag-${size}`} data-color={tag.color} {...props}>
      <span className="tag-dot" aria-hidden="true" />
      <span className="tag-name">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          className="tag-remove"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(tag);
          }}
          aria-label={`Remove tag ${tag.name}`}
        >
          <Icon name="x" />
        </button>
      )}
    </As>
  );
}

/**
 * Edit a note's tags: chips + a text box with autocomplete from existing
 * tags. Enter, Tab or comma adds; Backspace on an empty box removes the last.
 */
export function TagInput({ value, allTags, onChange }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [navigated, setNavigated] = useState(false);
  const inputRef = useRef(null);
  const listId = useId();

  const chosen = new Set(value.map((t) => t.name.toLowerCase()));
  const suggestions = useMemo(() => {
    const q = text.trim().replace(/^#/, "").toLowerCase();
    return allTags
      .filter((t) => !chosen.has(t.name.toLowerCase()) && (!q || t.name.toLowerCase().includes(q)))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, allTags, value]);

  function add(name) {
    const clean = name.trim().replace(/^#/, "").replace(/,/g, "").trim().slice(0, 40);
    if (!clean || chosen.has(clean.toLowerCase())) {
      setText("");
      return;
    }
    const existing = allTags.find((t) => t.name.toLowerCase() === clean.toLowerCase());
    onChange([...value, existing ?? { id: `new:${clean}`, name: clean, color: "slate" }]);
    setText("");
    setActive(0);
    setNavigated(false);
  }

  function onKeyDown(e) {
    const showing = open && suggestions.length > 0;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && showing) {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (navigated ? (i + step + suggestions.length) % suggestions.length : step > 0 ? 0 : suggestions.length - 1));
      setNavigated(true);
    } else if (e.key === "Enter" || (e.key === "Tab" && text.trim())) {
      // A suggestion only wins if the user arrowed to it; otherwise add what they typed.
      const picked = showing && navigated ? suggestions[active]?.name : null;
      if (!picked && !text.trim()) return;
      e.preventDefault();
      add(picked ?? text);
    } else if (e.key === ",") {
      e.preventDefault();
      add(text);
    } else if (e.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setNavigated(false);
    }
  }

  return (
    <div className="tag-input" onClick={() => inputRef.current?.focus()}>
      <Icon name="tag" className="tag-input-icon" />
      {value.map((tag) => (
        <TagChip key={tag.id} tag={tag} size="sm" onRemove={(t) => onChange(value.filter((x) => x.name !== t.name))} />
      ))}
      <div className="tag-input-field">
        <input
          ref={inputRef}
          value={text}
          placeholder={value.length ? "" : "Add tags…"}
          aria-label="Add a tag"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          maxLength={41}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(0);
            setNavigated(false);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTimeout(() => setOpen(false), 120);
            if (text.trim()) add(text);
          }}
          onKeyDown={onKeyDown}
        />
        {open && suggestions.length > 0 && (
          <ul className="tag-suggestions" id={listId} role="listbox">
            {suggestions.map((tag, i) => (
              <li
                key={tag.id}
                role="option"
                aria-selected={navigated && i === active}
                className={navigated && i === active ? "active" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(tag.name);
                }}
              >
                <TagChip tag={tag} size="sm" />
                {tag.note_count > 0 && <span className="count">{tag.note_count}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
