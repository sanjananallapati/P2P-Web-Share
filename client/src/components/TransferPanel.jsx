import { Channel } from './Channel.jsx';
import { Readouts } from './Readouts.jsx';
import { StatusBadge } from './StatusBadge.jsx';
import { formatBytes, shortHash, fileKind } from '../lib/utils.js';

/*
 * The live surface during and after a transfer. It leads with the channel
 * (the signature), shows the data readouts while bytes move, and resolves into
 * a clear verified/failed end-state with the next action.
 */
export function TransferPanel({
  phase,
  role,
  file,
  meta,
  progress,
  result,
  sentFingerprint,
  encrypted,
  onCancel,
  onReset,
  canStreamToDisk,
  chooseDisk,
  diskChosen,
  error,
}) {
  const subject = role === 'send' ? file : meta;
  const pct = progress?.pct ?? (phase === 'done' ? 100 : 0);
  const active = phase === 'transferring';
  const done = phase === 'done';
  const broken = phase === 'dropped' || phase === 'error';

  return (
    <div className="animate-fade-up space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {subject ? (
            <>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink-500 bg-ink-800">
                <span className="font-mono text-[10px] font-semibold uppercase text-ember">
                  {fileKind(subject.name).slice(0, 4)}
                </span>
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-bone">
                  {subject.name}
                </div>
                <div className="tnum font-mono text-xs text-mist">
                  {formatBytes(subject.size)}
                  {role === 'receive' && meta?.encrypted ? ' · encrypted' : ''}
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-mist">
              {role === 'receive' ? 'Waiting for the sender…' : 'Preparing…'}
            </div>
          )}
        </div>
        <StatusBadge phase={phase} />
      </div>

      {/* the channel */}
      <div className="panel px-4 py-6 sm:px-8">
        <Channel phase={phase} pct={pct} role={role} encrypted={encrypted} />
      </div>

      {/* live numbers */}
      {(active || done) && <Readouts progress={progress} />}

      {/* large-file: offer streaming to disk before bytes arrive */}
      {canStreamToDisk && !diskChosen && (
        <button
          type="button"
          onClick={chooseDisk}
          className="w-full rounded-xl border border-ink-500 bg-ink-700/50 px-4 py-3 text-sm text-mist transition-colors hover:border-mist/50 hover:text-bone"
        >
          Receiving something large? <span className="text-bone">Stream straight to disk →</span>
        </button>
      )}
      {diskChosen && (
        <div className="rounded-xl border border-signal/30 bg-signal/10 px-4 py-2.5 text-xs text-signal">
          Streaming to disk — the file is written as it arrives, not held in memory.
        </div>
      )}

      {/* end states */}
      {done && <DoneCard role={role} result={result} sentFingerprint={sentFingerprint} onReset={onReset} />}
      {broken && <BrokenCard phase={phase} error={error} onReset={onReset} />}

      {/* cancel while in flight */}
      {active && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-mist underline decoration-mist/30 underline-offset-4 transition-colors hover:text-alert"
          >
            Cancel transfer
          </button>
        </div>
      )}
    </div>
  );
}

function DoneCard({ role, result, sentFingerprint, onReset }) {
  const fingerprint = role === 'receive' ? result?.fingerprint : sentFingerprint;
  const verified = role === 'receive' ? result?.verified : true;
  const savedToDisk = role === 'receive' && result?.savedToDisk;

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-start gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-signal/40 bg-signal/15">
          <CheckGlyph />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-semibold text-bone">
            {role === 'receive'
              ? savedToDisk
                ? 'Saved to your device'
                : 'Downloaded'
              : 'File sent'}
          </div>
          <p className="mt-0.5 text-sm text-mist">
            {role === 'receive'
              ? verified
                ? 'Every chunk passed its hash check and the transfer fingerprint matched the sender. The file is bit-for-bit identical.'
                : 'The file arrived, but the transfer fingerprint did not match the sender. Treat it with caution.'
              : 'All chunks were delivered and acknowledged. The receiver verifies integrity independently on their end.'}
          </p>

          {fingerprint && (
            <div className="mt-3 flex items-center gap-2">
              <span className="eyebrow">Fingerprint</span>
              <code
                className={`tnum rounded-md border px-2 py-1 font-mono text-xs ${
                  verified
                    ? 'border-signal/30 bg-signal/10 text-signal'
                    : 'border-alert/40 bg-alert/10 text-alert'
                }`}
                title={fingerprint}
              >
                {shortHash(fingerprint, 10, 8)}
              </code>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-ink-500 bg-ink-800/50 px-5 py-3">
        <button
          type="button"
          onClick={onReset}
          className="text-sm font-medium text-signal transition-colors hover:text-bone"
        >
          {role === 'receive' ? 'Send a file of your own →' : 'Send another file →'}
        </button>
      </div>
    </div>
  );
}

function BrokenCard({ phase, error, onReset }) {
  const isError = phase === 'error';
  const body =
    error ||
    (isError
      ? 'Something interrupted the transfer before it finished. Nothing partial was saved.'
      : 'The connection dropped before the transfer completed. Your data is fine — nothing half-written was kept.');
  return (
    <div className="panel overflow-hidden border-alert/30">
      <div className="flex items-start gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-alert/40 bg-alert/15">
          <span className="font-mono text-lg text-alert">!</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-semibold text-bone">
            {isError ? 'Transfer stopped' : 'The other side disconnected'}
          </div>
          <p className="mt-0.5 text-sm text-mist">{body}</p>
        </div>
      </div>
      <div className="border-t border-ink-500 bg-ink-800/50 px-5 py-3">
        <button
          type="button"
          onClick={onReset}
          className="text-sm font-medium text-bone transition-colors hover:text-signal"
        >
          Start over →
        </button>
      </div>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12.5 L10 17.5 L19 7"
        fill="none"
        stroke="#34E5C4"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
