import { useRef, useState } from 'react';
import { formatBytes } from '../lib/utils.js';
import { SOFT_SIZE_LIMIT } from '../config.js';
import { toast } from './Toaster.jsx';

/*
 * The send-side hero: drop a file here. Drag-over gives an unmistakable, calm
 * response (the frame lights teal) rather than a busy animation. The single
 * real "risk" on this page — encryption on by default — lives right under the
 * drop target so the security model is visible, not buried in settings.
 */
export function DropZone({ onFile, encrypted, onToggleEncrypted, busy }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  const handleFiles = (files) => {
    const file = files && files[0];
    if (!file) return;
    if (file.size === 0) {
      toast('That file is empty.', 'bad');
      return;
    }
    if (file.size > SOFT_SIZE_LIMIT) {
      toast(
        `${formatBytes(file.size)} is large — it'll work, but keep both tabs open.`,
        'info',
        3600
      );
    }
    onFile(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setOver(false);
    if (busy) return;
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="animate-fade-up">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`group relative flex w-full flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed px-6 py-16 text-center transition-all duration-200 sm:py-20 ${
          over
            ? 'border-signal bg-signal-glow shadow-signalglow'
            : 'border-ink-500 bg-ink-700/40 hover:border-mist/60 hover:bg-ink-700/70'
        } ${busy ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
      >
        <Inbound active={over} />

        <div className="space-y-1.5">
          <div className="font-display text-xl font-semibold text-bone">
            {over ? 'Release to beam it' : 'Drop a file to send'}
          </div>
          <div className="text-sm text-mist">
            or <span className="text-bone underline decoration-mist/40 underline-offset-4">browse</span> from your device
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="chip">Up to {formatBytes(SOFT_SIZE_LIMIT)} in memory</span>
          <span className="chip">Direct browser → browser</span>
          <span className="chip">Never uploaded to a server</span>
        </div>

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </button>

      {/* the one deliberate "setting", surfaced not hidden */}
      <div className="mt-3 flex items-center justify-between rounded-2xl border border-ink-500 bg-ink-700/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <LockGlyph on={encrypted} />
          <div>
            <div className="text-sm font-medium text-bone">
              End-to-end encryption
            </div>
            <div className="text-xs text-mist">
              {encrypted
                ? 'Each chunk is AES-GCM encrypted. The key rides the link, never the server.'
                : 'Chunks travel directly but unencrypted. Turn on for zero-knowledge transfer.'}
            </div>
          </div>
        </div>
        <Toggle on={encrypted} onChange={onToggleEncrypted} disabled={busy} />
      </div>
    </div>
  );
}

function Inbound({ active }) {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
      <circle
        cx="28"
        cy="28"
        r="25"
        fill="none"
        stroke={active ? '#34E5C4' : '#1E2733'}
        strokeWidth="2"
      />
      <path
        d="M28 17 L28 35 M20 28 L28 36 L36 28"
        fill="none"
        stroke={active ? '#34E5C4' : '#8A99A8'}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-transform duration-200 group-hover:translate-y-0.5"
      />
    </svg>
  );
}

function LockGlyph({ on }) {
  const c = on ? '#34E5C4' : '#8A99A8';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke={c} strokeWidth="1.8" />
      <path
        d={on ? 'M8 11 V8 a4 4 0 0 1 8 0 v3' : 'M8 11 V8 a4 4 0 0 1 7 -2.5'}
        fill="none"
        stroke={c}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="15.5" r="1.4" fill={c} />
    </svg>
  );
}

function Toggle({ on, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Toggle end-to-end encryption"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
        on ? 'border-signal/50 bg-signal/25' : 'border-ink-500 bg-ink-600'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span
        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all ${
          on ? 'left-[22px] bg-signal' : 'left-0.5 bg-mist'
        }`}
        style={{ height: '1.125rem', width: '1.125rem' }}
      />
    </button>
  );
}
