import type { Detection } from '@mediapipe/tasks-vision';
import { DetectorClient } from './detectorClient';
import type { ViewportPoint } from './coordinateMapper';

export class MouthTracker {
  private detector: DetectorClient<Detection[]>;
  private target: ViewportPoint = { x: 0.5, y: 0.52 };
  private smooth: ViewportPoint = { x: 0.5, y: 0.52 };

  private constructor(detector: DetectorClient<Detection[]>) { this.detector = detector; }

  static async create(signal?: AbortSignal) {
    const detector = await DetectorClient.create<Detection[]>('face', signal);
    return new MouthTracker(detector);
  }

  update(video: HTMLVideoElement, now: number): ViewportPoint {
    {
        const mouth = this.detector.update(video, now, 167)?.[0]?.keypoints[3];
        if (mouth) {
          const bounds = video.parentElement?.getBoundingClientRect();
          const width = bounds?.width || window.innerWidth;
          const height = bounds?.height || window.innerHeight;
          const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
          const displayedWidth = video.videoWidth * scale;
          const displayedHeight = video.videoHeight * scale;
          const x = 1 - ((width - displayedWidth) * 0.5 + mouth.x * displayedWidth) / width;
          const y = ((height - displayedHeight) * 0.5 + mouth.y * displayedHeight) / height;
          this.target.x = Math.min(1, Math.max(0, x));
          this.target.y = Math.min(1, Math.max(0, y + 0.06));
        }
    }
    this.smooth.x += (this.target.x - this.smooth.x) * 0.4;
    this.smooth.y += (this.target.y - this.smooth.y) * 0.4;
    return this.smooth;
  }

  close() { this.detector.close(); }
}
