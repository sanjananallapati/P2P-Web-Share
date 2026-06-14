export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-5xl px-5 py-10">
      <div className="flex flex-col items-center justify-between gap-4 border-t border-ink-500 pt-6 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-mist">
          <span className="font-display font-semibold text-bone">Beam</span>
          <span className="text-ink-500">·</span>
          <span>Files go peer-to-peer. Nothing is stored.</span>
        </div>
        <div className="font-mono text-xs text-mist">
          WebRTC · Web Crypto · Socket.io
        </div>
      </div>
    </footer>
  );
}
