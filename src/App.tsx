import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FogCanvas } from './lib/fog';
import type { HandTracker, HandState, CalibrationPhase } from './lib/hand';
import type { MouthTracker } from './vision/mouthTracker';
import { BlowDetector } from './audio/blowDetector';
import type { GlassSurfaceHandle } from './components/GlassSurface';
import { ExperienceOverlay, type Stage } from './components/ExperienceOverlay';
import { DebugPanel, type DebugPanelHandle } from './components/DebugPanel';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

const GlassSurface = lazy(async () => ({ default: (await import('./components/GlassSurface')).GlassSurface }));

// A failed optional renderer download must leave the video/Canvas mirror usable.
class RendererBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

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
  const audioContextRef = useRef<AudioContext | null>(null);
  const startupAbortRef = useRef<AbortController | null>(null);
  const startupRef         = useRef(0);
  const stageRef           = useRef<Stage>('intro');
  const lastPointRef       = useRef(false);
  const lastWipeRef        = useRef(false);
  const revealAtRef        = useRef(0);
  const lastFrameRef       = useRef(0);
  const webglReadyRef      = useRef(false);
  const gestureHiddenRef = useRef(false);
  const firstDrawShownRef  = useRef(false);
  const artistShownRef     = useRef(false);
  const idleShownRef       = useRef(false);
  const lastActivityRef    = useRef(0);
  const lastHandAtRef      = useRef(0);
  const totalDrawMsRef     = useRef(0);
  const whisperRef         = useRef('');
  const whisperUntilRef    = useRef(0);
  const hasMistRef         = useRef(false);
  const demoBreathRef      = useRef(false);
  const demoSinceRef       = useRef(0);
  const brushSizeRef       = useRef(15);
  const touchStateRef      = useRef<'HOVER' | 'TOUCHING_GLASS' | 'NO_HAND'>('NO_HAND');

  const [stage, setStage]             = useState<Stage>('intro');
  const [touchState, setTouchState]   = useState<'HOVER' | 'TOUCHING_GLASS' | 'NO_HAND'>('NO_HAND');
  const [showGesture, setShowGesture] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError]             = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [webglReady, setWebglReady]   = useState(false);
  const [hasMist, setHasMist]         = useState(false);
  const [whisper, setWhisper]         = useState('');
  const [brushSize, setBrushSize]     = useState(15);

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

  const saveFrame = () => {
    if (webglReadyRef.current) {
      glassRef.current?.savePng();
      return;
    }
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(window.innerWidth * pixelRatio);
    const height = Math.round(window.innerHeight * pixelRatio);
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const context = output.getContext('2d');
    if (!context) return;
    const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
    const drawnWidth = video.videoWidth * scale;
    const drawnHeight = video.videoHeight * scale;
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(video, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight);
    context.setTransform(1, 0, 0, 1, 0, 0);
    if (canvasRef.current) context.drawImage(canvasRef.current, 0, 0, width, height);
    const link = document.createElement('a');
    link.href = output.toDataURL('image/png');
    link.download = 'blurr.png';
    link.click();
  };

  const returnToStart = () => {
    startupRef.current++;
    startupAbortRef.current?.abort();
    startupAbortRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    trackerRef.current?.close();
    trackerRef.current = null;
    mouthRef.current?.close();
    mouthRef.current = null;
    void breathRef.current?.close();
    breathRef.current = null;
    if (audioContextRef.current?.state !== 'closed') void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (debugVideoRef.current) debugVideoRef.current.srcObject = null;
    demoBreathRef.current = false;
    demoSinceRef.current = 0;
    lastPointRef.current = false;
    lastWipeRef.current = false;
    firstDrawShownRef.current = false;
    artistShownRef.current = false;
    idleShownRef.current = false;
    hasMistRef.current = false;
    touchStateRef.current = 'NO_HAND';
    setTouchState('NO_HAND');
    totalDrawMsRef.current = 0;
    lastHandAtRef.current = 0;
    whisperRef.current = '';
    debugHandRef.current = null;
    fogRef.current?.clearDrawing();
    fogRef.current?.setIntensity(0);
    glassRef.current?.reset();
    setCameraReady(false);
    setError('');
    setHasMist(false);
    gestureHiddenRef.current = false;
    setShowGesture(true);
    setWhisper('');
    changeStage('intro');
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { returnToStart(); return; }
      if (!streamRef.current || event.ctrlKey || event.metaKey || event.altKey
        || event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement
        || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (!demoBreathRef.current) demoSinceRef.current = performance.now();
        demoBreathRef.current = true;
      } else if (!event.repeat && event.key.toLowerCase() === 'c') {
        fogRef.current?.clearDrawing();
        glassRef.current?.clearDrawing();
      } else if (!event.repeat && event.key.toLowerCase() === 's') {
        saveFrame();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') demoBreathRef.current = false;
    };
    const releaseDemo = () => { demoBreathRef.current = false; };
    const onPageHide = () => returnToStart();
    window.addEventListener('blur', releaseDemo);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let frame = 0;
    const tick = (now: number) => {
      const dt    = lastFrameRef.current ? Math.min(60, now - lastFrameRef.current) : 16;
      lastFrameRef.current = now;

      let hand: HandState | null | undefined;
      try {
        hand = trackerRef.current?.update(now);
      } catch (cause) {
        console.warn('Hand tracking stopped.', cause);
        returnToStart();
        setError('Hand tracking stopped. Enable the camera and microphone to try again.');
        changeStage('error');
      }
      if (mouthRef.current && videoRef.current) {
        try {
          glassRef.current?.setBreathCenter(mouthRef.current.update(videoRef.current, now));
        } catch (cause) {
          console.warn('Mouth tracking unavailable; breath stays centered.', cause);
          mouthRef.current.close();
          mouthRef.current = null;
          glassRef.current?.setBreathCenter({ x: 0.5, y: 0.52 });
        }
      }
      const canDraw = stageRef.current === 'raise' || stageRef.current === 'draw' || stageRef.current === 'experience';
      const interacting = canDraw && (!!(hand?.visible && (hand.touching || hand.wiping))
        || (hand === null && (lastPointRef.current || lastWipeRef.current) && now - lastHandAtRef.current < 250));
      glassRef.current?.setDrawing(interacting);

      // --- breath ---
      const blow    = breathRef.current?.update(now);
      const breath  = Math.max(blow?.blowStrength ?? 0, demoBreathRef.current ? 0.55 : 0);
      const blowDuration = demoBreathRef.current ? now - demoSinceRef.current : blow?.blowDuration ?? 0;
      if (!interacting && breath > 0.03) {
        fog.setIntensity(fog.intensity + breath * dt * 0.001);
        if (!webglReadyRef.current) fog.refog(breath * dt * 0.004);
        lastActivityRef.current = now;
        idleShownRef.current    = false;
        if (whisperRef.current) showWhisper('', now, 0);
      } else if (!webglReadyRef.current && !interacting && fog.intensity > 0) {
        fog.setIntensity(fog.intensity - dt * 0.0000007);
      }
      if (!interacting) glassRef.current?.addBreath(breath, dt, blowDuration);

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
      if (canDraw && hand?.visible && hand.wiping && fog.intensity > 0.03) {
        glassRef.current?.wipeAt(hand, hand.wipeRadius, now, lastWipeRef.current);
        if (!webglReadyRef.current) fog.addWipePoint(hand.x, hand.y, now, lastWipeRef.current, hand.wipeRadius * window.innerHeight);
        lastWipeRef.current = true;
        lastPointRef.current = false;
      } else if (canDraw && hand?.visible && hand.touching && fog.intensity > 0.03) {
        totalDrawMsRef.current += lastHandAtRef.current ? Math.min(100, now - lastHandAtRef.current) : 0;
        glassRef.current?.drawAt(hand, now, lastPointRef.current, brushSizeRef.current);
        if (!webglReadyRef.current) fog.addPoint(hand.x, hand.y, now, lastPointRef.current, brushSizeRef.current);
        lastPointRef.current = true;
        lastWipeRef.current = false;

        if (stageRef.current === 'raise') {
          changeStage('draw');
          revealAtRef.current = now;
        }
        if (stageRef.current === 'draw' && now - revealAtRef.current > 1800) changeStage('experience');
        if (!gestureHiddenRef.current && now - revealAtRef.current > 5200) {
          gestureHiddenRef.current = true;
          setShowGesture(false);
        }

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
      startupAbortRef.current?.abort();
      window.removeEventListener('blur', releaseDemo);
      window.removeEventListener('pagehide', onPageHide);
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      streamRef.current?.getTracks().forEach(t => t.stop());
      trackerRef.current?.close();
      mouthRef.current?.close();
      void breathRef.current?.close();
      if (audioContextRef.current?.state !== 'closed') void audioContextRef.current?.close().catch(() => undefined);
    };
  }, []);

  async function enable() {
    if (stageRef.current === 'loading') return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser needs a secure connection and camera/microphone support. Open the site on HTTPS or localhost.');
      changeStage('error');
      return;
    }
    const startup = ++startupRef.current;
    const stale   = () => startup !== startupRef.current;
    const controller = new AbortController();
    startupAbortRef.current = controller;
    setError('');
    changeStage('loading');
    setLoadingMessage('Allow camera and microphone access in your browser.');
    let startupStep = 'camera and microphone permissions';
    const timeout = window.setTimeout(() => {
      if (stale()) return;
      returnToStart();
      setError(`Timed out waiting for ${startupStep}. Check browser permissions and your connection, then try again.`);
      changeStage('error');
    }, 75000);
    controller.signal.addEventListener('abort', () => window.clearTimeout(timeout), { once: true });
    try {
      // Unlock audio during the click, before permission/video awaits consume user activation.
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const audioStarted = audioContext.resume();
      void audioStarted.catch(() => undefined);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (stale()) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      for (const track of stream.getTracks()) track.addEventListener('ended', () => {
        if (stale()) return;
        returnToStart();
        setError('The camera or microphone disconnected. Reconnect it, then try again.');
        changeStage('error');
      }, { once: true });
      const video = videoRef.current;
      if (!video) throw new Error('Mirror closed before the camera started');
      video.srcObject = stream;
      startupStep = 'the camera preview';
      setLoadingMessage('Starting your camera…');
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
      startupStep = 'microphone audio';
      setLoadingMessage('Starting your microphone…');
      const breath = new BlowDetector(stream, audioContext);
      breathRef.current = breath;
      await audioStarted;
      if (stale()) return;

      startupStep = 'the hand-tracking model';
      setLoadingMessage('Loading hand tracking. The first download may take a minute…');
      const { HandTracker: Tracker } = await import('./lib/hand');
      if (stale()) return;
      const tracker = await Tracker.create(
        video,
        debug ? drawDebugLandmarks : undefined,
        onCalibrationPhase,
        controller.signal,
      );
      if (stale()) { tracker.close(); return; }
      trackerRef.current = tracker;
      void import('./vision/mouthTracker').then(({ MouthTracker: Tracker }) => Tracker.create(controller.signal)).then(face => {
        if (stale()) face.close();
        else mouthRef.current = face;
      }).catch(cause => console.warn('Mouth tracking unavailable; breath stays centered.', cause));
      // Enter calibrate stage — wait for user to show their hand
      changeStage('calibrate');
    } catch (cause) {
      if (stale()) return;
      console.error(`Startup failed during ${startupStep}`, cause);
      returnToStart();
      const name = cause instanceof DOMException ? cause.name : '';
      setError(
        name === 'NotAllowedError' ? 'Camera or microphone access was denied. Allow both in your browser settings, then try again.'
        : name === 'NotReadableError' ? 'The camera or microphone is in use or unavailable. Close other camera apps, then try again.'
        : name === 'NotFoundError' ? 'A camera and microphone are both needed. Connect them, then try again.'
        : `Could not start ${startupStep}. Check your connection and try again.`,
      );
      changeStage('error');
    } finally {
      window.clearTimeout(timeout);
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
      <RendererBoundary>
        <Suspense fallback={null}>
          <GlassSurface ref={glassRef} debug={debug} onReady={onWebglReady} video={videoRef} />
        </Suspense>
      </RendererBoundary>
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
        loadingMessage={loadingMessage}
        touchState={touchState}
        showGesture={showGesture}
        whisper={whisper}
        onEnable={enable}
      />
      {stage !== 'intro' && stage !== 'error' && (
        <button className="stop-button" type="button" onClick={returnToStart}>
          {stage === 'loading' ? 'cancel' : 'stop camera + mic'}
        </button>
      )}
      {cameraReady && stage !== 'intro' && stage !== 'error' && (
        <>
          <label className="brush-control">
            <span>brush</span>
            <input type="range" min="7" max="38" value={brushSize}
              onChange={event => {
                const size = Number(event.currentTarget.value);
                brushSizeRef.current = size;
                setBrushSize(size);
              }} aria-label="brush size" />
          </label>
          <button className="shutter-button" type="button" aria-label="save mirror as PNG" title="save mirror"
            onClick={saveFrame}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7.5h3l1.5-2h7L17 7.5h3v11H4v-11Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="3.3" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        </>
      )}
    </main>
  );
}
