export type Point = { x: number; y: number; at: number; refogProgress: number };

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export class FogCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture = document.createElement('canvas');
  private points: Point[] = [];
  private width = 1;
  private height = 1;
  private dpr = 1;
  private lastRender = 0;
  private dirty = true;
  intensity = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true })!;
    this.resize();
  }

  resize() {
    const bounds = this.canvas.parentElement?.getBoundingClientRect();
    this.width = Math.max(1, Math.round(bounds?.width ?? window.innerWidth));
    this.height = Math.max(1, Math.round(bounds?.height ?? window.innerHeight));
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.7);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.makeTexture();
    this.dirty = true;
  }

  addPoint(x: number, y: number, at: number, connect: boolean) {
    const next = { x: clamp(x), y: clamp(y), at, refogProgress: 0 };
    const previous = this.points.at(-1);
    if (connect && previous && at - previous.at < 95) {
      const distance = Math.hypot((next.x - previous.x) * this.width, (next.y - previous.y) * this.height);
      const step = Math.max(3, Math.min(this.width, this.height) * 0.009);
      const count = Math.ceil(distance / step);
      for (let i = 1; i < count; i++) {
        const t = i / count;
        this.points.push({
          x: previous.x + (next.x - previous.x) * t,
          y: previous.y + (next.y - previous.y) * t,
          at: previous.at + (at - previous.at) * t,
          refogProgress: 0,
        });
      }
    }
    this.points.push(next);
    this.dirty = true;
  }

  refog(amount: number) {
    if (this.points.length === 0) return;
    for (const point of this.points) point.refogProgress = clamp(point.refogProgress + amount);
    this.dirty = true;
  }

  render(now: number) {
    const hasTrails = this.points.length > 0;
    if (!this.dirty && !hasTrails) return;
    if (now - this.lastRender < (hasTrails ? 32 : 80)) return;
    this.lastRender = now;
    this.dirty = false;
    this.points = this.points.filter(point => now - point.at < 20000 && point.refogProgress < 1);

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.intensity < 0.004) return;

    ctx.globalAlpha = clamp(this.intensity);
    ctx.drawImage(this.texture, 0, 0, this.width, this.height);
    ctx.globalAlpha = 1;

    // A pale, wet rim sits just outside each wiped point.
    const radius = clamp(Math.min(this.width, this.height) * 0.026, 17, 33);
    for (const point of this.points) {
      const age = now - point.at;
      const life = (age < 10000 ? 1 : clamp((20000 - age) / 10000)) * (1 - point.refogProgress);
      if (life <= 0) continue;
      const x = point.x * this.width;
      const y = point.y * this.height;
      const rim = ctx.createRadialGradient(x, y, radius * 0.65, x, y, radius * 1.38);
      rim.addColorStop(0, 'rgba(237,249,243,0)');
      rim.addColorStop(0.78, `rgba(229,246,239,${0.1 * life * this.intensity})`);
      rim.addColorStop(1, 'rgba(229,246,239,0)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.38, 0, Math.PI * 2);
      ctx.fill();
    }

    // Destination-out removes the fog itself; partial alpha restores it over time.
    ctx.globalCompositeOperation = 'destination-out';
    for (const point of this.points) {
      const age = now - point.at;
      const life = (age < 10000 ? 1 : clamp((20000 - age) / 10000)) * (1 - point.refogProgress);
      if (life <= 0) continue;
      const x = point.x * this.width;
      const y = point.y * this.height;
      const gradient = ctx.createRadialGradient(x, y, radius * 0.42, x, y, radius);
      gradient.addColorStop(0, `rgba(0,0,0,${life})`);
      gradient.addColorStop(0.62, `rgba(0,0,0,${life * 0.93})`);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  setIntensity(value: number) {
    const next = clamp(value);
    if (next !== this.intensity) {
      this.intensity = next;
      this.dirty = true;
    }
  }

  private makeTexture() {
    const texture = this.texture;
    // Lower-resolution grain reads as soft condensation when scaled to the screen.
    texture.width = Math.max(1, Math.round(this.width * 0.55));
    texture.height = Math.max(1, Math.round(this.height * 0.55));
    const ctx = texture.getContext('2d')!;
    const image = ctx.createImageData(texture.width, texture.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const grain = Math.random();
      data[i] = 213 + grain * 26;
      data[i + 1] = 227 + grain * 24;
      data[i + 2] = 220 + grain * 26;
      data[i + 3] = 196 + grain * 43;
    }
    ctx.putImageData(image, 0, 0);

    const shortSide = Math.min(texture.width, texture.height);
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * texture.width;
      const y = Math.random() * texture.height;
      const radius = shortSide * (0.12 + Math.random() * 0.35);
      const cloud = ctx.createRadialGradient(x, y, 0, x, y, radius);
      cloud.addColorStop(0, `rgba(246,250,244,${0.05 + Math.random() * 0.18})`);
      cloud.addColorStop(1, 'rgba(246,250,244,0)');
      ctx.fillStyle = cloud;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    for (let i = 0; i < Math.round(this.width * this.height / 1100); i++) {
      const x = Math.random() * texture.width;
      const y = Math.random() * texture.height;
      const r = 0.3 + Math.random() * 1.2;
      ctx.fillStyle = `rgba(250,255,249,${0.1 + Math.random() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (1 + Math.random() * 0.7), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
