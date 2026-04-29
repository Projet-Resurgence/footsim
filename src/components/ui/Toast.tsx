import { AnimatePresence, motion } from 'framer-motion';
import { create } from 'zustand';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; kind: ToastKind; message: string };

type ToastStore = {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
};

let nextId = 1;

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      3500,
    );
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(kind: ToastKind, message: string) {
  useToastStore.getState().push(kind, message);
}

const tone: Record<ToastKind, string> = {
  success: 'border-accent text-accent',
  error: 'border-danger text-danger',
  info: 'border-border text-text',
};

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            className={`rounded-md border bg-surface px-4 py-2 text-sm shadow-subtle-md ${tone[t.kind]}`}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
