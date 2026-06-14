import { formatBytes, formatSpeed, formatEta } from '../lib/utils.js';

/*
 * The data layer. Live transfer numbers in JetBrains Mono with tabular figures
 * so they tick up without the layout shifting a pixel.
 */
export function Readouts({ progress }) {
  const p = progress || {
    bytes: 0,
    total: 0,
    chunks: 0,
    totalChunks: 0,
    speed: 0,
    pct: 0,
  };
  const remaining = Math.max(0, p.total - p.bytes);

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink-500 bg-ink-500 sm:grid-cols-4">
      <Cell label="Progress" value={`${p.pct.toFixed(1)}%`} accent="ember" />
      <Cell label="Speed" value={formatSpeed(p.speed)} />
      <Cell
        label="Transferred"
        value={formatBytes(p.bytes)}
        sub={`of ${formatBytes(p.total)}`}
      />
      <Cell
        label="ETA"
        value={formatEta(remaining, p.speed)}
        sub={`${p.chunks}/${p.totalChunks} chunks`}
      />
    </div>
  );
}

function Cell({ label, value, sub, accent }) {
  const valueColor = accent === 'ember' ? 'text-ember' : 'text-bone';
  return (
    <div className="bg-ink-700 px-4 py-3">
      <div className="eyebrow mb-1.5">{label}</div>
      <div className={`tnum font-mono text-lg font-medium ${valueColor}`}>
        {value}
      </div>
      {sub && <div className="tnum mt-0.5 font-mono text-[11px] text-mist">{sub}</div>}
    </div>
  );
}
