import { useEffect, useId, useRef, useState } from "react";

/**
 * Dropdown menu. `items` is a list of { label, icon?, onSelect, danger? }.
 * Closes on outside click, Escape, or after choosing an item.
 */
export default function Menu({ trigger, items, label, align = "end", className = "" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    // Move focus into the menu for keyboard users.
    rootRef.current?.querySelector('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function onMenuKeyDown(e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...rootRef.current.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    const next = e.key === "ArrowDown" ? index + 1 : index - 1;
    items[(next + items.length) % items.length]?.focus();
  }

  return (
    <div className={`menu ${className}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </button>
      {open && (
        <ul
          id={menuId}
          className={`menu-list menu-${align}`}
          role="menu"
          onKeyDown={onMenuKeyDown}
        >
          {items.filter(Boolean).map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                className={`menu-item ${item.danger ? "danger" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
