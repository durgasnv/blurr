import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { FogCanvas } from './lib/fog';
import { HandTracker } from './lib/hand';
import { BreathDetector } from './lib/breath';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

type Stage = 'intro' | 'loading' | 'blow' | 'raise' | 'draw' | 'experience' | 'error';
type Gesture = 'IDLE' | 'DRAWING';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const fogRef = useRef<FogCanvas | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const breathRef = useRef<BreathDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stageRef = useRef<Stage>('intro');
  const lastPointRef = useRef(false);
  const revealAtRef = useRef(0);
  const lastFrameRef = useRef(0);
  const gestureRef = useRef<Gesture>('IDLE');
  const [stage, setStage] = useState<Stage>('intro');
  const [gesture, setGesture] = useState<Gesture>('IDLE');
  const [showGesture, setShowGesture] = useState(true);
  const [error, setError] = useState('');
  const debug = new URLSearchParams(window.location.search).has('debug');

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
      const breath = breathRef.current?.update(now) ?? 0;
      if (breath > 0.03) fog.setIntensity(fog.intensity + breath * dt * 0.00034);
      else if (fog.intensity > 0) fog.setIntensity(fog.intensity - dt * 0.0000007);

      if (stageRef.current === 'blow' && fog.intensity > 0.28) changeStage('raise');
      const hand = trackerRef.current?.update(now);
      if (hand?.visible) {
        const nextGesture: Gesture = hand.drawing ? 'DRAWING' : 'IDLE';
        if (nextGesture !== gestureRef.current) {
          gestureRef.current = nextGesture;
          setGesture(nextGesture);
        }
        if (hand.drawing && fog.intensity > 0.07) {
          fog.addPoint(hand.x, hand.y, now, lastPointRef.current);
          lastPointRef.current = true;
          if (stageRef.current === 'raise') {
            changeStage('draw');
            revealAtRef.current = now;
          }
          if (stageRef.current === 'draw' && now - revealAtRef.current > 1800) changeStage('experience');
          if (now - revealAtRef.current > 5200) setShowGesture(false);
        } else lastPointRef.current = false;
      } else if (hand && !hand.visible) {
        lastPointRef.current = false;
        if (gestureRef.current !== 'IDLE') {
          gestureRef.current = 'IDLE';
          setGesture('IDLE');
        }
      }
      fog.render(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      streamRef.current?.getTracks().forEach(track => track.stop());
      trackerRef.current?.close();
      void breathRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!copyRef.current) return;
    gsap.fromTo(copyRef.current, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.85, ease: 'power2.out' });
  }, [stage]);

  async function enable() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser needs a secure connection and camera/microphone support. Open the site on HTTPS or localhost.');
      changeStage('error');
      return;
    }
    changeStage('loading');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const breath = new BreathDetector(stream);
      breathRef.current = breath;
      await breath.resume();
      trackerRef.current = await HandTracker.create(video, debug ? drawDebugLandmarks : undefined);
      changeStage('blow');
    } catch (cause) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
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

  const content = {
    intro: { eyebrow: 'A touchless mirror', title: <>Leave a trace<br /><em>in the mist.</em></>, detail: 'Breathe on the glass. Lift a finger. Draw in the air.' },
    loading: { eyebrow: 'Preparing your mirror', title: <>One<br /><em>moment.</em></>, detail: 'Opening the camera, microphone, and hand tracker…' },
    blow: { eyebrow: '01 / Breathe', title: <>Blow on<br /><em>the glass.</em></>, detail: 'A long, gentle breath will cloud the mirror.' },
    raise: { eyebrow: '02 / Gesture', title: <>Raise your<br /><em>finger.</em></>, detail: 'Point one index finger toward the camera.' },
    draw: { eyebrow: '03 / Create', title: <>Draw.</>, detail: 'Move your finger through the air.' },
    experience: { eyebrow: '', title: <></>, detail: '' },
    error: { eyebrow: 'Access needed', title: <>Let’s try<br /><em>again.</em></>, detail: error },
  }[stage];

  return (
    <main className={`experience stage-${stage}`}>
      <div className="room" aria-hidden="true"><div className="room-light" /><div className="room-shape room-shape-a" /><div className="room-shape room-shape-b" /></div>
      <canvas ref={canvasRef} className="fog-canvas" aria-label="Condensation on the mirror" />
      <div className="glass-grain" aria-hidden="true" />
      <video ref={videoRef} className={debug ? 'camera-preview' : 'camera-hidden'} muted playsInline autoPlay aria-hidden="true" />
      {debug && <canvas ref={debugCanvasRef} className="landmark-preview" width="190" height="143" aria-hidden="true" />}

      <header className="topbar">
        <div className="brand">BLURR<span className="brand-dot">.</span></div>
        <div className="topbar-center">AN INTERACTIVE MIRROR</div>
        <div className="live-mark"><span /> {stage === 'intro' || stage === 'error' ? 'WAITING' : stage === 'loading' ? 'CONNECTING' : 'LIVE'}</div>
      </header>

      {stage !== 'experience' && <section className="hero" ref={copyRef} key={stage}>
        <div className="eyebrow"><span className="eyebrow-rule" />{content.eyebrow}</div>
        <h1>{content.title}</h1>
        <p>{content.detail}</p>
        {(stage === 'intro' || stage === 'error') && <button className="enable-button" onClick={enable}>
          <span>ENABLE CAMERA + MICROPHONE</span><span className="button-arrow">↗</span>
        </button>}
        {stage === 'loading' && <div className="loading-line" aria-label="Loading" />}
      </section>}

      {stage !== 'intro' && stage !== 'loading' && stage !== 'error' && showGesture &&
        <div className="gesture-indicator"><span className={gesture === 'DRAWING' ? 'gesture-light on' : 'gesture-light'} />{gesture}</div>}

      <footer className="footer">
        <span>YOUR BREATH IS THE BRUSH</span>
        <div className="footer-center"><span>01</span><i /><span>02</span><i /><span>03</span></div>
        <span>OPEN PALM TO PAUSE</span>
      </footer>
    </main>
  );
}
