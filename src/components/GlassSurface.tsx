import { forwardRef, useEffect, useImperativeHandle, useRef, type RefObject } from 'react';
import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  VideoTexture,
  WebGLRenderer,
} from 'three';
import vertexShader from '../shaders/glass.vert?raw';
import fragmentShader from '../shaders/glass.frag?raw';
import noiseShader from '../shaders/noise.glsl?raw';
import backgroundShader from '../shaders/background.glsl?raw';
import { FogMask } from '../simulation/fogMask';
import { DropletSimulation } from '../simulation/droplets';
import { forEachStamp } from '../simulation/stamps';
import { viewportToGlassUv, type GlassUv, type ViewportPoint } from '../vision/coordinateMapper';
import { chooseQuality } from '../utils/performance';

export type GlassSurfaceHandle = {
  addBreath: (strength: number, dt: number, duration: number) => void;
  setFingertip: (point: ViewportPoint | null, touching?: boolean) => void;
  drawAt: (point: ViewportPoint, at: number, connect: boolean, brushSize?: number) => void;
  wipeAt: (point: ViewportPoint, radius: number, at: number, connect: boolean) => void;
  setDrawing: (active: boolean) => void;
  setBreathCenter: (point: ViewportPoint) => void;
  clearDrawing: () => void;
  reset: () => void;
  savePng: () => void;
};

export const GlassSurface = forwardRef<GlassSurfaceHandle, { debug: boolean; onReady: (ready: boolean) => void; video: RefObject<HTMLVideoElement | null> }>(function GlassSurface({ debug, onReady, video }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const addBreathRef = useRef<(strength: number, dt: number, duration: number) => void>(() => undefined);
  const setFingertipRef = useRef<(point: ViewportPoint | null) => void>(() => undefined);
  const drawAtRef = useRef<(point: ViewportPoint, at: number, connect: boolean, brushSize: number) => void>(() => undefined);
  const wipeAtRef = useRef<(point: ViewportPoint, radius: number, at: number, connect: boolean) => void>(() => undefined);
  const setDrawingRef = useRef<(active: boolean) => void>(() => undefined);
  const setBreathCenterRef = useRef<(point: ViewportPoint) => void>(() => undefined);
  const clearDrawingRef = useRef<() => void>(() => undefined);
  const resetRef = useRef<() => void>(() => undefined);
  const savePngRef = useRef<() => void>(() => undefined);

  useImperativeHandle(ref, () => ({
    addBreath: (strength, dt, duration) => addBreathRef.current(strength, dt, duration),
    setFingertip: point => setFingertipRef.current(point),
    drawAt: (point, at, connect, brushSize = 15) => drawAtRef.current(point, at, connect, brushSize),
    wipeAt: (point, radius, at, connect) => wipeAtRef.current(point, radius, at, connect),
    setDrawing: active => setDrawingRef.current(active),
    setBreathCenter: point => setBreathCenterRef.current(point),
    clearDrawing: () => clearDrawingRef.current(),
    reset: () => resetRef.current(),
    savePng: () => savePngRef.current(),
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false });
    } catch {
      // The Canvas 2D experience remains usable if WebGL is unavailable.
      return;
    }

    renderer.setClearColor(0x000000, 0);
    const bounds = canvas.parentElement?.getBoundingClientRect();
    const quality = chooseQuality(
      bounds?.width ?? window.innerWidth,
      bounds?.height ?? window.innerHeight,
      window.devicePixelRatio || 1,
      navigator.hardwareConcurrency || 8,
    );
    const fogMask = new FogMask(renderer, bounds?.width ?? window.innerWidth, bounds?.height ?? window.innerHeight, quality.maskScale);
    const droplets = new DropletSimulation(quality.maxDrops);
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;
    const geometry = new PlaneGeometry(2, 2);
    const cameraTexture = video.current ? new VideoTexture(video.current) : null;
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader: `${noiseShader}\n${backgroundShader}\n${fragmentShader}`,
      uniforms: {
        uFogMask: { value: fogMask.texture },
        uCamera: { value: cameraTexture },
        uHasCamera: { value: 0 },
        uVideoCrop: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
        uFinger: { value: new Vector2(-1, -1) },
        uDebugFinger: { value: debug ? 1 : 0 },
        uAspect: { value: 1 },
        uDrops: { value: droplets.positions },
        uDropCount: { value: 0 },
        uQuality: { value: quality.shaderLevel },
      },
      transparent: true,
      depthWrite: false,
    });
    scene.add(new Mesh(geometry, material));
    let pendingGrowth = 0;
    let latestDuration = 0;
    let estimatedFog = 0;
    let lastRenderAt = 0;
    let wetUntil = 0;
    let lastDrawUv: GlassUv | null = null;
    let lastDrawAt = 0;
    let lastWipePoint: ViewportPoint | null = null;
    let lastWipeAt = 0;
    let isDrawing = false;
    let breathFrame = 0;
    let videoWidth = 0;
    let videoHeight = 0;
    let viewportWidth = 1;
    let viewportHeight = 1;
    const updateVideoCrop = () => {
      if (!videoWidth || !videoHeight) return;
      const videoAspect = videoWidth / videoHeight;
      const viewportAspect = viewportWidth / viewportHeight;
      material.uniforms.uVideoCrop.value.set(
        Math.min(1, viewportAspect / videoAspect),
        Math.min(1, videoAspect / viewportAspect),
      );
    };
    addBreathRef.current = (strength, dt, duration) => {
      if (!isDrawing && strength > 0.03 && duration > 0) {
        pendingGrowth += strength * dt * 0.00034;
        latestDuration = duration;
      }
    };
    setFingertipRef.current = point => {
      const uv = point ? viewportToGlassUv(point) : { x: -1, y: -1 };
      material.uniforms.uFinger.value.set(uv.x, uv.y);
      if (debug) renderer.render(scene, camera);
    };
    drawAtRef.current = (point, at, connect, brushSize) => {
      const uv = viewportToGlassUv(point);
      const canConnect = connect && lastDrawUv && at - lastDrawAt < 250
        && Math.hypot(uv.x - lastDrawUv.x, uv.y - lastDrawUv.y) <= 0.3;
      const from = canConnect && lastDrawUv ? lastDrawUv : uv;
      if (canConnect && Math.abs(uv.x - from.x) < 0.0006 && Math.abs(uv.y - from.y) < 0.0006) return;
      const elapsed = Math.max(16, at - lastDrawAt) / 1000;
      const speed = Math.hypot((uv.x - from.x) * material.uniforms.uAspect.value, uv.y - from.y) / elapsed;
      const radius = (brushSize - Math.min(brushSize * 0.27, speed * 2)) / viewportHeight;
      const strength = 0.95 - Math.min(0.18, speed * 0.05);
      fogMask.eraseSegment(from, uv, material.uniforms.uAspect.value, radius, strength);
      material.uniforms.uFogMask.value = fogMask.texture;
      lastDrawUv = uv;
      lastDrawAt = at;
      wetUntil = at + 6000;
      droplets.disturb(uv);
      renderer.render(scene, camera);
    };
    wipeAtRef.current = (point, radius, at, connect) => {
      const from = connect && lastWipePoint && at - lastWipeAt < 250 ? lastWipePoint : point;
      forEachStamp(from, point, radius * viewportHeight, viewportWidth, viewportHeight, (x, y) => {
        const uv = viewportToGlassUv({ x, y });
        fogMask.eraseSegment(uv, uv, material.uniforms.uAspect.value, radius, 0.34);
        droplets.disturb(uv);
      });
      material.uniforms.uFogMask.value = fogMask.texture;
      lastWipePoint = point;
      lastWipeAt = at;
      wetUntil = at + 6000;
      renderer.render(scene, camera);
    };
    setDrawingRef.current = active => { isDrawing = active; };
    setBreathCenterRef.current = point => fogMask.setBlowCenter(viewportToGlassUv(point));
    clearDrawingRef.current = () => {
      fogMask.restoreDrawing();
      material.uniforms.uFogMask.value = fogMask.texture;
      lastDrawUv = null;
      lastWipePoint = null;
      renderer.render(scene, camera);
    };
    resetRef.current = () => {
      fogMask.reset();
      estimatedFog = 0;
      pendingGrowth = 0;
      lastDrawUv = null;
      lastWipePoint = null;
      material.uniforms.uFogMask.value = fogMask.texture;
      material.uniforms.uHasCamera.value = 0;
      renderer.render(scene, camera);
    };
    savePngRef.current = () => {
      renderer.render(scene, camera);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = 'blurr.png';
      link.click();
    };

    renderer.setAnimationLoop(now => {
      if (document.hidden || now - lastRenderAt < quality.frameInterval) return;
      const frameMs = lastRenderAt ? Math.min(100, now - lastRenderAt) : quality.frameInterval;
      lastRenderAt = now;
      const cameraVideo = video.current;
      const hasCamera = !!cameraTexture && !!cameraVideo && cameraVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && cameraVideo.videoWidth > 0;
      if (hasCamera && cameraVideo && (cameraVideo.videoWidth !== videoWidth || cameraVideo.videoHeight !== videoHeight)) {
        videoWidth = cameraVideo.videoWidth;
        videoHeight = cameraVideo.videoHeight;
        updateVideoCrop();
      }
      material.uniforms.uHasCamera.value = hasCamera ? 1 : 0;
      const growing = !isDrawing && ++breathFrame % 2 === 0
        && pendingGrowth >= fogMask.minimumStep && pendingGrowth > 0;
      const wetDecay = now < wetUntil ? frameMs * 0.00018 : 0;
      const regeneration = !isDrawing && estimatedFog > 0.005 ? frameMs / 16000 : 0;
      if (growing || wetDecay > 0 || regeneration > 0) {
        fogMask.advance(growing ? pendingGrowth : 0, latestDuration, wetDecay, regeneration);
        if (growing) {
          estimatedFog = Math.min(1, estimatedFog + pendingGrowth);
          pendingGrowth = 0;
        }
        material.uniforms.uFogMask.value = fogMask.texture;
      }
      if (estimatedFog < 0.005 && !hasCamera) return;
      droplets.update(frameMs / 1000, estimatedFog);
      material.uniforms.uDropCount.value = droplets.count;
      material.uniforms.uTime.value = now * 0.001;
      renderer.render(scene, camera);
    });

    const resize = () => {
      const bounds = canvas.parentElement?.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds?.width ?? window.innerWidth));
      const height = Math.max(1, Math.round(bounds?.height ?? window.innerHeight));
      viewportWidth = width;
      viewportHeight = height;
      updateVideoCrop();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
      renderer.setSize(width, height, false);
      material.uniforms.uAspect.value = width / height;
      fogMask.resize(width, height);
      material.uniforms.uFogMask.value = fogMask.texture;
      renderer.render(scene, camera);
    };

    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    window.addEventListener('resize', resize);
    const onContextLost = (event: Event) => {
      event.preventDefault();
      onReady(false);
    };
    const onContextRestored = () => {
      resize();
      onReady(true);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    resize();
    onReady(true);

    return () => {
      onReady(false);
      renderer.setAnimationLoop(null);
      addBreathRef.current = () => undefined;
      setFingertipRef.current = () => undefined;
      drawAtRef.current = () => undefined;
      wipeAtRef.current = () => undefined;
      setDrawingRef.current = () => undefined;
      setBreathCenterRef.current = () => undefined;
      clearDrawingRef.current = () => undefined;
      resetRef.current = () => undefined;
      savePngRef.current = () => undefined;
      observer.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      geometry.dispose();
      material.dispose();
      cameraTexture?.dispose();
      fogMask.dispose();
      renderer.dispose();
    };
  }, [debug, onReady, video]);

  return <canvas ref={canvasRef} className={debug ? 'glass-surface debug-glass' : 'glass-surface'} aria-hidden="true" />;
});
