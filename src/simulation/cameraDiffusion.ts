import { LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderTarget, type Texture, type WebGLRenderer } from 'three';
import vertexShader from '../shaders/glass.vert?raw';

/** Separable Gaussian diffusion, calculated once per camera frame at reduced resolution. */
export class CameraDiffusion {
  private horizontal = new WebGLRenderTarget(1, 1, { depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
  private vertical = this.horizontal.clone();
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private geometry = new PlaneGeometry(2, 2);
  private material = new ShaderMaterial({
    vertexShader,
    fragmentShader: `
      uniform sampler2D uSource;
      uniform vec2 uCrop;
      uniform vec2 uStep;
      uniform float uCameraPass;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        if (uCameraPass > 0.5) uv = (vec2(1.0 - uv.x, uv.y) - 0.5) * uCrop + 0.5;
        vec3 color = vec3(0.0);
        float total = 0.0;
        for (int i = -12; i <= 12; i++) {
          float weight = exp(-float(i * i) / 32.0);
          color += texture2D(uSource, clamp(uv + float(i) * uStep, 0.0, 1.0)).rgb * weight;
          total += weight;
        }
        gl_FragColor = vec4(color / total, 1.0);
      }`,
    uniforms: { uSource: { value: null }, uCrop: { value: new Vector2(1, 1) }, uStep: { value: new Vector2() }, uCameraPass: { value: 0 } },
    depthWrite: false,
  });
  private width = 1;
  private height = 1;
  private lastVideoTime = -1;
  constructor(private renderer: WebGLRenderer) {
    this.camera.position.z = 1;
    this.scene.add(new Mesh(this.geometry, this.material));
  }
  get texture() { return this.vertical.texture; }
  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    const scale = Math.min(0.4, 960 / width, 540 / height);
    this.horizontal.setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    this.vertical.setSize(this.horizontal.width, this.horizontal.height);
    this.lastVideoTime = -1;
  }
  update(source: Texture, videoTime: number, crop: Vector2) {
    if (videoTime === this.lastVideoTime) return;
    this.lastVideoTime = videoTime;
    const previous = this.renderer.getRenderTarget();
    const uniforms = this.material.uniforms;
    uniforms.uCrop.value.copy(crop);
    uniforms.uSource.value = source;
    uniforms.uCameraPass.value = 1;
    // sigma = 18 CSS pixels, independent of DPR and target resolution.
    uniforms.uStep.value.set(4.5 * crop.x / this.width, 0);
    this.renderer.setRenderTarget(this.horizontal);
    this.renderer.render(this.scene, this.camera);
    uniforms.uSource.value = this.horizontal.texture;
    uniforms.uCameraPass.value = 0;
    uniforms.uStep.value.set(0, 4.5 / this.height);
    this.renderer.setRenderTarget(this.vertical);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previous);
  }
  dispose() {
    this.horizontal.dispose(); this.vertical.dispose();
    this.geometry.dispose(); this.material.dispose();
  }
}
