# V2 execution architecture

## Startup and privacy

`App.tsx` owns the permission button and the experience stages. A user click requests a front-facing camera and microphone with `getUserMedia()`. The camera video is hidden in the normal V2 scene; it is used by MediaPipe's Hand Landmarker. A Web Audio source reads microphone samples. Audio and video stay in the browser. The hand model and WASM runtime load from hosted URLs after permission is granted.

The Three.js glass and MediaPipe tracker are loaded as separate JavaScript chunks. If startup is interrupted, the media tracks, audio context, and tracker are released. If WebGL cannot start, the existing Canvas 2D fog and mirrored video provide a fallback. `?debug` works only with Vite's development build.

## Vision and gesture path

`src/lib/hand.ts` runs inference only when the camera supplies a new video frame. It reads landmark 8, maps the tip through the visible `object-fit: cover` crop, mirrors it, and smooths its position with a time-based exponential filter. `src/vision/coordinateMapper.ts` then converts normalized top-left viewport coordinates into bottom-left WebGL UV coordinates.

`src/vision/gestures.ts` classifies index-only pointing, open palm, fist, and other poses. Three positive frames enter drawing mode; two negative frames leave it. Losing the hand for 180 ms resets smoothing and gesture state. There are no pointer, touch, stylus, or keyboard drawing listeners.

## Audio path

`src/audio/blowDetector.ts` reuses waveform and FFT arrays. It measures RMS volume, spectral flatness, and energy above 1.8 kHz against an adaptive idle noise floor. Breath evidence has to persist for about 280 ms. The reusable sample reports volume, smoothed blow strength, blowing state, duration, and diagnostic measures. These thresholds are heuristics and may need tuning for a particular microphone.

## GPU condensation state

`src/simulation/fogMask.ts` owns two `WebGLRenderTarget` textures. Each simulation pass reads one target and writes the other, then swaps them. Red stores current fog, green stores temporary wetness around cleared strokes, and blue stores the highest local condensation as a regeneration target. Resize copies the mask into new targets using normalized UVs.

The mask shader in `src/shaders/fogMask.frag` grows mist from the center as sustained breaths continue. It uses procedural variation so growth is uneven. A drawing segment subtracts fog along the path and deposits moisture in a ring. Consecutive fingertip positions are joined only across short tracking gaps; hand speed subtly changes stroke width and strength. Regeneration moves cleared pixels back toward their stored target over roughly 10–20 seconds while slightly softening edges.

## Glass and water

`src/components/GlassSurface.tsx` manages the Three.js scene, fullscreen plane, renderer, animation loop, resize observer, and disposal. `src/shaders/glass.frag` samples the fog mask and layered noise. It shifts coordinates of an abstract room background to mimic refraction, softens fogged regions, scatters light, and shades wet rims. Cleared regions use less displacement and look sharper.

`src/simulation/droplets.ts` maintains a small fixed pool of droplets. Larger drops can move downward; nearby drops can merge; drawing can disturb them. The glass shader uses their positions for lens distortion, highlights, and darker edges. It does not draw a field of obvious particle circles.

`src/utils/performance.ts` selects high, medium, or low quality from viewport pixel count and logical CPU count. The settings limit pixel ratio, mask resolution, active droplets, frame interval, and shader work. The Canvas 2D fog renderer from V1 remains in `src/lib/fog.ts` for fallback.

## Interface

`src/components/ExperienceOverlay.tsx` shows a minimal permission screen and short onboarding phrases. GSAP fades between phrases. A gesture label appears briefly, then disappears. Rare drawing and idle messages are driven by activity in `App.tsx`. `src/components/DebugPanel.tsx` is available only in development mode.
