'use strict';

// Classic worker: MediaPipe's WASM loader needs importScripts().
importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.js');
let detector;
let kind;
self.onmessage = async ({ data: message }) => {
  try {
    if (message.type === 'init') {
      kind = message.kind;
      const files = await Vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
      detector = kind === 'hand'
        ? await Vision.HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'CPU' },
          runningMode: 'VIDEO', numHands: 1,
          minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        })
        : await Vision.FaceDetector.createFromOptions(files, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite', delegate: 'CPU' },
          runningMode: 'VIDEO', minDetectionConfidence: 0.5,
        });
      self.postMessage({ type: 'ready' });
    } else if (message.type === 'frame') {
      try {
        const result = detector.detectForVideo(message.image, message.at);
        self.postMessage({ type: 'result', result: kind === 'hand' ? result.landmarks : result.detections });
      } finally { message.image.close(); }
    }
  } catch (error) {
    self.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};
