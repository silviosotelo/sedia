import { useState, useCallback, useRef, useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Track all auto-dismiss timers so they can be cleared on unmount
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  const add = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...toast, id }]);
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
    timersRef.current.add(timer);
  }, []);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback(
    (title: string, description?: string) => add({ type: 'success', title, description }),
    [add]
  );

  const error = useCallback(
    (title: string, description?: string) => add({ type: 'error', title, description }),
    [add]
  );

  const info = useCallback(
    (title: string, description?: string) => add({ type: 'info', title, description }),
    [add]
  );

  return { toasts, add, remove, success, error, info };
}
