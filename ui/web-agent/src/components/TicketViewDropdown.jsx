// src/components/TicketViewDropdown.jsx
import { useEffect, useMemo, useRef, useState } from "react";

// Enterprise-friendly view names
const OPTIONS = [
  { value: "RECENT", label: "My Work Queue" },
  { value: "HISTORY", label: "System Ticket Registry" },
  { value: "REPORTS", label: "Analytics & Reporting" },
  { value: "DELETED", label: "Audit Log (Deleted Tickets)" },
];

export default function TicketViewDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const selected = useMemo(
    () => OPTIONS.find((o) => o.value === value) || OPTIONS[0],
    [value]
  );

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (next) => {
    onChange?.(next);
    setOpen(false);
  };

  return (
    <div className="dropdown" ref={wrapRef}>
      <button
        className="btn primary dropdownBtn"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Switch workspace view"
      >
        <span className="dropdownBtnText">{selected.label}</span>
        <span className="dropdownChevron" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="dropdownMenu" role="menu">
          {OPTIONS.map((o) => {
            const active = o.value === selected.value;
            return (
              <button
                key={o.value}
                type="button"
                role="menuitem"
                className={`dropdownItem ${active ? "active" : ""}`}
                onClick={() => choose(o.value)}
              >
                <span>{o.label}</span>
                {active ? <span className="dropdownCheck">✓</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
