# Deploying blurr

This is a static Vite app. It needs no backend, database, API keys, or environment variables.

## Build and serve

Use Node 22 or newer and npm:

```bash
npm ci
npm run check
```

Publish the entire `dist/` directory using an HTTPS static host. Set its build command to `npm run build` and its output directory to `dist`. Do not use the Vite development or preview server as the public production server.

`prebuild` and `predev` copy the installed MediaPipe browser bundle and WASM files into generated `public/vendor/mediapipe/` assets. They are copied into `dist` by Vite and must be deployed along with the worker and JavaScript chunks. Do not deploy only `index.html` or omit the vendor directory. The generated directory is ignored by git. The lockfile determines the installed runtime version.

Local verification:

```bash
npm run build
npm run preview
```

The default dev and preview servers listen locally. To test from a phone, use an HTTPS development tunnel or HTTPS host; plain HTTP over a LAN address cannot obtain media permissions. `--host` can expose the server when intentionally needed, but does not enable HTTPS.

For a deployment under a path such as `/blurr/`, build with:

```bash
npm run build -- --base=/blurr/
```

## Hosting requirements

- HTTPS is required except on localhost.
- Serve `.js` as JavaScript and `.wasm` as `application/wasm`.
- Keep `index.html` and `vision-worker.js` revalidating rather than caching them indefinitely. Vite's hashed `assets/` files can use long immutable caching.
- The generated vendor runtime paths are not content hashed. Revalidate them, or purge their cache when upgrading MediaPipe. Retain older hashed JS assets during a rollout when possible so existing tabs can finish loading their chunks.
- Camera/microphone permissions must be available to the page. Embedded deployments also need the parent frame to grant camera and microphone access.
- Models load from `https://storage.googleapis.com/mediapipe-models/`. If adding a Content Security Policy, allow those model fetches, same-origin workers, the local WASM loader, and WASM compilation. Optional fonts use `fonts.googleapis.com` and `fonts.gstatic.com`; the grain texture uses a data image. Verify the policy against a real model load before enforcing it.

## Checks

```bash
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Browser tests run an ephemeral local static server on port 4179 and use fake camera/audio devices plus simulated landmarks. Set `BLURR_TEST_PORT` to change the port. Set `BLURR_SCREENSHOT_DIR` to an existing directory to save the intro and experience screenshots.

An additional online integration check loads the real local runtime and Google's hand model:

```bash
BLURR_TEST_REAL_MODELS=1 npm run test:browser
```

This confirms worker/model initialization, not real recognition accuracy. Browser and OS permissions, real hand tracking, breath sensitivity, and export behavior on phones still need manual checks. See [the repository review](deployment-review.md) for the findings and remaining launch checks.
