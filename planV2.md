Upgrade blurr. into a highly polished, immersive, touchless interactive web experience.

The concept is a digital bathroom mirror after a hot shower.

There must be ZERO mouse, trackpad, touchscreen, or keyboard interaction required for drawing.

The user's body is the interface.

The experience should work like:

User approaches → enables camera + microphone → blows toward microphone → realistic condensation forms across glass → raises index finger → moves finger through the air → webcam tracks fingertip → condensation clears along finger trajectory → user draws hearts/messages/designs → water droplets react → condensation slowly reforms.

V1 used Canvas 2D.

V2 should upgrade the visual rendering system to Three.js + custom GLSL shaders so the glass, condensation, distortion, refraction, and water feel significantly more realistic.

1. Tech Stack

Use:

React

Vite

TypeScript

Three.js

React Three Fiber where useful

GLSL vertex/fragment shaders

MediaPipe Tasks Vision / Hand Landmarker

Web Audio API

getUserMedia()

GSAP for interface transitions where appropriate

WebGL render targets / textures for the fog mask

Do NOT use mouse movement as a substitute for hand tracking in the final experience.

Development/debugging controls may exist temporarily but must be removable.

2. Visual Direction

The project is called:

blurr.

The aesthetic should be:

minimal

dreamy

intimate

slightly mysterious

cinematic

Gen Z

soft

premium

experimental

Avoid:

dashboards

visible cards

excessive buttons

neon cyberpunk styling

gaming UI

unnecessary gradients

huge text

excessive instructions

The screen itself should feel like a physical sheet of glass.

Typography should be lowercase wherever appropriate.

The experience should communicate through tiny phrases such as:

hush.

come a little closer.

blow gently.

again...

raise your finger.

draw me something.

<3

Text should feel like part of the experience rather than application instructions.

3. Opening Experience

Start with an almost completely empty screen.

Centered:

blurr.

Underneath, subtly:

come a little closer.

Then provide one minimal permission control:

enable camera + mic

After permission is granted, transition smoothly into:

blow gently.

The camera feed should NOT normally appear as a traditional webcam rectangle.

It exists primarily for computer vision.

During development, provide a debug mode that can show:

webcam feed

detected hand

landmarks

fingertip position

blow strength

gesture state

FPS

Debug mode must be disabled in the final experience.

4. Blow Detection

Use the Web Audio API to analyse microphone input.

Create a reusable system such as:

useBlowDetection()

Return:

volume

blowStrength

isBlowing

blowDuration

Do not classify every loud sound as blowing.

Consider:

sustained audio energy

duration

frequency distribution

broadband/noise-like characteristics

smoothing over multiple frames

Short events such as:

clapping

clicking

keyboard sounds

short speech

should ideally not trigger significant condensation.

A longer breath should create more fog.

Example:

small blow
→ light mist

medium blow
→ visible condensation

long sustained blow
→ heavily fogged glass

Do not instantly fog the entire screen.

Condensation should grow organically.

5. Hand Tracking

Use MediaPipe Hand Landmarker.

Track the user's hand continuously through the webcam.

Extract the index fingertip landmark.

Map normalized webcam coordinates to viewport coordinates.

Correct for mirrored camera behavior so movement feels intuitive:

physical hand moves right
→ virtual finger moves right

Apply coordinate smoothing.

Never directly use raw MediaPipe coordinates for drawing.

Use interpolation such as:

smoothedPosition = lerp(previousPosition, detectedPosition, factor)

Balance smoothing so the cursor feels stable without becoming noticeably delayed.

Handle temporary tracking loss gracefully.

6. Gesture Recognition

The user must intentionally enter drawing mode.

Do not draw whenever a hand happens to appear.

Recognize at least:

☝️ Index finger extended
→ DRAW

🖐 Open palm
→ IDLE

✊ Closed fist
→ IDLE

The gesture state should remain stable for several frames before changing to prevent flickering.

During onboarding, briefly display:

draw

or

idle

Once the user understands the interaction, remove these indicators.

7. Replace Canvas Fog With a GLSL Glass Shader

This is the major V2 upgrade.

Create a fullscreen WebGL surface representing glass.

Build a custom GLSL fragment shader responsible for rendering:

clear glass

condensation

microscopic fog variation

water droplets

refraction

distortion

light scattering

cleared finger paths

wet edges

Do NOT simply overlay a translucent white texture.

The glass should react optically to condensation.

8. Procedural Condensation

Generate condensation using procedural noise.

Explore techniques such as:

Simplex noise

Perlin-style noise

FBM / fractal Brownian motion

layered noise

Voronoi noise where useful

The condensation mask should contain varying density.

Some regions should be:

almost transparent

lightly misted

heavily condensed

covered with tiny droplets

Avoid obvious repeating patterns.

Condensation should slowly evolve over time.

9. Fog Mask

Maintain a separate fog/condensation mask.

Conceptually:

0.0 = completely clear glass

1.0 = fully condensed glass

Blowing should increase values in this mask.

Finger movement should decrease values.

The GLSL shader should use the mask to determine:

opacity

blur

refraction strength

roughness

distortion

droplet visibility

This mask can be implemented using:

CanvasTexture

or preferably, for the advanced implementation:

WebGLRenderTarget

ping-pong framebuffer simulation

Choose the architecture that provides good performance and clean separation.

10. Finger Drawing

When ☝️ DRAW mode is active:

MediaPipe
→ index fingertip
→ smoothed coordinates
→ UV coordinates
→ fog mask

The finger should erase condensation around its position.

Do NOT create a visible artificial cursor in the final experience.

Interpolate between consecutive fingertip positions.

Fast movements should still produce continuous lines.

The result should allow the user to physically draw:

♥

:)

names

letters

stars

small illustrations

entirely by moving their finger through the air.

11. Finger Pressure Illusion

Although the webcam cannot measure actual pressure, fake it.

Estimate interaction intensity using factors such as:

hand velocity

gesture confidence

time spent over an area

Slow movement could create a stronger, wider cleared trail.

Fast movement could create a slightly thinner/imperfect trail.

Keep this subtle.

It should feel organic rather than obviously algorithmic.

12. Wet Edges

A real finger dragged through condensation pushes moisture toward the edges.

Simulate this.

Around freshly cleared strokes:

create slightly darker wet boundaries

increase local droplet density

create subtle highlights

distort background light slightly

The center should appear clearer.

The boundary should appear wetter.

This is important for making the interaction feel physical.

13. Water Droplets

Introduce procedural water droplets.

Droplets should have:

different sizes

subtle highlights

refraction

distortion

varying opacity

Some should remain stationary.

Some should merge.

Occasionally, sufficiently large droplets should begin moving downward.

Approximate:

velocity += gravity

position += velocity

Do not create hundreds of obvious particle circles.

They must look integrated into the wet glass.

14. Refraction

This is one of the most important V2 effects.

Objects/light behind wet regions of glass should appear slightly distorted.

Use:

normal perturbation

UV displacement

noise

droplet normals

Conceptually:

backgroundUV += normal.xy * refractionStrength

Clear finger trails should have much less distortion than condensed regions.

This contrast should make drawing feel extremely satisfying.

15. Background

Do not leave the background completely flat.

Create something subtle behind the glass so refraction is visible.

Possible direction:

A dark atmospheric room with:

extremely soft warm lights

vague silhouettes

depth

gentle bokeh

subtle movement

Keep everything abstract.

The glass is still the hero.

When fogged:

background becomes diffused.

When cleared:

background becomes noticeably sharper.

16. Breath Reaction

Condensation should respond spatially and temporally to blowing.

Instead of:

blow
→ entire screen opacity increases

create something closer to:

blow begins
→ central/localized mist appears
→ fog expands
→ nearby condensation patches merge
→ tiny droplets appear
→ glass gradually becomes opaque

When blowing stops, existing condensation remains.

Multiple breaths should accumulate.

17. Fog Memory

Every part of the glass should effectively remember its condensation amount.

If the user draws:

██████████████
████   ♥  ████
██████████████

only the heart-shaped region should become clear.

Later:

clear heart
→ edges soften
→ thin mist appears
→ heart becomes cloudy
→ fully fogged again

Regeneration should happen over roughly 10–20 seconds, with slight randomness.

Avoid perfectly uniform regeneration.

18. Drawing Feedback

When the user begins drawing, avoid obvious UI feedback.

Instead, communicate through physics.

Their fingertip movement should immediately:

clear fog

shift nearby moisture

reveal sharper background

create wet boundaries

potentially disturb droplets

This physical response IS the feedback.

19. Tiny Easter Eggs

Add a few subtle interactions.

For example, after someone successfully draws for the first time:

cute.

could briefly appear behind the glass.

If the user draws for a long time:

okay artist.

If they clear a very large portion:

you missed a spot.

Keep these rare.

Do not turn the experience into a game.

20. Idle Behaviour

If the user does nothing for a while:

condensation slowly evolves.

Droplets occasionally move.

Eventually show something subtle like:

still there?

If the user blows again:

the text disappears into condensation.

21. Performance

Target smooth interaction.

Aim for approximately 60 FPS on modern laptops where possible.

Do not perform expensive allocations every frame.

Reuse:

vectors

arrays

textures

buffers

Run MediaPipe inference at a reasonable rate rather than unnecessarily running expensive inference every rendered frame.

Render animation separately from hand inference where useful.

Use adaptive quality if necessary.

Possible quality settings:

high
→ full shader effects + droplets

medium
→ reduced droplets/noise octaves

low
→ simplified refraction

Automatically choose sensible defaults.

22. Privacy

Camera and microphone processing should happen locally in the browser.

Do not upload:

webcam footage

microphone recordings

hand landmarks

to a server.

Communicate this subtly during permission onboarding:

camera + mic stay on your device.

23. Architecture

Keep systems separate.

Example:

src/
components/
Experience.tsx
Glass.tsx
PermissionScreen.tsx
DebugPanel.tsx

vision/
handTracker.ts
gestures.ts
coordinateMapper.ts

audio/
blowDetector.ts

simulation/
condensation.ts
droplets.ts
fogMask.ts

shaders/
glass.vert
glass.frag
condensation.glsl
droplets.glsl
noise.glsl

hooks/
useHandTracking.ts
useBlowDetection.ts
useGesture.ts

utils/
smoothing.ts
performance.ts

Do not put the entire implementation inside App.tsx.

24. Development Strategy

Build V2 incrementally.

Phase 1 — Glass

Create the fullscreen Three.js/WebGL glass surface.

Phase 2 — Shader

Create basic clear/fogged glass states.

Phase 3 — Procedural Fog

Introduce GLSL noise and realistic condensation variation.

Phase 4 — Fog Mask

Create a persistent editable condensation mask.

Phase 5 — Hand Tracking

Integrate MediaPipe and accurately map the fingertip to shader UV coordinates.

Phase 6 — Air Drawing

Allow fingertip movement to erase the condensation mask.

At this point I must be able to draw a recognizable heart entirely by moving my finger through the air.

Phase 7 — Gestures

Implement ☝️ DRAW and 🖐/✊ IDLE.

Phase 8 — Blow Detection

Integrate microphone breath detection.

Phase 9 — Fog Growth

Map breath strength and duration to condensation accumulation.

Phase 10 — Refraction

Add realistic wet-glass distortion.

Phase 11 — Wet Finger Trails

Create moisture displacement around cleared strokes.

Phase 12 — Droplets

Add realistic water droplets and limited gravity behavior.

Phase 13 — Fog Regeneration

Slowly restore condensation over cleared areas.

Phase 14 — Experience Design

Add the hush. onboarding, microcopy and transitions.

Phase 15 — Polish

Optimize performance, responsive behavior, tracking stability and visual realism.

25. Teaching Requirement

Do NOT dump the complete codebase immediately.

For every phase:

Explain what we are building in simple terms.

Give me the task first.

Let me attempt it.

Provide reference code afterward.

Explain only the important concepts.

Explain what I should visually expect.

Give me a test checklist.

Give me 2–3 debugging challenges.

Only then continue.

I want to understand:

shaders

WebGL

MediaPipe

hand tracking

coordinate systems

audio analysis

render targets

procedural noise

compositing

real-time graphics

rather than blindly copying a generated project.

Final Experience

The final experience should feel like this:

I open the website.

Almost nothing is visible.

blurr.

come a little closer.

I enable the camera and microphone.

blow gently.

I blow toward my laptop.

A tiny layer of mist appears.

I blow again.

Condensation spreads organically across the glass.

Tiny droplets begin forming.

The world behind the glass becomes soft and distorted.

raise your finger.

I hold ☝️ in front of the webcam.

draw me something.

I physically trace a heart in the air.

As my finger moves, the corresponding path through the condensation clears.

♥

The background becomes sharp through the heart.

Water gathers around its edges.

A droplet slowly runs downward.

Then:

cute.

The text fades.

Over the next several seconds, condensation slowly creeps back over the heart until it disappears.

The experience returns to silence.

blurr.

The finished project should feel less like a website and more like a tiny interactive digital art piece living inside the browser.
