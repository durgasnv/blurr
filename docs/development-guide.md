# Progressive build guide

The app is complete, but each phase below can be repeated independently for learning. Each item gives an implementation task, the reference location, the key concept, a test, and a debugging challenge. Keep one conventional commit per self-contained change when working through the phases.

| Phase | Task | Reference / concept | Test | Debugging challenge |
| --- | --- | --- | --- | --- |
| 1 | Add a fullscreen Canvas and textured condensation. | `src/lib/fog.ts`: reusable texture, Canvas resizing. | Resize the page; fog covers it without stretching. | Compare 1x and high-DPI screens. |
| 2 | Request the webcam and display the mirrored reflection. | `src/App.tsx`: `getUserMedia`, fullscreen `<video>`, `?debug`. | Grant permission and see your face behind the Canvas. | Deny permission, then retry. |
| 3 | Load MediaPipe and inspect hand landmarks. | `src/lib/hand.ts`: video-mode detection. | Move a hand into view; tracking begins. | Handle first-load model failure. |
| 4 | Read landmark 8 as the index tip. | `src/lib/hand.ts`: normalized coordinates. | Follow the tip in the debug feed. | Check fingertip occlusion. |
| 5 | Mirror and map the tip through the visible camera crop. | `src/lib/hand.ts`, `src/lib/fog.ts`: `object-fit: cover`, mirrored normalized points. | Move left; clearing should move left over the reflected fingertip. | Try portrait and landscape cameras. |
| 6 | Smooth the tip and handle hand loss. | `src/lib/hand.ts`: exponential filter, 180 ms reset. | Move slowly and leave/re-enter the frame. | Tune lag versus jitter. |
| 7 | Distinguish index-only DRAW from IDLE. | `src/lib/hand.ts`: joint distances and frame hysteresis. | Point, open your hand, then make a fist. | Test a rotated hand. |
| 8 | Erase fog along interpolated finger paths. | `src/lib/fog.ts`: intermediate points, `destination-out`. | Draw a heart in the air; the line stays continuous. | Move fast and inspect for gaps. |
| 9 | Detect sustained blowing with Web Audio. | `src/lib/breath.ts`: RMS, spectrum, duration. | Blow, speak, and clap separately. | Tune thresholds for a quiet microphone. |
| 10 | Integrate breath strength into fog accumulation and re-fogging. | `src/App.tsx`, `src/lib/fog.ts`: intensity integration and trail aging. | Blow after drawing; the clear path clouds over again. | Verify frame-rate independence. |
| 11 | Add cloudy grain, droplets, wet rims, and return. | `src/lib/fog.ts`: texture and timestamped points. | Watch a wiped stroke return over 10–20 seconds. | Check long sessions for slowdown. |
| 12 | Refine the experience and hide debugging UI. | `src/styles.css`, `src/App.tsx`: staged UI, GSAP, `?debug`. | Complete the flow with no drawing device. | Check mobile layouts and reduced motion. |
