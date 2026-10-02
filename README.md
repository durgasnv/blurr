# blurr.

A small touchless glass experience. Enable the camera and microphone, blow gently to grow condensation, then raise one index finger and draw in the air. Cleared paths reveal a sharper room, collect moisture at their edges, and slowly fog over again.

## Run

```bash
npm install
npm run dev
```

Open the local address shown by Vite. Use `npm run build` for a production build. Media permissions require localhost or HTTPS. The MediaPipe model and WASM runtime are fetched after permission is granted, so the first launch needs an internet connection.

## Interaction

1. Select **enable camera + mic**. This is the only required pointer or keyboard action.
2. Blow steadily toward the microphone. Brief clicks and claps should not build significant fog.
3. Point one index finger toward the camera and trace a shape in the air. Open your hand or close your fist to pause.
4. Wait for the path to refog, or blow again to add more condensation.

The camera supplies hand tracking. It is hidden behind the V2 glass in normal use. Camera and microphone data are processed on the device; neither recordings nor landmarks are uploaded. The model and runtime are downloaded from hosted URLs.

Development mode supports `?debug` for a camera preview, hand landmarks, fingertip marker, gesture, blow readings, and FPS. The debug overlay is disabled in production builds.

## Implementation

Three.js renders a fullscreen glass surface with custom GLSL shaders. A two-target GPU mask stores local fog, wet edges, and each pixel's condensation memory. Breath expands fog from the center; the tracked, smoothed fingertip clears continuous segments; the mask refills over roughly 10–20 seconds. The shader adds procedural variation, room refraction, light scattering, and a small number of moving droplets. Quality scales automatically with device capability. Canvas 2D remains as a fallback when WebGL cannot start.

See [the V2 architecture](docs/architecture.md), [the V1 comparison](docs/v1-to-v2.md), and the original [V2 brief](planV2.md). The corrected Canvas 2D version is preserved on the `v1` branch.

## Current limits

- Breath sensitivity depends on microphone hardware, distance, and browser audio processing.
- One hand is tracked at a time; occlusion and strong backlighting can interrupt a stroke.
- WebGL and MediaPipe performance vary by device. Visual quality and the hand-to-glass feel still need a real camera and microphone check.
