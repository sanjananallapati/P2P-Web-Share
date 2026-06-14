import { useEffect, useState } from 'react';

/*
 * A tiny, dependency-free toast bus. Anywhere in the app can call
 * `toast('Copied', 'good')` without threading context through props; the
 * <Toaster/> mounted once at the root renders whatever comes through.
 */

const listeners = new Set();
let counter = 0;

export function toast(message, kind = 'info', ttl = 2600) {
  const item = { id: ++counter, message, kind, ttl };
  listeners.forEach((l) => l(item));
}

const KIND_STYLES = {
  good: 'border-signal/40 text-signal',
  bad: 'border-alert/50 text-alert',
  info: 'border-ink-500 text-bone',
};

export function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onToast = (item) => {
      setItems((prev) => [...prev, item]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== item.id));
      }, item.ttl);
    };
    listeners.add(onToast);
    return () => listeners.delete(onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-center gap-2 rounded-xl border bg-ink-700/95 px-4 py-2.5 text-sm shadow-panel backdrop-blur animate-fade-up ${
            KIND_STYLES[t.kind] || KIND_STYLES.info
          }`}
        >
          <span className="font-mono text-xs opacity-70">
            {t.kind === 'good' ? '✓' : t.kind === 'bad' ? '!' : '›'}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
