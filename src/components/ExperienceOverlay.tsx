import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export type Stage = 'intro' | 'loading' | 'blow' | 'raise' | 'draw' | 'experience' | 'error';

type Props = {
  stage: Stage;
  hasMist: boolean;
  error: string;
  gesture: 'IDLE' | 'DRAWING';
  showGesture: boolean;
  whisper: string;
  onEnable: () => void;
};

export function ExperienceOverlay({ stage, hasMist, error, gesture, showGesture, whisper, onEnable }: Props) {
  const copyRef = useRef<HTMLDivElement>(null);
  const phrases: Partial<Record<Stage, string>> = {
    loading: 'hush.',
    blow: hasMist ? 'again...' : 'blow gently.',
    raise: 'raise your finger.',
    draw: 'draw me something.',
    error: 'try again.',
  };
  const phrase = phrases[stage];

  useEffect(() => {
    if (!copyRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tween = gsap.fromTo(copyRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.9, ease: 'power2.out' });
    return () => { tween.kill(); };
  }, [stage, phrase]);

  return (
    <>
      {stage !== 'experience' && (
        <div className="experience-copy" ref={copyRef} key={`${stage}-${phrase}`}>
          {stage === 'intro' ? (
            <>
              <h1>blurr.</h1>
              <p>come a little closer.</p>
            </>
          ) : (
            <>
              <h2>{phrase}</h2>
              {stage === 'error' && <p className="error-copy">{error}</p>}
            </>
          )}
          {(stage === 'intro' || stage === 'error') && (
            <button className="permission-button" onClick={onEnable}>enable camera + mic</button>
          )}
          {stage === 'intro' && <small>camera + mic stay on your device.</small>}
        </div>
      )}
      {(stage === 'draw' || stage === 'experience') && whisper && <div className="experience-whisper" aria-live="polite">{whisper}</div>}
      {stage === 'experience' && <span className="quiet-brand" aria-hidden="true">blurr.</span>}
      {stage !== 'intro' && stage !== 'loading' && stage !== 'error' && showGesture && (
        <div className="gesture-indicator" aria-live="polite">{gesture === 'DRAWING' ? 'draw' : 'idle'}</div>
      )}
    </>
  );
}
