# Repository review and deployment readiness

Reviewed the application entry points, components, styles, audio analysis, vision client and worker, gesture logic, coordinate mapping, GPU and Canvas simulation, shaders, build configuration, dependencies, and project documentation. Existing uncommitted rendering work was preserved. No deployment was performed.

## Findings addressed

| Priority | Finding | Resolution |
| --- | --- | --- |
| High | Vite 6.4.3 had published development-server security advisories. | Updated to 6.4.5; online npm audit returned zero known vulnerabilities after the update. Dev and preview now bind to localhost by default. |
| High | Cancelling model startup left its worker running until its startup timeout. A pending permission prompt also had no visible cancel control. | Added an abort signal through both trackers and the worker client, visible cancel/stop buttons, a 75-second overall startup timeout, and cleanup for late permission results. |
| High | Pointing during the breath step could pause condensation before the onboarding threshold and strand the user. | Gate drawing until the breath step completes. The browser flow checks an already-pointing hand during breath. |
| High | An open palm could initiate or retain proximity drawing, making it difficult to stop a stroke. | Proximity now requires an index-only pointing pose. Pinch drawing and fist wiping retain their existing behavior. Added gesture regression coverage. |
| High | A lost WebGL context left its canvas layered over the video fallback, and a failed renderer chunk could take down the interface. | Hide the lost canvas, pause its GPU loop, reset GPU state on restoration, and isolate optional renderer failures with a React error boundary. |
| Medium | On 8-bit render targets, small regeneration and wet-decay updates rounded away every frame. | Added unbiased rounding to the byte-target simulation path so fractional updates accumulate statistically. Float targets retain their existing precision. |
| Medium | Device removal left an apparently active session with frozen input. | Device `ended` events now stop the session and show a reconnect message. Page departure releases the session. |
| Medium | A held Space shortcut could continue fogging after the window lost focus, and shortcuts intercepted browser or button actions. | Clear demo breath on blur and preserve modifier shortcuts, focused buttons, inputs, and editable elements. |
| Medium | The runtime required a third-party CDN request and duplicated a hardcoded npm runtime version. | Build/dev preparation copies the installed MediaPipe bundle and WASM files into public assets. Workers use those local files; model downloads remain external. |
| Medium | Onboarding gave phrases without enough information to calibrate, draw, or pause. Stopping required knowing Esc. | Added short stage-specific instructions, clearer no-hand feedback, a visible stop control, live announcements, and larger touch controls. |
| Medium | There were no repeatable regression checks or automated build gate. | Added core tests, a production browser smoke script, `npm run check`, and GitHub Actions for checks and browser smoke tests. |

## Verification

- TypeScript checking and Vite production build.
- Six core tests: stroke continuity/jump guard; proximity hysteresis; UV orientation; startup abort; startup worker error; point/pinch/release/fist gestures.
- Chromium production smoke checks: mobile intro, production debug disabled, cancellation/media release, denied permissions/retry, WebGL loss/restoration, and Canvas fallback.
- Simulated landmarks and fake browser media exercise calibration → breath demo → drawing → experience → PNG export → resize → stop. This checks orchestration, not real hand recognition or microphone sensitivity.
- Failed renderer download leaves the permission interface and Canvas fallback available.
- Real MediaPipe hand model initializes in a classic worker using locally served WASM and a downloaded Google model.
- Direct WebGL byte-target regression check: sub-byte regeneration refills fog, moisture decays, and condensation memory remains intact.

The Three.js chunk remains about 515 kB uncompressed (about 132 kB gzip). It is already loaded separately. This produces a build warning but does not block static deployment. Avoid hiding this warning by raising the threshold; measure startup on target devices before further bundle work.

## Before public launch

1. Deploy the complete `dist` folder over HTTPS and perform the smoke checks on that URL. This review did not publish the site or validate a hosting provider.
2. Test real hand calibration, pinch/release, pointing, fist wiping, and breath sensitivity on desktop Chrome and Safari, iOS Safari, and Android Chrome. Check low light, denied/revoked permissions, interrupted camera access, device rotation, repeated restart, and PNG downloads. Automated fake devices cannot validate these interactions.
3. Test an actual GPU without float render targets. The byte-path rounding fix passes a direct GPU regression check in Chromium; perceived texture noise and regeneration timing still need a physical device check.
4. Decide whether model files should also be self-hosted. The app still needs access to Google's model storage on first startup. Google Fonts is optional; system fonts work when it is unavailable. No user audio, video, or landmarks are sent to a server.
5. Decide whether both camera and microphone should remain mandatory. That is the current experience contract; there is no microphone-free or pointer drawing mode. Users unable to perform gestures cannot use the drawing interaction. The UI controls are keyboard accessible, but this does not make the core interaction universally accessible.

## Follow-up improvements

- Calibrate breath sensitivity across microphones and provide a sensitivity setting if real tests show inconsistent behavior.
- Profile MediaPipe inference, the blur pass, fog simulation, and Canvas fallback on low-end mobile hardware. Quality selection uses CPU count and screen size, not measured GPU performance.
- Consider a help/recalibration action for users who move the camera or change their resting hand distance mid-session.
- Consider extracting session lifecycle and onboarding state from `App.tsx` as the interaction grows; refs currently keep per-frame data out of React renders.
- Add real-device visual baselines for cleared paths, mouth-centered fog, stroke regeneration, and droplet appearance. A successful build cannot establish their visual quality.
