import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { copyToClipboard, formatBytes, fileKind } from '../lib/utils.js';
import { toast } from './Toaster.jsx';

/*
 * Once a room exists, this is what the sender hands off: a link (key in the
 * fragment) and a QR for phone-to-laptop. We keep the QR on a light tile for
 * reliable scanning, and we say plainly that the key is in the link — the one
 * thing a user must understand to use this safely.
 */
export function ShareLink({ link, encrypted, file, onCancel }) {
  const [qr, setQr] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(link, {
      margin: 1,
      width: 320,
      color: { dark: '#0A0E14', light: '#E8EEF2' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [link]);

  const copy = async () => {
    const ok = await copyToClipboard(link);
    toast(ok ? 'Link copied' : 'Could not copy — select it manually', ok ? 'good' : 'bad');
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="animate-fade-up space-y-4">
      <div className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {/* QR */}
          <div className="mx-auto shrink-0 rounded-2xl bg-bone p-3 sm:mx-0">
            {qr ? (
              <img
                src={qr}
                alt="QR code linking to this transfer"
                width="148"
                height="148"
                className="block h-[148px] w-[148px] rounded-lg"
              />
            ) : (
              <div className="h-[148px] w-[148px] animate-pulse rounded-lg bg-ink-500/30" />
            )}
          </div>

          {/* link + actions */}
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="eyebrow mb-1.5">Share this link</div>
              <div className="flex items-stretch gap-2">
                <div className="min-w-0 flex-1 rounded-xl border border-ink-500 bg-ink-800 px-3 py-2.5">
                  <div className="tnum truncate font-mono text-sm text-bone" title={link}>
                    {link}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copy}
                  className="shrink-0 rounded-xl border border-signal/40 bg-signal/15 px-4 text-sm font-medium text-signal transition-colors hover:bg-signal/25"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-mist">
              {encrypted ? (
                <>
                  The decryption key is in the part after <span className="font-mono text-bone">#</span> —
                  browsers never send it to the signaling server, so only someone with this exact link can read the file.
                </>
              ) : (
                <>Anyone with this link can join the room and receive the file.</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* what's being sent */}
      {file && (
        <div className="flex items-center justify-between rounded-2xl border border-ink-500 bg-ink-700/50 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <FileBadge kind={fileKind(file.name)} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-bone">{file.name}</div>
              <div className="tnum font-mono text-xs text-mist">{formatBytes(file.size)}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 text-xs text-mist underline decoration-mist/30 underline-offset-4 transition-colors hover:text-alert"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function FileBadge({ kind }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink-500 bg-ink-800">
      <span className="font-mono text-[10px] font-semibold uppercase text-ember">
        {kind.slice(0, 4)}
      </span>
    </div>
  );
}
