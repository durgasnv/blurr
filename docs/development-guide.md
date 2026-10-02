# V2 learning and debugging guide

The full brief is in [planV2.md](../planV2.md). The 15 changes are committed separately on `main`; the corrected Canvas 2D project is on `v1`. For each phase below, try the task first, then inspect the reference file. The checklist describes what to verify in a browser. Camera, microphone, shader appearance, and frame rate need a real device check; a successful build alone cannot prove them.

## 1. Glass

Task: Put a Three.js plane across the entire viewport and handle resize and cleanup. Concept: an orthographic camera maps a quad directly to the screen. Expect a subtle glass layer from edge to edge.

- Check: resize and rotate the viewport; confirm there are no gaps.
- Debug: compare CSS size with the drawing buffer; inspect disposal on unmount.
- Reference: `src/components/GlassSurface.tsx`.

## 2. Shader

Task: Replace the plain material with a custom vertex and fragment shader. Concept: the vertex shader sends UVs; the fragment shader colors each pixel. Expect distinct clear and fogged values.

- Check: confirm the shader compiles and changes with fog intensity.
- Debug: inspect shader compile logs; check UV orientation.
- Reference: `src/shaders/glass.vert`, `src/shaders/glass.frag`.

## 3. Procedural fog

Task: Mix broad and fine noise across the glass. Concept: FBM combines several scales of smooth noise. Expect uneven patches that drift slowly.

- Check: pause and watch for slow evolution without obvious tiling.
- Debug: display one noise octave at a time; reduce the frequency if patterns look grainy.
- Reference: `src/shaders/noise.glsl`.

## 4. Fog mask

Task: Store condensation in two alternating render targets. Concept: a shader cannot safely read and write the same texture in one pass. Expect fog to persist between frames and through resize.

- Check: add fog, wait, and resize; its layout should remain.
- Debug: render the red mask channel directly; verify the read/write swap order.
- Reference: `src/simulation/fogMask.ts`, `src/shaders/fogMask.frag`.

## 5. Hand tracking

Task: map the smoothed index tip to glass UVs. Concept: camera cropping, mirroring, and the flipped WebGL Y axis all affect alignment. Expect the development marker to follow the fingertip.

- Check: move the hand to all four corners in `?debug`.
- Debug: compare mirrored and unmirrored X; test portrait and landscape crops.
- Reference: `src/lib/hand.ts`, `src/vision/coordinateMapper.ts`.

## 6. Air drawing

Task: erase the GPU mask between consecutive fingertip points. Concept: distance to a line segment fills gaps between camera frames. Expect a recognizable heart drawn entirely in the air.

- Check: draw slowly and quickly; look for breaks or long accidental lines.
- Debug: inspect the segment endpoints; test tracking loss longer than 95 ms.
- Reference: `src/simulation/fogMask.ts`, `src/components/GlassSurface.tsx`.

## 7. Gestures

Task: gate drawing on an index-only pose. Concept: frame hysteresis prevents flicker. Expect an open palm and fist to pause clearing.

- Check: alternate pointing, open palm, and fist in `?debug`.
- Debug: inspect finger-to-wrist distances; try a rotated hand.
- Reference: `src/vision/gestures.ts`.

## 8. Blow detection

Task: use audio level, spectrum, and duration to estimate a sustained breath. Concept: broadband noise differs from many short sharp sounds. Expect a clap to leave the glass mostly unchanged.

- Check: compare a clap, short speech, and a long blow.
- Debug: inspect RMS against the noise floor; compare flatness and high-frequency ratio.
- Reference: `src/audio/blowDetector.ts`.

## 9. Fog growth

Task: expand condensation outward as breaths continue. Concept: a spatial growth kernel changes individual mask pixels. Expect successive breaths to build fog organically.

- Check: compare a short and long breath; the center should cloud first.
- Debug: render only the growth field; inspect duration-to-radius mapping.
- Reference: `src/shaders/fogMask.frag`, `src/components/GlassSurface.tsx`.

## 10. Refraction

Task: distort and soften the room behind wet glass. Concept: a local normal shifts the background sample coordinate. Expect a cleared stroke to look sharper than its surroundings.

- Check: compare the same light through fog and a clear path.
- Debug: amplify displacement to find its direction; inspect mask gradients.
- Reference: `src/shaders/glass.frag`, `src/shaders/background.glsl`.

## 11. Wet trails

Task: store moisture around each cleared segment. Concept: the mask's green channel can carry a short-lived rim independent of fog. Expect a darker edge and a slight highlight.

- Check: draw slowly and quickly, then watch the rim fade.
- Debug: display the green channel alone; check whether radius changes feel too obvious.
- Reference: `src/shaders/fogMask.frag`, `src/shaders/glass.frag`.

## 12. Droplets

Task: add a limited set of refractive drops with occasional gravity and merging. Concept: reuse a fixed pool rather than allocating particles each frame. Expect sparse, integrated water rather than a particle effect.

- Check: wait after heavy fog and watch for a falling drop.
- Debug: draw droplet bounds in development; inspect merge distance and velocity.
- Reference: `src/simulation/droplets.ts`, `src/shaders/glass.frag`.

## 13. Fog regeneration

Task: restore cleared pixels toward their stored condensation. Concept: a separate memory channel preserves the local target. Expect a drawing to fade over about 10–20 seconds.

- Check: draw a heart, stop, and watch its center and edges refill.
- Debug: display the blue memory channel; verify that a new breath raises the target.
- Reference: `src/shaders/fogMask.frag`.

## 14. Experience design

Task: use a quiet opening and short phrases that respond to the body. Concept: interface feedback can come from the glass itself. Expect only one permission control and no visible drawing cursor.

- Check: follow onboarding from permission through first drawing and idle.
- Debug: test a denied permission; test reduced motion and a short mobile viewport.
- Reference: `src/components/ExperienceOverlay.tsx`, `src/styles.css`.

## 15. Polish

Task: select GPU quality, inspect frame rate and input diagnostics, and verify cleanup. Concept: adapt visual cost to hardware while keeping input responsive. Expect a smooth experience on capable laptops and a usable simpler one on slower devices.

- Check: use `?debug` in development; build for production and verify debug cannot be enabled there.
- Debug: profile the glass shader and MediaPipe separately; test permission cancellation or component teardown during model load.
- Reference: `src/utils/performance.ts`, `src/components/DebugPanel.tsx`, `src/App.tsx`.
