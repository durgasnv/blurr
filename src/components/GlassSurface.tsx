import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three';
import vertexShader from '../shaders/glass.vert?raw';
import fragmentShader from '../shaders/glass.frag?raw';
import noiseShader from '../shaders/noise.glsl?raw';
import { FogMask } from '../simulation/fogMask';

export type GlassSurfaceHandle = { addBreath: (strength: number, dt: number) => void };

export const GlassSurface = forwardRef<GlassSurfaceHandle>(function GlassSurface(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const addBreathRef = useRef<(strength: number, dt: number) => void>(() => undefined);

  useImperativeHandle(ref, () => ({ addBreath: (strength, dt) => addBreathRef.current(strength, dt) }), []);

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
    const fogMask = new FogMask(renderer, bounds?.width ?? window.innerWidth, bounds?.height ?? window.innerHeight);
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;
    const geometry = new PlaneGeometry(2, 2);
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader: `${noiseShader}\n${fragmentShader}`,
      uniforms: { uFogMask: { value: fogMask.texture }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
    });
    scene.add(new Mesh(geometry, material));
    let pendingGrowth = 0;
    let estimatedFog = 0;
    let lastRenderAt = 0;
    addBreathRef.current = (strength, dt) => {
      if (strength > 0.03) pendingGrowth += strength * dt * 0.00034;
    };

    renderer.setAnimationLoop(now => {
      if (document.hidden || now - lastRenderAt < 32) return;
      lastRenderAt = now;
      if (pendingGrowth >= fogMask.minimumStep && pendingGrowth > 0) {
        fogMask.advance(pendingGrowth);
        estimatedFog = Math.min(1, estimatedFog + pendingGrowth);
        pendingGrowth = 0;
        material.uniforms.uFogMask.value = fogMask.texture;
      }
      if (estimatedFog < 0.005) return;
      material.uniforms.uTime.value = now * 0.001;
      renderer.render(scene, camera);
    });

    const resize = () => {
      const bounds = canvas.parentElement?.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds?.width ?? window.innerWidth));
      const height = Math.max(1, Math.round(bounds?.height ?? window.innerHeight));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
      renderer.setSize(width, height, false);
      fogMask.resize(width, height);
      material.uniforms.uFogMask.value = fogMask.texture;
      renderer.render(scene, camera);
    };

    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    window.addEventListener('resize', resize);
    resize();

    return () => {
      renderer.setAnimationLoop(null);
      addBreathRef.current = () => undefined;
      observer.disconnect();
      window.removeEventListener('resize', resize);
      geometry.dispose();
      material.dispose();
      fogMask.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="glass-surface" aria-hidden="true" />;
});
