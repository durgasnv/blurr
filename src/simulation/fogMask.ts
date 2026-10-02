import {
  Color,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import vertexShader from '../shaders/glass.vert?raw';
import fragmentShader from '../shaders/fogMask.frag?raw';
import noiseShader from '../shaders/noise.glsl?raw';
import type { GlassUv } from '../vision/coordinateMapper';

export class FogMask {
  private renderer: WebGLRenderer;
  private read: WebGLRenderTarget;
  private write: WebGLRenderTarget;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private geometry = new PlaneGeometry(2, 2);
  private material = new ShaderMaterial({
    vertexShader,
    fragmentShader: `${noiseShader}\n${fragmentShader}`,
    uniforms: {
      uPrevious: { value: null },
      uGrowth: { value: 0 },
      uBlowRadius: { value: 0.15 },
      uWetDecay: { value: 0 },
      uEraseFrom: { value: new Vector2(-10, -10) },
      uEraseTo: { value: new Vector2(-10, -10) },
      uEraseRadius: { value: 0.026 },
      uEraseStrength: { value: 0 },
      uAspect: { value: 1 },
    },
    depthWrite: false,
  });
  private floatTarget: boolean;

  constructor(renderer: WebGLRenderer, width: number, height: number) {
    this.renderer = renderer;
    this.floatTarget = renderer.extensions.has('EXT_color_buffer_float');
    this.camera.position.z = 1;
    this.material.uniforms.uAspect.value = width / Math.max(1, height);
    this.scene.add(new Mesh(this.geometry, this.material));
    this.read = this.makeTarget(width, height);
    this.write = this.makeTarget(width, height);

    const oldTarget = renderer.getRenderTarget();
    const oldColor = renderer.getClearColor(new Color());
    const oldAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.read);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.setRenderTarget(oldTarget);
    renderer.setClearColor(oldColor, oldAlpha);
  }

  get texture() { return this.read.texture; }
  get minimumStep() { return this.floatTarget ? 0 : 1 / 255; }

  advance(growth: number, duration: number, wetDecay = 0) {
    if (growth <= 0 && wetDecay <= 0) return;
    this.material.uniforms.uGrowth.value = growth;
    this.material.uniforms.uBlowRadius.value = Math.min(1.25, 0.13 + duration * 0.00032);
    this.material.uniforms.uWetDecay.value = wetDecay;
    this.material.uniforms.uEraseStrength.value = 0;
    this.step();
  }

  eraseSegment(from: GlassUv, to: GlassUv, aspect: number, radius: number, strength: number) {
    this.material.uniforms.uGrowth.value = 0;
    this.material.uniforms.uWetDecay.value = 0;
    this.material.uniforms.uEraseFrom.value.set(from.x, from.y);
    this.material.uniforms.uEraseTo.value.set(to.x, to.y);
    this.material.uniforms.uEraseRadius.value = radius;
    this.material.uniforms.uEraseStrength.value = strength;
    this.material.uniforms.uAspect.value = aspect;
    this.step();
  }

  private step() {
    this.material.uniforms.uPrevious.value = this.read.texture;
    const previousTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.write);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previousTarget);
    [this.read, this.write] = [this.write, this.read];
  }

  resize(width: number, height: number) {
    this.material.uniforms.uAspect.value = width / Math.max(1, height);
    if (this.read.width === Math.max(1, Math.round(width * 0.5))
      && this.read.height === Math.max(1, Math.round(height * 0.5))) return;
    const nextRead = this.makeTarget(width, height);
    const nextWrite = this.makeTarget(width, height);
    this.material.uniforms.uPrevious.value = this.read.texture;
    this.material.uniforms.uGrowth.value = 0;
    this.material.uniforms.uWetDecay.value = 0;
    this.material.uniforms.uEraseStrength.value = 0;
    const previousTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(nextRead);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previousTarget);
    this.read.dispose();
    this.write.dispose();
    this.read = nextRead;
    this.write = nextWrite;
  }

  dispose() {
    this.read.dispose();
    this.write.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }

  private makeTarget(width: number, height: number) {
    return new WebGLRenderTarget(
      Math.max(1, Math.round(width * 0.5)),
      Math.max(1, Math.round(height * 0.5)),
      {
        format: RGBAFormat,
        type: this.floatTarget ? HalfFloatType : UnsignedByteType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      },
    );
  }
}
