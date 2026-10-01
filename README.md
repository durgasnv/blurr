# Blurr

A touchless, cinematic bathroom mirror. Blow toward the microphone to fog the glass, then hold up only your index finger and draw in the air to wipe a path through the condensation. Open your palm or make a fist to pause. The fog returns gradually.

## Run

```bash
npm install
npm run dev
```

Open the local address shown by Vite. Use `npm run build` for a production build. Camera and microphone access require `localhost` or HTTPS. Grant both permissions when prompted. The hand model and MediaPipe WASM runtime are fetched at startup, so the first launch needs an internet connection.

## Controls

1. Select **Enable camera + microphone**. This button only starts permission requests; drawing has no pointer input.
2. Blow steadily toward the microphone until the mirror clouds over. A short clap should not count.
3. Hold up your index finger with the other fingers folded, then move it in front of the camera to clear the fog.
4. Open your palm or close your fist to reposition without drawing.

Add `?debug` to the URL to see a small, mirrored camera preview. Camera and microphone data are processed locally in the browser. The MediaPipe runtime and model come from their hosted URLs.

## How it works

See [docs/architecture.md](docs/architecture.md) for the camera, gesture, breath, Canvas, timing, and performance pipeline. [docs/development-guide.md](docs/development-guide.md) keeps the requested 12-phase build and debugging guide.

## Limitations

- Breath sensitivity varies by microphone, distance, and browser audio processing. Headsets may need a longer breath.
- One hand is tracked at a time. Strong backlighting or an occluded fingertip can interrupt a stroke.
- The hand model runs in the browser and may lower the effective frame rate on older phones.
