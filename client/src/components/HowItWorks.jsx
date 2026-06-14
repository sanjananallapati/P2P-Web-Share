/*
 * A real three-step sequence, so the numbering actually encodes order rather
 * than decorating the section. Kept terse; the product already demonstrates
 * itself above this.
 */

const STEPS = [
  {
    n: '01',
    title: 'Drop a file',
    body: 'Your browser reads it locally and opens a private room. The file never leaves your machine yet — nothing is uploaded.',
  },
  {
    n: '02',
    title: 'Share the link',
    body: 'Send the room link to one person. A tiny signaling server introduces the two browsers, then steps out of the way.',
  },
  {
    n: '03',
    title: 'It beams across',
    body: 'The browsers connect directly over WebRTC. Chunks stream peer-to-peer, each hash-checked, and auto-download on arrival.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto w-full max-w-5xl scroll-mt-8 px-5 py-14 sm:py-20">
      <div className="eyebrow mb-2">How it works</div>
      <h2 className="mb-10 max-w-2xl font-display text-2xl font-semibold text-bone sm:text-3xl">
        No upload, no middle-man storage. Just one browser handing a file to another.
      </h2>

      <div className="grid gap-px overflow-hidden rounded-2xl border border-ink-500 bg-ink-500 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="bg-ink-700/60 p-6">
            <div className="mb-4 font-mono text-sm text-ember">{s.n}</div>
            <h3 className="mb-2 font-display text-lg font-semibold text-bone">
              {s.title}
            </h3>
            <p className="text-sm leading-relaxed text-mist">{s.body}</p>
          </div>
        ))}
      </div>

      {/* security model — the substance behind the claims */}
      <div className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-ink-500 bg-ink-500 md:grid-cols-2">
        <Note
          title="The server is blind"
          body="Signaling only swaps connection details to introduce the peers. File bytes travel on the direct channel, so the server can't read, store, or even see them."
        />
        <Note
          title="Integrity, then confidence"
          body="Every chunk carries a SHA-256 tag that's re-checked on arrival. At the end, a fingerprint of all chunk hashes is compared end-to-end — proof the file is identical."
        />
        <Note
          title="Zero-knowledge by default"
          body="Chunks are AES-GCM encrypted in your browser. The key lives only in the link fragment, which browsers never transmit to the server."
        />
        <Note
          title="Built to survive churn"
          body="Backpressure keeps big files from drowning the channel, and self-describing chunks let a stalled transfer pick up from the last verified piece."
        />
      </div>
    </section>
  );
}

function Note({ title, body }) {
  return (
    <div className="bg-ink-700/60 p-6">
      <h3 className="mb-1.5 flex items-center gap-2 font-display text-base font-semibold text-bone">
        <span className="h-1.5 w-1.5 rounded-full bg-signal" />
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-mist">{body}</p>
    </div>
  );
}
