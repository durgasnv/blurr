import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import type { ViewportPoint } from './coordinateMapper';

const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';

export class MouthTracker {
  private detector: FaceDetector;
  private lastVideoTime = -1;
  private frame = 0;
  private target: ViewportPoint = { x: 0.5, y: 0.52 };
  private smooth: ViewportPoint = { x: 0.5, y: 0.52 };

  private constructor(detector: FaceDetector) { this.detector = detector; }

  static async create() {
    const vision = await FilesetResolver.forVisionTasks(WASM);
    const detector = await FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.5,
    });
    return new MouthTracker(detector);
  }

  update(video: HTMLVideoElement, now: number): ViewportPoint {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0
      && video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      if (++this.frame % 5 === 0) {
        const mouth = this.detector.detectForVideo(video, now).detections[0]?.keypoints[3];
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
    }
    this.smooth.x += (this.target.x - this.smooth.x) * 0.4;
    this.smooth.y += (this.target.y - this.smooth.y) * 0.4;
    return this.smooth;
  }

  close() { this.detector.close(); }
}
