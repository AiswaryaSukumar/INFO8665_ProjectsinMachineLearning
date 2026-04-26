// src/components/Toast.jsx
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";

/**
 * Minimal toast system (no external libs)
 *
 * Usage:
 * 1) Wrap app once:
 *    <ToastProvider><App /></ToastProvider>
 *
 * 2) In any component:
 *    const { toast } = useToast();
 *    toast.success("Saved!");
 *    toast.error("Something went wrong");
 */

const ToastContext = createContext(null);
const DEFAULT_DURATION = 2800;

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timersRef = useRef(new Map()); // id -> timeoutId

  const remove = useCallback((id) => {
    // clear timer if exists
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    ({ type = "info", title = "", message = "", duration = DEFAULT_DURATION }) => {
      const id = makeId();

      setItems((prev) => [
        ...prev,
        {
          id,
          type,
          title,
          message: String(message ?? ""),
          createdAt: Date.now(),
          duration: duration ?? DEFAULT_DURATION,
        },
      ]);

      const d = duration ?? DEFAULT_DURATION;
      if (d !== 0) {
        const timeoutId = setTimeout(() => remove(id), d);
        timersRef.current.set(id, timeoutId);
      }

      return id;
    },
    [remove]
  );

  // cleanup all timers on unmount
  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  const api = useMemo(() => {
    const base = (type) => (message, opts = {}) =>
      push({
        type,
        title: opts.title ?? "",
        message,
        duration: opts.duration ?? DEFAULT_DURATION,
      });

    return {
      push,
      remove,
      toast: {
        info: base("info"),
        success: base("success"),
        warning: base("warning"),
        error: base("error"),
      },
    };
  }, [push, remove]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* UI */}
      <div aria-live="polite" aria-relevant="additions" className="toastStack">
        {items.map((t) => (
          <ToastItem key={t.id} t={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() must be used inside <ToastProvider>");
  return ctx;
}

function ToastItem({ t, onClose }) {
  const tone = getToastTone(t.type);

  return (
    <div role="status" className={`toast ${tone.className}`}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span aria-hidden="true" style={{ fontSize: 16 }}>
            {tone.icon}
          </span>
          <div className="toastTitle">{t.title || tone.title}</div>
        </div>
        <div className="toastMsg">{t.message}</div>
      </div>

      <button
        type="button"
        className="toastClose"
        onClick={onClose}
        aria-label="Dismiss notification"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

function getToastTone(type) {
  switch (String(type || "").toLowerCase()) {
    case "success":
      return { title: "Success", icon: "✅", className: "success" };
    case "warning":
      return { title: "Warning", icon: "⚠️", className: "warning" };
    case "error":
      return { title: "Error", icon: "⛔", className: "error" };
    default:
      return { title: "Info", icon: "ℹ️", className: "info" };
  }
}
