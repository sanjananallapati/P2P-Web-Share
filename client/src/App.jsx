import { useMemo } from 'react';
import { parseLocation } from './lib/links.js';
import { useBeam } from './hooks/useBeam.js';
import { TopBar } from './components/TopBar.jsx';
import { Footer } from './components/Footer.jsx';
import { Toaster } from './components/Toaster.jsx';
import { DropZone } from './components/DropZone.jsx';
import { ShareLink } from './components/ShareLink.jsx';
import { TransferPanel } from './components/TransferPanel.jsx';
import { HowItWorks } from './components/HowItWorks.jsx';

export default function App() {
  // Routing is a single read of the URL: a /r/<id> path means "receive".
  const location = useMemo(() => parseLocation(), []);
  const beam = useBeam(location);

  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      <main className="flex-1">
        {beam.role === 'send' ? (
          <SendView beam={beam} />
        ) : (
          <ReceiveView beam={beam} />
        )}
      </main>
      {beam.role === 'send' && beam.phase === 'idle' && <HowItWorks />}
      <Footer />
      <Toaster />
    </div>
  );
}

function Shell({ eyebrow, title, sub, children }) {
  return (
    <section className="mx-auto w-full max-w-2xl px-5 pb-10 pt-6 sm:pt-12">
      <div className="mb-7 text-center">
        <div className="eyebrow mb-3">{eyebrow}</div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-bone sm:text-[2.6rem] sm:leading-[1.1]">
          {title}
        </h1>
        {sub && <p className="mx-auto mt-3 max-w-md text-mist">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function SendView({ beam }) {
  const preparing = beam.phase === 'idle' || beam.phase === 'linking';
  const showLink = beam.phase === 'armed' || beam.phase === 'live';

  if (preparing) {
    return (
      <Shell
        eyebrow="Peer-to-peer file transfer"
        title="Send a file straight from your browser to theirs."
        sub="No upload, no account, no copy sitting on a server. A direct, encrypted line between two tabs."
      >
        <DropZone
          onFile={beam.selectFile}
          encrypted={beam.encrypted}
          onToggleEncrypted={beam.setEncrypted}
          busy={beam.phase === 'linking'}
        />
      </Shell>
    );
  }

  return (
    <Shell
      eyebrow={showLink ? 'Your beam is ready' : 'Beaming'}
      title={
        showLink
          ? beam.peerPresent
            ? 'Connecting to the other browser…'
            : 'Send this link to whoever’s receiving.'
          : 'Beaming it across.'
      }
      sub={
        showLink && !beam.peerPresent
          ? 'The transfer starts the moment they open it. Keep this tab open.'
          : undefined
      }
    >
      {showLink && (
        <div className="mb-4">
          <ShareLink
            link={beam.shareLink}
            encrypted={beam.encrypted}
            file={beam.file}
            onCancel={beam.reset}
          />
        </div>
      )}
      <TransferPanel
        phase={beam.phase}
        role="send"
        file={beam.file}
        progress={beam.progress}
        sentFingerprint={beam.sentFingerprint}
        encrypted={beam.encrypted}
        onCancel={beam.cancel}
        onReset={beam.reset}
        error={beam.error}
      />
    </Shell>
  );
}

function ReceiveView({ beam }) {
  const waiting = ['joining', 'linking', 'live'].includes(beam.phase) && !beam.meta;

  return (
    <Shell
      eyebrow="Incoming transfer"
      title={
        beam.phase === 'done'
          ? 'Here’s your file.'
          : beam.phase === 'error'
            ? 'Can’t join this transfer.'
            : waiting
              ? 'Connecting to the sender…'
              : 'Receiving your file.'
      }
      sub={
        waiting
          ? 'Linking your browser directly to theirs. This only takes a moment.'
          : undefined
      }
    >
      <TransferPanel
        phase={beam.phase}
        role="receive"
        meta={beam.meta}
        progress={beam.progress}
        result={beam.result}
        encrypted={beam.encrypted}
        onCancel={beam.cancel}
        onReset={beam.reset}
        canStreamToDisk={beam.canStreamToDisk}
        chooseDisk={beam.chooseDisk}
        diskChosen={beam.diskChosen}
        error={beam.error}
      />
    </Shell>
  );
}
