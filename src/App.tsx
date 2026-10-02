import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { FogCanvas } from './lib/fog';
import type { HandTracker, HandState, CalibrationPhase } from './lib/hand';
import type { MouthTracker } from './vision/mouthTracker';
import { BlowDetector } from './audio/blowDetector';
import type { GlassSurfaceHandle } from './components/GlassSurface';
import { ExperienceOverlay, type Stage } from './components/ExperienceOverlay';
import { DebugPanel, type DebugPanelHandle } from './components/DebugPanel';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

const GlassSurface = lazy(async () => ({ default: (await import('./components/GlassSurface')).GlassSurface }));

export default function App() {
  const canvasRef          = useRef<HTMLCanvasElement>(null);
  const glassRef           = useRef<GlassSurfaceHandle>(null);
  const videoRef           = useRef<HTMLVideoElement>(null);
  const debugVideoRef      = useRef<HTMLVideoElement>(null);
  const debugCanvasRef     = useRef<HTMLCanvasElement>(null);
  const debugCursorRef     = useRef<HTMLCanvasElement>(null); // fingertip overlay
  const debugPanelRef      = useRef<DebugPanelHandle>(null);
  const debugLastAtRef     = useRef(0);
  const debugFramesRef     = useRef(0);
  const debugHandRef       = useRef<HandState | null>(null);
  const fogRef             = useRef<FogCanvas | null>(null);
  const trackerRef         = useRef<HandTracker | null>(null);
  const mouthRef           = useRef<MouthTracker | null>(null);
  const breathRef          = useRef<BlowDetector | null>(null);
  const streamRef          = useRef<MediaStream | null>(null);
  const startupRef         = useRef(0);
  const stageRef           = useRef<Stage>('intro');
  const lastPointRef       = useRef(false);
  const lastWipeRef        = useRef(false);
  const revealAtRef        = useRef(0);
  const lastFrameRef       = useRef(0);
  const webglReadyRef      = useRef(false);
  const firstDrawShownRef  = useRef(false);
  const artistShownRef     = useRef(false);
  const idleShownRef       = useRef(false);
  const lastActivityRef    = useRef(0);
  const lastHandAtRef      = useRef(0);
  const totalDrawMsRef     = useRef(0);
  const whisperRef         = useRef('');
  const whisperUntilRef    = useRef(0);
  const hasMistRef         = useRef(false);
  const touchStateRef      = useRef<'HOVER' | 'TOUCHING_GLASS' | 'NO_HAND'>('NO_HAND');

  const [stage, setStage]             = useState<Stage>('intro');
  const [touchState, setTouchState]   = useState<'HOVER' | 'TOUCHING_GLASS' | 'NO_HAND'>('NO_HAND');
  const [showGesture, setShowGesture] = useState(true);
  const [error, setError]             = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [webglReady, setWebglReady]   = useState(false);
  const [hasMist, setHasMist]         = useState(false);
  const [whisper, setWhisper]         = useState('');

  const debug = import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug');

  const onWebglReady = useCallback((ready: boolean) => {
    webglReadyRef.current = ready;
    setWebglReady(ready);
  }, []);

  const showWhisper = (message: string, now: number, duration = 2400) => {
    whisperRef.current    = message;
    whisperUntilRef.current = now + duration;
    setWhisper(message);
  };

  // Draw debug landmark skeleton onto the small landmark canvas
  const drawDebugLandmarks = (landmarks: NormalizedLandmark[] | null, video: HTMLVideoElement) => {
    const canvas = debugCanvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const width  = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    if (!landmarks) return;
    const scale   = Math.max(width / video.videoWidth, height / video.videoHeight);
    const offsetX = (width  - video.videoWidth  * scale) / 2;
    const offsetY = (height - video.videoHeight * scale) / 2;
    const position = (p: NormalizedLandmark) => ({
      x: width - (offsetX + p.x * video.videoWidth  * scale),
      y:          offsetY + p.y * video.videoHeight * scale,
    });
    ctx.strokeStyle = 'rgba(227,249,220,.65)';
    ctx.lineWidth   = 1;
    for (const chain of [[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20]]) {
      ctx.beginPath();
      chain.forEach((id, i) => {
        const pt = position(landmarks[id]);
        if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    }
    for (const [index, lm] of landmarks.entries()) {
      const pt = position(lm);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, index === 8 ? 4 : 2, 0, Math.PI * 2);
      ctx.fillStyle = index === 8 ? '#f4f8ca' : '#d9f1d7';
      ctx.fill();
    }
  };

  // Draw the green/red fingertip cursor on the full-screen overlay canvas
  const drawDebugCursor = (hand: HandState | null) => {
    const canvas = debugCursorRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!hand?.visible) return;
    const x       = hand.x * canvas.width;
    const y       = hand.y * canvas.height;
    const color   = hand.state === 'TOUCHING_GLASS' ? '#ff4444' : '#44ff88';
    const label   = hand.state === 'TOUCHING_GLASS' ? 'TOUCHING' : 'HOVER';
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.font         = '11px monospace';
    ctx.fillStyle    = color;
    ctx.fillText(label, x + 18, y + 4);
  };

  const changeStage = (next: Stage) => {
    if (stageRef.current === next) return;
    stageRef.current = next;
    setStage(next);
  };

  const onCalibrationPhase = useCallback((phase: CalibrationPhase) => {
    if (phase === 'done') {
      // Calibration finished — advance to blow stage if not already past it
      if (stageRef.current === 'calibrate') changeStage('blow');
    }
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const fog = new FogCanvas(canvasRef.current);
    fogRef.current = fog;
    const resize = () => {
      fog.resize();
      // keep debug cursor canvas in sync
      const cursor = debugCursorRef.current;
      if (cursor) {
        cursor.width  = window.innerWidth;
        cursor.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', resize);

    let frame = 0;
    const tick = (now: number) => {
      const dt    = lastFrameRef.current ? Math.min(60, now - lastFrameRef.current) : 16;
      lastFrameRef.current = now;

      const hand = trackerRef.current?.update(now);
      if (mouthRef.current && videoRef.current) {
        glassRef.current?.setBreathCenter(mouthRef.current.update(videoRef.current, now));
      }
      const interacting = !!(hand?.visible && (hand.touching || hand.wiping))
        || (hand === null && (lastPointRef.current || lastWipeRef.current) && now - lastHandAtRef.current < 250);
      glassRef.current?.setDrawing(interacting);

      // --- breath ---
      const blow    = breathRef.current?.update(now);
      const breath  = blow?.blowStrength ?? 0;
      if (!interacting && breath > 0.03) {
        fog.setIntensity(fog.intensity + breath * dt * 0.001);
        fog.refog(breath * dt * 0.004);
        lastActivityRef.current = now;
        idleShownRef.current    = false;
        if (whisperRef.current) showWhisper('', now, 0);
      } else if (fog.intensity > 0) {
        fog.setIntensity(fog.intensity - dt * 0.0000007);
      }
      if (!interacting) glassRef.current?.addBreath(breath, dt, blow?.blowDuration ?? 0);

      if (fog.intensity > 0.04 && !hasMistRef.current) {
        hasMistRef.current = true;
        setHasMist(true);
      }
      if (stageRef.current === 'blow' && fog.intensity > 0.18) changeStage('raise');

      // debug cursor (always, even without fog)
      if (debug) drawDebugCursor(hand ?? null);

      if (hand) glassRef.current?.setFingertip(hand.visible ? hand : null, hand.state === 'TOUCHING_GLASS');

      // debug panel update (throttled)
      if (debug) {
        if (!debugLastAtRef.current) debugLastAtRef.current = now;
        debugFramesRef.current++;
        if (hand) debugHandRef.current = hand.visible ? hand : null;
        const elapsed = now - debugLastAtRef.current;
        if (elapsed >= 250) {
          const tracked = debugHandRef.current;
          debugPanelRef.current?.update({
            fps:          debugFramesRef.current * 1000 / elapsed,
            volume:       blow?.volume       ?? 0,
            blowStrength: breath,
            blowDuration: blow?.blowDuration ?? 0,
            isBlowing:    blow?.isBlowing    ?? false,
            handDetected: !!tracked,
            handScale:    tracked?.handScale ?? 0,
            proximity:    tracked?.proximity ?? 0,
            touchState:   tracked ? tracked.state : 'NO_HAND',
            fingerX:      tracked?.x ?? null,
            fingerY:      tracked?.y ?? null,
          });
          debugFramesRef.current  = 0;
          debugLastAtRef.current  = now;
        }
      }

      // --- touch state UI ---
      if (hand?.visible) {
        lastActivityRef.current = now;
        idleShownRef.current    = false;
        const next = hand.state as 'HOVER' | 'TOUCHING_GLASS';
        if (next !== touchStateRef.current) {
          touchStateRef.current = next;
          setTouchState(next);
        }
      } else if (hand && !hand.visible) {
        if (touchStateRef.current !== 'NO_HAND') {
          touchStateRef.current = 'NO_HAND';
          setTouchState('NO_HAND');
        }
      }

      // --- drawing: only when TOUCHING_GLASS and fog exists ---
      if (hand?.visible && hand.wiping && fog.intensity > 0.03) {
        glassRef.current?.wipeAt(hand, hand.wipeRadius, now, lastWipeRef.current);
        fog.addWipePoint(hand.x, hand.y, now, lastWipeRef.current, hand.wipeRadius * window.innerHeight);
        lastWipeRef.current = true;
        lastPointRef.current = false;
      } else if (hand?.visible && hand.touching && fog.intensity > 0.03) {
        totalDrawMsRef.current += lastHandAtRef.current ? Math.min(100, now - lastHandAtRef.current) : 0;
        glassRef.current?.drawAt(hand, now, lastPointRef.current);
        fog.addPoint(hand.x, hand.y, now, lastPointRef.current);
        lastPointRef.current = true;
        lastWipeRef.current = false;

        if (stageRef.current === 'raise') {
          changeStage('draw');
          revealAtRef.current = now;
        }
        if (stageRef.current === 'draw' && now - revealAtRef.current > 1800) changeStage('experience');
        if (now - revealAtRef.current > 5200) setShowGesture(false);

        if (!firstDrawShownRef.current && totalDrawMsRef.current > 950) {
          firstDrawShownRef.current = true;
          showWhisper('cute.', now);
        } else if (!artistShownRef.current && totalDrawMsRef.current > 20000) {
          artistShownRef.current = true;
          showWhisper('okay artist.', now);
        }
      } else if (hand) {
        lastPointRef.current = false;
        lastWipeRef.current = false;
      }

      if (hand) lastHandAtRef.current = now;

      if (whisperRef.current && now > whisperUntilRef.current) showWhisper('', now, 0);
      if (stageRef.current === 'experience' && !idleShownRef.current && now - lastActivityRef.current > 45000) {
        idleShownRef.current = true;
        showWhisper('still there?', now, 4500);
      }

      if (!webglReadyRef.current) fog.render(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      startupRef.current++;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      streamRef.current?.getTracks().forEach(t => t.stop());
      trackerRef.current?.close();
      mouthRef.current?.close();
      void breathRef.current?.close();
    };
  }, []);

  async function enable() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser needs a secure connection and camera/microphone support. Open the site on HTTPS or localhost.');
      changeStage('error');
      return;
    }
    const startup = ++startupRef.current;
    const stale   = () => startup !== startupRef.current;
    changeStage('loading');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (stale()) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('Mirror closed before the camera started');
      video.srcObject = stream;
      await video.play();
      if (stale()) return;
      setCameraReady(true);
      if (debugVideoRef.current) {
        debugVideoRef.current.srcObject = stream;
        void debugVideoRef.current.play().catch(() => undefined);
      }
      // init debug cursor canvas size
      if (debugCursorRef.current) {
        debugCursorRef.current.width  = window.innerWidth;
        debugCursorRef.current.height = window.innerHeight;
      }
      const breath = new BlowDetector(stream);
      breathRef.current = breath;
      await breath.resume();
      if (stale()) return;

      const { HandTracker: Tracker } = await import('./lib/hand');
      if (stale()) return;
      const tracker = await Tracker.create(
        video,
        debug ? drawDebugLandmarks : undefined,
        onCalibrationPhase,
      );
      if (stale()) { tracker.close(); return; }
      trackerRef.current = tracker;
      void import('./vision/mouthTracker').then(({ MouthTracker: Tracker }) => Tracker.create()).then(face => {
        if (stale()) face.close();
        else mouthRef.current = face;
      }).catch(cause => console.warn('Mouth tracking unavailable; breath stays centered.', cause));
      // Enter calibrate stage — wait for user to show their hand
      changeStage('calibrate');
    } catch (cause) {
      if (stale()) return;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      if (debugVideoRef.current) debugVideoRef.current.srcObject = null;
      setCameraReady(false);
      await breathRef.current?.close();
      breathRef.current = null;
      const name = cause instanceof DOMException ? cause.name : '';
      setError(
        name === 'NotAllowedError' ? 'Camera or microphone access was denied. Allow both in your browser settings, then try again.'
        : name === 'NotFoundError' ? 'A camera and microphone are both needed. Connect them, then try again.'
        : 'The camera, microphone, or hand model could not start. Check your connection and try again.',
      );
      changeStage('error');
    }
  }

  return (
    <main className={`experience stage-${stage}`}>
      <div className="room" aria-hidden="true">
        <div className="room-light" />
        <div className="room-shape room-shape-a" />
        <div className="room-shape room-shape-b" />
      </div>
      <video
        ref={videoRef}
        className={`mirror-video${cameraReady ? ' is-live' : ''}${webglReady ? ' v2-hidden' : ''}`}
        muted playsInline autoPlay aria-hidden="true"
      />
      <div className="mirror-shade" aria-hidden="true" />
      <Suspense fallback={null}>
        <GlassSurface ref={glassRef} debug={debug} onReady={onWebglReady} video={videoRef} />
      </Suspense>
      <canvas
        ref={canvasRef}
        className={`fog-canvas${webglReady ? ' is-fallback-hidden' : ''}`}
        aria-label="Condensation on the mirror"
      />
      <div className="glass-grain" aria-hidden="true" />

      {/* debug overlays */}
      {debug && <canvas ref={debugCursorRef} className="debug-cursor" aria-hidden="true" />}
      {debug && <video ref={debugVideoRef} className="camera-preview" muted playsInline autoPlay aria-hidden="true" />}
      {debug && <canvas ref={debugCanvasRef} className="landmark-preview" width="190" height="143" aria-hidden="true" />}
      {debug && <DebugPanel ref={debugPanelRef} />}

      <ExperienceOverlay
        stage={stage}
        hasMist={hasMist}
        error={error}
        touchState={touchState}
        showGesture={showGesture}
        whisper={whisper}
        onEnable={enable}
      />
    </main>
  );
}
