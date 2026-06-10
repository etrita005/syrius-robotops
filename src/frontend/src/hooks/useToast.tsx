import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { ToastNotification } from "@carbon/react";

export type ToastKind = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  subtitle?: string;
  timeout: number;
}

interface ToastContextValue {
  showToast: (kind: ToastKind, title: string, subtitle?: string, timeout?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastIdCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  const showToast = useCallback(
    (kind: ToastKind, title: string, subtitle?: string, timeout = 5000) => {
      const id = ++toastIdCounter;
      const toast: ToastItem = { id, kind, title, subtitle, timeout };
      setToasts((prev) => [...prev, toast]);

      if (timeout > 0) {
        const timer = setTimeout(() => removeToast(id), timeout);
        timersRef.current.set(id, timer);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: "1.5rem",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9000,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.5rem",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: "auto", minWidth: "360px", maxWidth: "480px" }}>
            <ToastNotification
              kind={toast.kind}
              title={toast.title}
              subtitle={toast.subtitle ?? ""}
              timeout={0}
              onClose={() => removeToast(toast.id)}
              hideCloseButton={false}
              lowContrast
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
