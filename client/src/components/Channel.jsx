import { useEffect, useState } from 'react';

/*
 * THE SIGNATURE ELEMENT.
 *
 * Two nodes and the wire between them. This isn't a decorative flourish bolted
 * onto a progress bar — it *is* the progress indicator. Data flows left
 * (sender) → right (receiver); the bright "delivery front" rides the wire to
 * exactly the percentage transferred, and discrete packets stream behind it.
 *
 * Colour carries state, consistently with the rest of the app:
 *   ember  = data in flight        teal = secure / connected / verified
 *   red    = the wire is broken (peer dropped or an error stopped us)
 *
 * Motion is additive. When the visitor prefers reduced motion we keep every
 * bit of meaning (colours, the front's position, the numeric percentage) and
 * simply stop the packets and pulses from moving.
 */

const W = 620;
const H = 220;
const LX = 150; // sender node x
const RX = 470; // receiver node x
const Y = 96; // wire height
const SPAN = RX - LX;

const C = {
  track: '#1E2733',
  ember: '#FF8A5B',
  signal: '#34E5C4',
  alert: '#FF5D6C',
  bone: '#E8EEF2',
  mist: '#8A99A8',
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

export function Channel({ phase, pct = 0, role = 'send', encrypted = true }) {
  const reduced = useReducedMotion();

  const connected = ['live', 'transferring', 'done'].includes(phase);
  const flowing = phase === 'transferring';
  const done = phase === 'done';
  const broken = phase === 'dropped' || phase === 'error';

  // Where the delivery front currently sits along the wire.
  const frontPct = done ? 100 : flowing ? pct : 0;
  const frontX = LX + (SPAN * frontPct) / 100;

  // Wire colour by state.
  const liveColor = done ? C.signal : flowing ? C.ember : C.signal;

  // Node labels depend on which side the local user is.
  const sending = role === 'send';
  const left = { you: sending, role: sending ? 'Sending' : 'Sender' };
  const right = { you: !sending, role: sending ? 'Receiver' : 'Receiving' };

  const topLabel = broken
    ? 'Connection lost'
    : done
      ? 'Transfer verified'
      : flowing
        ? `${encrypted ? 'Encrypted' : 'Direct'} channel — data in flight`
        : connected
          ? 'Secure channel open'
          : phase === 'armed'
            ? 'Waiting for the other browser'
            : 'Establishing direct connection';

  return (
    <div className="select-none">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${topLabel}. ${frontPct.toFixed(0)} percent transferred.`}
      >
        <defs>
          <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
          <radialGradient id="coreTeal" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7CFCE4" />
            <stop offset="100%" stopColor={C.signal} />
          </radialGradient>
        </defs>

        {/* top status text */}
        <text
          x={W / 2}
          y="40"
          textAnchor="middle"
          fontFamily='"JetBrains Mono", monospace'
          fontSize="13"
          letterSpacing="1"
          fill={broken ? C.alert : flowing ? C.ember : connected ? C.signal : C.mist}
        >
          {topLabel.toUpperCase()}
        </text>

        {/* --- the wire ------------------------------------------------- */}
        {/* base track */}
        <line x1={LX} y1={Y} x2={RX} y2={Y} stroke={C.track} strokeWidth="3" strokeLinecap="round" />

        {!broken && (
          <>
            {/* faint full-span guide once connected */}
            {connected && (
              <line
                x1={LX}
                y1={Y}
                x2={RX}
                y2={Y}
                stroke={liveColor}
                strokeOpacity="0.18"
                strokeWidth="3"
                strokeLinecap="round"
              />
            )}

            {/* the energized, delivered portion */}
            <line
              x1={LX}
              y1={Y}
              x2={done ? RX : frontX}
              y2={Y}
              stroke={liveColor}
              strokeWidth="3.5"
              strokeLinecap="round"
              filter="url(#soft)"
              opacity={connected ? 1 : 0}
            />
            <line
              x1={LX}
              y1={Y}
              x2={done ? RX : frontX}
              y2={Y}
              stroke={liveColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity={connected ? 1 : 0}
            />

            {/* pre-connection: dashed "searching" wire */}
            {!connected && (
              <line
                x1={LX}
                y1={Y}
                x2={RX}
                y2={Y}
                stroke={C.ember}
                strokeOpacity="0.7"
                strokeWidth="2"
                strokeDasharray="3 9"
                strokeLinecap="round"
                className={reduced ? '' : 'beam-march'}
              />
            )}

            {/* delivery front + flowing packets */}
            {flowing && (
              <>
                {/* leading head */}
                <circle cx={frontX} cy={Y} r="6" fill={C.ember} filter="url(#soft)" />
                <circle cx={frontX} cy={Y} r="3.5" fill={C.bone} />

                {/* packets streaming behind the front */}
                {!reduced &&
                  [0, 1, 2, 3, 4].map((i) => (
                    <circle
                      key={i}
                      cy={Y}
                      r="2.6"
                      fill={C.ember}
                      className="beam-packet"
                      style={{ animationDelay: `${i * 0.42}s` }}
                    />
                  ))}
              </>
            )}
          </>
        )}

        {/* broken wire: two ends with a gap */}
        {broken && (
          <>
            <line x1={LX} y1={Y} x2={W / 2 - 26} y2={Y} stroke={C.alert} strokeWidth="3" strokeLinecap="round" />
            <line x1={W / 2 + 26} y1={Y} x2={RX} y2={Y} stroke={C.alert} strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" />
            <path
              d={`M ${W / 2 - 12} ${Y - 9} L ${W / 2 + 6} ${Y} L ${W / 2 - 12} ${Y + 9}`}
              fill="none"
              stroke={C.alert}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}

        {/* --- nodes ---------------------------------------------------- */}
        <Node
          x={LX}
          label="You"
          showYou={left.you}
          role={left.role}
          lit
          color={broken ? C.alert : C.signal}
          reduced={reduced}
          active={flowing}
        />
        <Node
          x={RX}
          label="You"
          showYou={right.you}
          role={right.role}
          lit={connected}
          color={broken ? C.alert : done ? C.signal : connected ? C.signal : C.mist}
          reduced={reduced}
          active={flowing}
          check={done}
        />
      </svg>

      {/* component-scoped motion; frozen by the global reduced-motion rule */}
      <style>{`
        @keyframes beamMarch { to { stroke-dashoffset: -24; } }
        .beam-march { animation: beamMarch 1s linear infinite; }
        @keyframes beamPacket {
          0%   { transform: translateX(${LX}px); opacity: 0; }
          12%  { opacity: 1; }
          88%  { opacity: 1; }
          100% { transform: translateX(${RX}px); opacity: 0; }
        }
        .beam-packet {
          transform: translateX(${LX}px);
          animation: beamPacket 2.1s linear infinite;
        }
      `}</style>
    </div>
  );
}

function Node({ x, showYou, role, lit, color, reduced, active, check }) {
  return (
    <g>
      {/* glow when live */}
      {lit && (
        <circle
          cx={x}
          cy={Y}
          r="30"
          fill={color}
          opacity="0.12"
          className={active && !reduced ? 'beam-breathe' : ''}
        />
      )}
      {/* ring */}
      <circle
        cx={x}
        cy={Y}
        r="26"
        fill="#0D121A"
        stroke={color}
        strokeWidth={lit ? 2 : 1.5}
        strokeOpacity={lit ? 1 : 0.5}
      />
      {/* core */}
      {check ? (
        <path
          d={`M ${x - 9} ${Y} l 6 7 l 12 -14`}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <circle cx={x} cy={Y} r="8.5" fill={lit ? color : '#1E2733'} />
      )}

      {/* labels */}
      <text
        x={x}
        y={Y + 56}
        textAnchor="middle"
        fontFamily='"Space Grotesk", sans-serif'
        fontSize="15"
        fontWeight="600"
        fill={C.bone}
      >
        {showYou ? 'You' : role === 'Sender' ? 'Sender' : 'Peer'}
      </text>
      <text
        x={x}
        y={Y + 74}
        textAnchor="middle"
        fontFamily='"JetBrains Mono", monospace'
        fontSize="11"
        letterSpacing="0.5"
        fill={C.mist}
      >
        {role.toUpperCase()}
      </text>

      <style>{`
        @keyframes beamBreathe { 0%,100%{opacity:.1} 50%{opacity:.22} }
        .beam-breathe { animation: beamBreathe 2.2s ease-in-out infinite; }
      `}</style>
    </g>
  );
}
