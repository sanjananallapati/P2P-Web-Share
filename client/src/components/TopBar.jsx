/** The brand bar. Quiet, fixed in tone — the work happens below it. */
export function TopBar() {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
      <a href="/" className="group flex items-center gap-2.5">
        <BeamMark />
        <span className="font-display text-lg font-semibold tracking-tight text-bone">
          Beam
        </span>
      </a>

      <nav className="flex items-center gap-5 text-sm text-mist">
        <a
          href="#how"
          className="hidden transition-colors hover:text-bone sm:inline"
        >
          How it works
        </a>
        <a
          href="https://github.com/"
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-1.5 transition-colors hover:text-bone"
        >
          <GitHubGlyph />
          <span className="hidden sm:inline">Source</span>
        </a>
      </nav>
    </header>
  );
}

/* The two-node beam glyph, echoing the favicon and the channel viz. */
function BeamMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <line
        x1="7"
        y1="13"
        x2="19"
        y2="13"
        stroke="#FF8A5B"
        strokeWidth="1.5"
        strokeDasharray="2 2.5"
      />
      <circle cx="7" cy="13" r="3.4" fill="#34E5C4" />
      <circle
        cx="19"
        cy="13"
        r="3.4"
        fill="none"
        stroke="#34E5C4"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function GitHubGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
