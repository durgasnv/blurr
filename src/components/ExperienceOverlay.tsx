import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export type Stage = 'intro' | 'loading' | 'blow' | 'calibrate' | 'raise' | 'draw' | 'experience' | 'error';

type Props = {
  stage:       Stage;
  hasMist:     boolean;
  error:       string;
  loadingMessage: string;
  touchState:  'HOVER' | 'TOUCHING_GLASS' | 'NO_HAND';
  showGesture: boolean;
  whisper:     string;
  onEnable:    () => void;
};

export function ExperienceOverlay({ stage, hasMist, error, loadingMessage, touchState, showGesture, whisper, onEnable }: Props) {
  const copyRef = useRef<HTMLDivElement>(null);

  const phrases: Partial<Record<Stage, string>> = {
    loading:   'hush.',
    calibrate: 'show me your hand.',
    blow:      hasMist ? 'again...' : 'blow gently.',
    raise:     'come closer.',
    draw:      'draw me something.',
    error:     'try again.',
  };
  const phrase = phrases[stage];
  const hints: Partial<Record<Stage, string>> = {
    loading: loadingMessage,
    calibrate: 'Hold your open hand at a comfortable distance for one second in good light.',
    blow: 'Blow steadily toward your microphone to mist the glass.',
    raise: 'Point your index finger and move it through the air to draw.',
    draw: 'Move your finger to draw. Blow again to fog over your drawing. Hold an open palm toward the camera to clear the glass.',
  };

  useEffect(() => {
    if (!copyRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tween = gsap.fromTo(copyRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.9, ease: 'power2.out' });
    return () => { tween.kill(); };
  }, [stage, phrase]);

  return (
    <>
      {stage !== 'experience' && (
        <div className="experience-copy" role="status" aria-live="polite" ref={copyRef} key={`${stage}-${phrase}`}>
          {stage === 'intro' ? (
            <>
              <h1>blurr.</h1>
              <p>come a little closer.</p>
            </>
          ) : (
            <>
              <h2>{phrase}</h2>
              {hints[stage] && <p className="stage-hint">{hints[stage]}</p>}
              {stage === 'error' && <p className="error-copy">{error}</p>}
            </>
          )}
          {(stage === 'intro' || stage === 'error') && (
            <button className="permission-button" onClick={onEnable}>enable camera + mic</button>
          )}
          {stage === 'intro' && <small>live camera + mic stay on your device. models download when you start.</small>}
        </div>
      )}
      {(stage === 'draw' || stage === 'experience') && whisper && <div className="experience-whisper" aria-live="polite">{whisper}</div>}
      {stage === 'experience' && <span className="quiet-brand" aria-hidden="true">blurr.</span>}
      {stage !== 'intro' && stage !== 'loading' && stage !== 'calibrate' && stage !== 'error' && showGesture && (
        <div className="gesture-indicator" aria-live="polite">
          {touchState === 'TOUCHING_GLASS' ? 'touching' : touchState === 'NO_HAND' ? 'show your hand' : 'hover'}
        </div>
      )}
    </>
  );
}
