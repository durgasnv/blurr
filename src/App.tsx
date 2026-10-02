import { useCallback, useEffect, useRef, useState } from 'react';
import { FogCanvas } from './lib/fog';
import { HandTracker, type HandState } from './lib/hand';
import { BlowDetector } from './audio/blowDetector';
import { GlassSurface, type GlassSurfaceHandle } from './components/GlassSurface';
import { ExperienceOverlay, type Stage } from './components/ExperienceOverlay';
import { DebugPanel, type DebugPanelHandle } from './components/DebugPanel';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

type Gesture = 'IDLE' | 'DRAWING';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glassRef = useRef<GlassSurfaceHandle>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const debugVideoRef = useRef<HTMLVideoElement>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);
  const debugPanelRef = useRef<DebugPanelHandle>(null);
  const debugLastAtRef = useRef(0);
  const debugFramesRef = useRef(0);
  const debugHandRef = useRef<HandState | null>(null);
  const fogRef = useRef<FogCanvas | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const breathRef = useRef<BlowDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startupRef = useRef(0);
  const stageRef = useRef<Stage>('intro');
  const lastPointRef = useRef(false);
  const revealAtRef = useRef(0);
  const lastFrameRef = useRef(0);
  const gestureRef = useRef<Gesture>('IDLE');
  const webglReadyRef = useRef(false);
  const firstDrawShownRef = useRef(false);
  const artistShownRef = useRef(false);
  const idleShownRef = useRef(false);
  const lastActivityRef = useRef(0);
  const lastHandAtRef = useRef(0);
  const totalDrawMsRef = useRef(0);
  const whisperRef = useRef('');
  const whisperUntilRef = useRef(0);
  const hasMistRef = useRef(false);
  const [stage, setStage] = useState<Stage>('intro');
  const [gesture, setGesture] = useState<Gesture>('IDLE');
  const [showGesture, setShowGesture] = useState(true);
  const [error, setError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [webglReady, setWebglReady] = useState(false);
  const [hasMist, setHasMist] = useState(false);
  const [whisper, setWhisper] = useState('');
  const debug = import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug');
  const onWebglReady = useCallback((ready: boolean) => {
    webglReadyRef.current = ready;
    setWebglReady(ready);
  }, []);
  const showWhisper = (message: string, now: number, duration = 2400) => {
    whisperRef.current = message;
    whisperUntilRef.current = now + duration;
    setWhisper(message);
  };

  const drawDebugLandmarks = (landmarks: NormalizedLandmark[] | null, video: HTMLVideoElement) => {
    const canvas = debugCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const width = canvas.width, height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    if (!landmarks) return;
    const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
    const offsetX = (width - video.videoWidth * scale) / 2;
    const offsetY = (height - video.videoHeight * scale) / 2;
    const position = (point: NormalizedLandmark) => ({
      x: width - (offsetX + point.x * video.videoWidth * scale),
      y: offsetY + point.y * video.videoHeight * scale,
    });
    ctx.strokeStyle = 'rgba(227,249,220,.65)';
    ctx.lineWidth = 1;
    for (const chain of [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]]) {
      ctx.beginPath();
      chain.forEach((id, index) => {
        const point = position(landmarks[id]);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    }
    for (const [index, landmark] of landmarks.entries()) {
      const point = position(landmark);
      ctx.beginPath();
      ctx.arc(point.x, point.y, index === 8 ? 4 : 2, 0, Math.PI * 2);
      ctx.fillStyle = index === 8 ? '#f4f8ca' : '#d9f1d7';
      ctx.fill();
    }
  };

  const changeStage = (next: Stage) => {
    if (stageRef.current === next) return;
    stageRef.current = next;
    setStage(next);
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    const fog = new FogCanvas(canvasRef.current);
    fogRef.current = fog;
    const resize = () => fog.resize();
    window.addEventListener('resize', resize);
    let frame = 0;
    const tick = (now: number) => {
      const dt = lastFrameRef.current ? Math.min(60, now - lastFrameRef.current) : 16;
      lastFrameRef.current = now;
      const blow = breathRef.current?.update(now);
      const breath = blow?.blowStrength ?? 0;
      if (breath > 0.03) {
        fog.setIntensity(fog.intensity + breath * dt * 0.00034);
        fog.refog(breath * dt * 0.004);
        lastActivityRef.current = now;
        idleShownRef.current = false;
        if (whisperRef.current) showWhisper('', now, 0);
      }
      else if (fog.intensity > 0) fog.setIntensity(fog.intensity - dt * 0.0000007);
      glassRef.current?.addBreath(breath, dt, blow?.blowDuration ?? 0);

      if (fog.intensity > 0.08 && !hasMistRef.current) {
        hasMistRef.current = true;
        setHasMist(true);
      }
      if (stageRef.current === 'blow' && fog.intensity > 0.28) changeStage('raise');
      const hand = trackerRef.current?.update(now);
      if (hand) glassRef.current?.setFingertip(hand.visible ? hand : null);
      if (debug) {
        if (!debugLastAtRef.current) debugLastAtRef.current = now;
        debugFramesRef.current++;
        if (hand) debugHandRef.current = hand.visible ? hand : null;
        const elapsed = now - debugLastAtRef.current;
        if (elapsed >= 250) {
          const tracked = debugHandRef.current;
          debugPanelRef.current?.update({
            fps: debugFramesRef.current * 1000 / elapsed,
            volume: blow?.volume ?? 0,
            blowStrength: breath,
            blowDuration: blow?.blowDuration ?? 0,
            isBlowing: blow?.isBlowing ?? false,
            gesture: tracked?.gesture ?? 'NO HAND',
            fingerX: tracked?.x ?? null,
            fingerY: tracked?.y ?? null,
          });
          debugFramesRef.current = 0;
          debugLastAtRef.current = now;
        }
      }
      if (hand?.visible) {
        lastActivityRef.current = now;
        idleShownRef.current = false;
        const nextGesture: Gesture = hand.drawing ? 'DRAWING' : 'IDLE';
        if (nextGesture !== gestureRef.current) {
          gestureRef.current = nextGesture;
          setGesture(nextGesture);
        }
        if (hand.drawing && fog.intensity > 0.07) {
          totalDrawMsRef.current += lastHandAtRef.current ? Math.min(100, now - lastHandAtRef.current) : 0;
          glassRef.current?.drawAt(hand, now, lastPointRef.current);
          fog.addPoint(hand.x, hand.y, now, lastPointRef.current);
          lastPointRef.current = true;
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
        } else lastPointRef.current = false;
        lastHandAtRef.current = now;
      } else if (hand && !hand.visible) {
        lastPointRef.current = false;
        if (gestureRef.current !== 'IDLE') {
          gestureRef.current = 'IDLE';
          setGesture('IDLE');
        }
      }
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
      streamRef.current?.getTracks().forEach(track => track.stop());
      trackerRef.current?.close();
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
    const stale = () => startup !== startupRef.current;
    changeStage('loading');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (stale()) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
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
      const breath = new BlowDetector(stream);
      breathRef.current = breath;
      await breath.resume();
      if (stale()) return;
      const tracker = await HandTracker.create(video, debug ? drawDebugLandmarks : undefined);
      if (stale()) {
        tracker.close();
        return;
      }
      trackerRef.current = tracker;
      changeStage('blow');
    } catch (cause) {
      if (stale()) return;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      if (debugVideoRef.current) debugVideoRef.current.srcObject = null;
      setCameraReady(false);
      await breathRef.current?.close();
      breathRef.current = null;
      const name = cause instanceof DOMException ? cause.name : '';
      setError(name === 'NotAllowedError'
        ? 'Camera or microphone access was denied. Allow both in your browser settings, then try again.'
        : name === 'NotFoundError'
          ? 'A camera and microphone are both needed. Connect them, then try again.'
          : 'The camera, microphone, or hand model could not start. Check your connection and try again.');
      changeStage('error');
    }
  }

  return (
    <main className={`experience stage-${stage}`}>
      <div className="room" aria-hidden="true"><div className="room-light" /><div className="room-shape room-shape-a" /><div className="room-shape room-shape-b" /></div>
      <video ref={videoRef} className={`mirror-video${cameraReady ? ' is-live' : ''}${webglReady ? ' v2-hidden' : ''}`} muted playsInline autoPlay aria-hidden="true" />
      <div className="mirror-shade" aria-hidden="true" />
      <GlassSurface ref={glassRef} debug={debug} onReady={onWebglReady} />
      <canvas ref={canvasRef} className={`fog-canvas${webglReady ? ' is-fallback-hidden' : ''}`} aria-label="Condensation on the mirror" />
      <div className="glass-grain" aria-hidden="true" />
      {debug && <video ref={debugVideoRef} className="camera-preview" muted playsInline autoPlay aria-hidden="true" />}
      {debug && <canvas ref={debugCanvasRef} className="landmark-preview" width="190" height="143" aria-hidden="true" />}
      {debug && <DebugPanel ref={debugPanelRef} />}

      <ExperienceOverlay stage={stage} hasMist={hasMist} error={error} gesture={gesture} showGesture={showGesture} whisper={whisper} onEnable={enable} />
    </main>
  );
}
