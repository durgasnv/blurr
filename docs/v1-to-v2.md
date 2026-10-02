# Blurr V1 and the V2 direction

## Preserved V1

The `v1` branch points to the last Canvas 2D implementation, including the fix that lets small fog intensity changes accumulate. It is the reference for the existing interaction while V2 is developed on `main`.

V1 is a touchless bathroom mirror built with React, Vite, and TypeScript. After a permission click, `getUserMedia()` supplies a front camera and microphone. The fullscreen video is mirrored and visible as the reflection; CSS creates a dark bathroom fallback and subtle shading. Camera and microphone data stay in the browser. MediaPipe's hosted Hand Landmarker model and WASM runtime load after permission is granted.

`src/lib/breath.ts` uses Web Audio waveform RMS, spectral flatness, high frequency energy, an adaptive noise floor, and a sustained duration threshold to estimate blowing. `src/lib/hand.ts` tracks one hand, maps the index fingertip through the video's `object-fit: cover` crop, mirrors it, smooths its position, and uses simple finger geometry with frame hysteresis to enter or leave drawing mode. An open palm or fist is idle.

`src/lib/fog.ts` renders a low resolution grain and droplet texture onto a fullscreen Canvas 2D layer. Blowing raises one global fog intensity. Drawing stores timestamped points, interpolates gaps, and erases soft circles with `destination-out`; a pale rim suggests moisture. Cleared trails last about ten seconds, then refill over the next ten. Another breath refogs existing trails. `src/App.tsx` coordinates permissions, the frame loop, onboarding stages, and GSAP transitions. `?debug` displays a small camera preview and landmarks.

V1's limits are visual and architectural: fog is an alpha texture over the reflection, so there is no optical refraction or spatial condensation state. The clearing path is a list of Canvas circles. Droplets are decorative texture marks rather than moving water. A new blow changes the overall fog intensity instead of growing mist in specific regions. Much of the experience orchestration lives in `App.tsx`.

## What V2 changes

| Area | V1 | V2 target |
| --- | --- | --- |
| Glass rendering | Canvas 2D texture and alpha erasure | Fullscreen Three.js surface with custom GLSL glass shader |
| Condensation state | One global intensity plus timestamped clear points | Persistent spatial fog mask, preferably GPU render targets with ping-pong updates |
| Breath response | Global intensity increases | Mist appears locally, spreads organically, and accumulates across breaths |
| Cleared strokes | Soft erased circles and faint rims | Mask erasure with wet boundaries, displaced moisture, and sharper optical reveal |
| Background | Mirrored camera reflection and CSS room fallback | Abstract atmospheric depth behind refractive glass; camera primarily supports vision |
| Water | Static procedural texture marks | Varied integrated droplets, occasional merging and gravity driven movement |
| Experience design | Large staged instructions and visible status | Nearly empty opening, lowercase microcopy, subtle onboarding and rare reactions |
| Architecture | Three library modules plus orchestration in `App.tsx` | Separate components, vision, audio, simulation, shaders, hooks, and performance utilities |
| Debugging | `?debug` camera and landmarks | Development only diagnostics for hand, tip, breath, gesture, and FPS |

The interaction contract remains: a permission control is allowed, but drawing uses only breath, hand tracking, and gestures. No mouse, touch, trackpad, or keyboard drawing path is part of the finished experience. Media stays on the device; model and runtime assets may still be fetched at startup.

## Incremental build and review

`planV2.md` contains the complete requested brief and its 15 phases. We will work through one phase at a time. For each phase, first give the task and expected visual result, let the user attempt it, then offer reference code, a test checklist, and two or three debugging challenges before moving on. Keep each independent code or documentation change in its own commit.

The first functional milestone is Phase 6: a recognizable heart drawn in the air clears a continuous path through a persistent fog mask. Later phases add gesture gating, breath driven fog growth, refraction, wet trails, droplets, regeneration, experience copy, and performance polish. Build success alone will not prove camera, microphone, gesture, or visual quality; those require browser checks on real devices.
