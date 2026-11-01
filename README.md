# blurr.

A small touchless glass experience. Enable the camera and microphone, blow gently to grow condensation, then raise one index finger and draw in the air. Cleared paths reveal a sharper reflection, collect moisture at their edges, and slowly fog over again.

## Run

```bash
npm ci
npm run dev
```

Open the local address shown by Vite. Use `npm run build` for a production build. Media permissions require localhost or HTTPS. The MediaPipe runtime is served with the site; models download from Google after permission is granted, so the first launch needs an internet connection. Use Node 22 or newer.

## Interaction

1. Select **enable camera + mic**, then hold an open hand at a comfortable distance for one second to calibrate. You can cancel loading or stop the camera and microphone with the button at the top right.
2. Blow steadily toward the microphone. Brief clicks and claps should not build significant fog.
3. Point one index finger toward the camera and move your hand closer to the glass, or pinch thumb and index finger together, to draw in the air. A fist wipes a wider area.
4. Wait for the path to refog, or blow again to add more condensation. Fog growth pauses while you draw or wipe.

The bottom-left brush slider adjusts the drawing radius from 7 to 38 pixels; the shutter button saves a PNG. Optional keyboard shortcuts: hold Space to demonstrate breath without sound, C to clear drawing, S to save, and Esc to return to the start screen. Drawing itself needs no pointer or keyboard input.

The camera supplies both the visible mirrored reflection and hand tracking. Its image appears through the V2 glass, rather than in a separate webcam rectangle. Camera and microphone data are processed on the device; neither recordings nor landmarks are uploaded. Models download from Google; the runtime is served from the site.

Development mode supports `?debug` for a camera preview, hand landmarks, fingertip marker, gesture, blow readings, and FPS. The debug overlay is disabled in production builds.

## Implementation

Three.js renders a fullscreen glass surface with custom GLSL shaders. A video texture puts the mirrored, cropped camera reflection behind the glass; an abstract room appears before permission is granted. A two-target GPU mask stores local fog, wet edges, and each pixel's condensation memory. An optional face detector places breath fog near the mouth; the tracked fingertip clears continuous segments and the fist makes a broad wipe. The mask refills over roughly 10–20 seconds. The shader adds procedural variation, refraction, light scattering, and a small number of moving droplets. Quality scales automatically with device capability. Canvas 2D remains as a fallback when WebGL cannot start.

See [the V2 architecture](docs/architecture.md), [the V1 comparison](docs/v1-to-v2.md), and the original [V2 brief](planV2.md). The corrected Canvas 2D version is preserved on the `v1` branch.

## Current limits

- Breath sensitivity depends on microphone hardware, distance, and browser audio processing.
- One hand is tracked at a time; occlusion and strong backlighting can interrupt a stroke.
- WebGL and MediaPipe performance vary by device. Visual quality and the hand-to-glass feel still need a real camera and microphone check.
- If the optional face model cannot load, breath still fogs the center of the glass.

## Deployment and checks

Run `npm run check` for regression tests, TypeScript checks, and the production build. Run `npx playwright install chromium` once, then `npm run test:browser` for production browser smoke checks. GitHub Actions runs both on pushes and pull requests.

Publish the complete `dist/` directory over HTTPS. See [deployment instructions](docs/deployment.md) and [the repository review and remaining launch checks](docs/deployment-review.md).
