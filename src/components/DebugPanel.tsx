import { forwardRef, useImperativeHandle, useRef } from 'react';

export type DebugSnapshot = {
  fps:          number;
  volume:       number;
  blowStrength: number;
  blowDuration: number;
  isBlowing:    boolean;
  handDetected: boolean;
  handScale:    number;
  proximity:    number;
  touchState:   'HOVER' | 'TOUCHING_GLASS' | 'NO_HAND';
  fingerX:      number | null;
  fingerY:      number | null;
};

export type DebugPanelHandle = { update: (snapshot: DebugSnapshot) => void };

export const DebugPanel = forwardRef<DebugPanelHandle>(function DebugPanel(_, ref) {
  const textRef = useRef<HTMLPreElement>(null);
  useImperativeHandle(ref, () => ({
    update(s) {
      if (!textRef.current) return;
      const finger = s.fingerX === null || s.fingerY === null
        ? '—'
        : `${s.fingerX.toFixed(2)}, ${s.fingerY.toFixed(2)}`;
      textRef.current.textContent = [
        `fps            ${s.fps.toFixed(0)}`,
        `volume         ${s.volume.toFixed(3)}`,
        `blow strength  ${s.blowStrength.toFixed(2)}`,
        `blowing        ${s.isBlowing ? 'yes' : 'no'}`,
        `duration       ${s.blowDuration.toFixed(0)} ms`,
        `─────────────────────────`,
        `hand detected  ${s.handDetected ? 'YES' : 'NO'}`,
        `hand scale     ${s.handScale.toFixed(3)}`,
        `proximity      ${s.proximity.toFixed(2)}`,
        `state          ${s.touchState}`,
        `finger         ${finger}`,
      ].join('\n');
    },
  }), []);
  return <pre ref={textRef} className="debug-panel" aria-hidden="true" />;
});
