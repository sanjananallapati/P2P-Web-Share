/*
 * A compact status pill. The colour is meaning, not decoration:
 *   teal  = secure / connected / done
 *   ember = in progress / waiting
 *   red   = dropped / error
 */

const MAP = {
  idle: { label: 'Ready', tone: 'mist', pulse: false },
  armed: { label: 'Waiting for peer', tone: 'ember', pulse: true },
  joining: { label: 'Joining room', tone: 'ember', pulse: true },
  linking: { label: 'Connecting', tone: 'ember', pulse: true },
  live: { label: 'Connected', tone: 'signal', pulse: false },
  transferring: { label: 'Transferring', tone: 'ember', pulse: true },
  done: { label: 'Complete', tone: 'signal', pulse: false },
  dropped: { label: 'Disconnected', tone: 'alert', pulse: false },
  error: { label: 'Error', tone: 'alert', pulse: false },
};

const DOT = {
  mist: 'bg-mist',
  ember: 'bg-ember',
  signal: 'bg-signal',
  alert: 'bg-alert',
};

const TEXT = {
  mist: 'text-mist',
  ember: 'text-ember',
  signal: 'text-signal',
  alert: 'text-alert',
};

export function StatusBadge({ phase }) {
  const s = MAP[phase] || MAP.idle;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-ink-500 bg-ink-700/70 px-3 py-1.5">
      <span className="relative flex h-2 w-2">
        {s.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${DOT[s.tone]}`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${DOT[s.tone]}`} />
      </span>
      <span className={`font-mono text-[11px] uppercase tracking-wider ${TEXT[s.tone]}`}>
        {s.label}
      </span>
    </span>
  );
}
