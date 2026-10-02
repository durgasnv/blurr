import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { HandGesture } from '../vision/gestures';

export type DebugSnapshot = {
  fps: number;
  volume: number;
  blowStrength: number;
  blowDuration: number;
  isBlowing: boolean;
  gesture: HandGesture | 'NO HAND';
  fingerX: number | null;
  fingerY: number | null;
};

export type DebugPanelHandle = { update: (snapshot: DebugSnapshot) => void };

export const DebugPanel = forwardRef<DebugPanelHandle>(function DebugPanel(_, ref) {
  const textRef = useRef<HTMLPreElement>(null);
  useImperativeHandle(ref, () => ({
    update(snapshot) {
      if (!textRef.current) return;
      const finger = snapshot.fingerX === null || snapshot.fingerY === null
        ? '—'
        : `${snapshot.fingerX.toFixed(2)}, ${snapshot.fingerY.toFixed(2)}`;
      textRef.current.textContent = [
        `fps            ${snapshot.fps.toFixed(0)}`,
        `volume         ${snapshot.volume.toFixed(3)}`,
        `blow strength  ${snapshot.blowStrength.toFixed(2)}`,
        `blowing        ${snapshot.isBlowing ? 'yes' : 'no'}`,
        `duration       ${snapshot.blowDuration.toFixed(0)} ms`,
        `gesture        ${snapshot.gesture.toLowerCase()}`,
        `finger         ${finger}`,
      ].join('\n');
    },
  }), []);
  return <pre ref={textRef} className="debug-panel" aria-hidden="true" />;
});
