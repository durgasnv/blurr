# Execution architecture

## Startup and permissions

React owns the instruction stages and the permission button. A click calls `getUserMedia()` once with a front-facing camera and microphone. The stream feeds a hidden `<video>` and a Web Audio `MediaStreamAudioSourceNode`. Permission rejection and missing devices produce recoverable messages. Camera tracks stop and the audio context closes on teardown. Browser permission access requires HTTPS or localhost.

The MediaPipe Hand Landmarker model and WASM runtime load after permission is granted. GPU is attempted first, then CPU. The hosted model and runtime must be reachable during startup. `?debug` shows the mirrored video preview; it is hidden normally.

## Hand-to-canvas pipeline

`requestAnimationFrame` drives the loop. MediaPipe `detectForVideo(video, timestamp)` runs only when `video.currentTime` changes. It yields normalized landmarks; landmark 8 is the index tip. The horizontal coordinate is inverted (`1 - x`) to match a mirrored, front-facing camera. The normalized position is stored independently of viewport pixels, so resizes retain the stroke layout.

The tip is smoothed with a time-based exponential filter. It reacts smoothly across different camera frame rates. Hand loss for 180 ms resets the filter and gesture so returning hands cannot connect to an old stroke. The index-only classifier compares tip-to-wrist distance with the middle finger joint and requires the index to be extended while the middle, ring, and pinky are lowered. Three consecutive positive detections enter DRAW; two negative detections leave it. An open palm and a fist both become IDLE. These rules are simple geometry, not a trained gesture model.

During DRAW, every tracked tip location is added to the fog engine. Intermediate points are inserted at roughly nine-pixel spacing, keeping fast movements continuous. No mouse, pointer, touch, stylus, or keyboard drawing listener exists.

## Breath-to-fog pipeline

An `AnalyserNode` reads waveform and FFT bins each frame. RMS measures amplitude. Spectral flatness and the share of energy above 1.8 kHz favor broadband breath noise. A slowly updated idle noise floor adapts to the room. Evidence must persist for about 280 ms before it counts as blowing; this filters most brief claps. The detected breath level integrates into fog intensity. Microphone behavior differs across devices, so these are practical heuristics rather than a guarantee against every voice or noise.

## Fog and regeneration

`FogCanvas` creates a half-resolution procedural texture with per-pixel grain, cloudy radial gradients, and tiny droplets. It scales that texture over the main Canvas according to accumulated breath. Cleared points are stored with their timestamps. At render time, a faint wet rim is added, then soft circles erase the fog using `destination-out`. Full clearing lasts ten seconds and fades to zero over the next ten. Rendering is throttled to about 30 FPS while trails age; camera analysis still follows `requestAnimationFrame`. Pixel ratio is capped at 1.7 to protect mobile fill rate. Resize rebuilds the texture but preserves normalized trail points.

The darker bathroom scene is CSS; the condensation and wiped paths are Canvas 2D. GSAP animates instruction changes. The permission button is the only required touch/click interaction, because browsers require a user gesture to start media capture.
