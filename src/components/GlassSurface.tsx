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

export type GlassSurfaceHandle = { setFogLevel: (level: number) => void };

export const GlassSurface = forwardRef<GlassSurfaceHandle>(function GlassSurface(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setFogLevelRef = useRef<(level: number) => void>(() => undefined);

  useImperativeHandle(ref, () => ({ setFogLevel: level => setFogLevelRef.current(level) }), []);

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
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;
    const geometry = new PlaneGeometry(2, 2);
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uFog: { value: 0 } },
      transparent: true,
      depthWrite: false,
    });
    scene.add(new Mesh(geometry, material));
    let lastRenderedLevel = 0;
    setFogLevelRef.current = level => {
      const next = Math.min(1, Math.max(0, level));
      if (Math.abs(next - lastRenderedLevel) < 0.002) return;
      material.uniforms.uFog.value = next;
      lastRenderedLevel = next;
      renderer.render(scene, camera);
    };

    const resize = () => {
      const bounds = canvas.parentElement?.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds?.width ?? window.innerWidth));
      const height = Math.max(1, Math.round(bounds?.height ?? window.innerHeight));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
      renderer.setSize(width, height, false);
      renderer.render(scene, camera);
    };

    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    window.addEventListener('resize', resize);
    resize();

    return () => {
      setFogLevelRef.current = () => undefined;
      observer.disconnect();
      window.removeEventListener('resize', resize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="glass-surface" aria-hidden="true" />;
});
