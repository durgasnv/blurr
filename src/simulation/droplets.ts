import { Vector3 } from 'three';
import type { GlassUv } from '../vision/coordinateMapper';

const MAX_DROPS = 12;

export class DropletSimulation {
  readonly positions = Array.from({ length: MAX_DROPS }, () => new Vector3(-10, -10, 0));
  private velocity = new Float32Array(MAX_DROPS);
  private spawnClock = 0;
  count = 0;

  update(seconds: number, fogAmount: number) {
    const dt = Math.min(seconds, 0.1);
    if (fogAmount > 0.12) {
      this.spawnClock += dt * (0.25 + fogAmount * 1.3);
      if (this.spawnClock >= 1 && this.count < MAX_DROPS) {
        this.spawnClock -= 1;
        this.spawn();
      }
    }

    for (let i = 0; i < this.count; i++) {
      const drop = this.positions[i];
      if (this.velocity[i] > 0) {
        this.velocity[i] += 0.014 * dt;
        drop.y -= this.velocity[i] * dt;
      }
      if (drop.y < -drop.z) {
        this.remove(i);
        i--;
        continue;
      }
      for (let j = i + 1; j < this.count; j++) {
        const other = this.positions[j];
        const distance = Math.hypot(drop.x - other.x, drop.y - other.y);
        if (distance < Math.min(drop.z, other.z) * 0.85) {
          drop.x = (drop.x * drop.z + other.x * other.z) / (drop.z + other.z);
          drop.y = (drop.y * drop.z + other.y * other.z) / (drop.z + other.z);
          drop.z = Math.min(0.035, Math.sqrt(drop.z * drop.z + other.z * other.z));
          this.velocity[i] = Math.max(this.velocity[i], this.velocity[j], drop.z > 0.017 ? 0.003 : 0);
          this.remove(j);
          j--;
        }
      }
    }
  }

  disturb(at: GlassUv) {
    for (let i = 0; i < this.count; i++) {
      const drop = this.positions[i];
      const distance = Math.hypot(drop.x - at.x, drop.y - at.y);
      if (distance < drop.z + 0.025) this.velocity[i] = Math.max(this.velocity[i], 0.013);
    }
  }

  private spawn() {
    const radius = 0.005 + Math.random() * 0.014;
    const drop = this.positions[this.count];
    drop.set(0.18 + Math.random() * 0.64, 0.45 + Math.random() * 0.42, radius);
    this.velocity[this.count] = radius > 0.015 && Math.random() < 0.4 ? 0.002 : 0;
    this.count++;
  }

  private remove(index: number) {
    const last = this.count - 1;
    if (index !== last) {
      this.positions[index].copy(this.positions[last]);
      this.velocity[index] = this.velocity[last];
    }
    this.positions[last].set(-10, -10, 0);
    this.velocity[last] = 0;
    this.count--;
  }
}
