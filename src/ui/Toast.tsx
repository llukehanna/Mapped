export interface ToastMessage {
  text: string;
  tone: 'good' | 'info' | 'warn';
  seq: number;
}

/** One short message above the input; a new seq replays the entrance. */
export function Toast({ toast }: { toast: ToastMessage | null }) {
  if (!toast) return null;
  return (
    <div key={toast.seq} className={`toast glass ${toast.tone}`} role="status">
      {toast.text}
    </div>
  );
}
