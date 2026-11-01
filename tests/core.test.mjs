import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function load(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source.replaceAll('import.meta.env.BASE_URL', "'/'"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

test('stroke stamps cover a segment, cap work, and never bridge a tracking jump', async () => {
  const { forEachStamp } = await load('src/simulation/stamps.ts');
  const stamps = [];
  forEachStamp({ x: 0.1, y: 0.5 }, { x: 0.2, y: 0.5 }, 10, 1000, 500, (x, y) => stamps.push({ x, y }));
  assert.equal(stamps.length, 20);
  assert.deepEqual(stamps.at(-1), { x: 0.2, y: 0.5 });
  stamps.length = 0;
  forEachStamp({ x: 0, y: 0 }, { x: 1, y: 1 }, 1, 1000, 500, (x, y) => stamps.push({ x, y }));
  assert.deepEqual(stamps, [{ x: 1, y: 1 }]);
});

test('proximity uses hysteresis and releases without losing calibration', async () => {
  const { ProximityTracker } = await load('src/vision/gestures.ts');
  const tracker = new ProximityTracker();
  tracker.calibrate(0.1);
  for (let now = 100; now <= 1000; now += 100) tracker.update(0.14, now);
  assert.equal(tracker.state, 'TOUCHING_GLASS');
  for (let now = 1100; now <= 2000; now += 100) tracker.update(0.12, now);
  assert.equal(tracker.state, 'TOUCHING_GLASS');
  for (let now = 2100; now <= 3000; now += 100) tracker.update(0.1, now);
  assert.equal(tracker.state, 'HOVER');
  tracker.release();
  assert.equal(tracker.calibratedScale, 0.1);
});

test('viewport corners map to mirrored-glass UV orientation', async () => {
  const { viewportToGlassUv } = await load('src/vision/coordinateMapper.ts');
  assert.deepEqual(viewportToGlassUv({ x: 0, y: 0 }), { x: 0, y: 1 });
  assert.deepEqual(viewportToGlassUv({ x: 1, y: 1 }), { x: 1, y: 0 });
});

test('worker startup abort terminates immediately and rejects', async () => {
  const original = globalThis.Worker;
  const workers = [];
  globalThis.Worker = class {
    constructor() { workers.push(this); }
    postMessage() {}
    terminate() { this.terminated = true; }
  };
  try {
    const { DetectorClient } = await load('src/vision/detectorClient.ts');
    const controller = new AbortController();
    const pending = DetectorClient.create('hand', controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(workers[0].terminated, true);
    await assert.rejects(DetectorClient.create('hand', controller.signal), { name: 'AbortError' });
    assert.equal(workers[1].terminated, true);
  } finally { globalThis.Worker = original; }
});

test('a worker startup error releases its resources', async () => {
  const original = globalThis.Worker;
  let worker;
  globalThis.Worker = class {
    constructor() { worker = this; }
    postMessage() { queueMicrotask(() => this.onmessage({ data: { type: 'error', error: 'Model unavailable' } })); }
    terminate() { this.terminated = true; }
  };
  try {
    const { DetectorClient } = await load('src/vision/detectorClient.ts');
    await assert.rejects(DetectorClient.create('hand'), /Model unavailable/);
    assert.equal(worker.terminated, true);
  } finally { globalThis.Worker = original; }
});

test('fingertip drawing stays active without pinch or fist pause gates', async () => {
  const { isPointing, HandIntentTracker } = await load('src/vision/handIntent.ts');
  const point = (x, y) => ({ x, y, z: 0 });
  const lm = Array.from({ length: 21 }, () => point(0.5, 0.5));
  lm[0] = point(0.5, 0.8);
  for (const [tip, middle, x] of [[8, 6, .4], [12, 10, .5], [16, 14, .55], [20, 18, .6]]) {
    lm[middle] = point(x, .4);
    lm[tip] = point(x, .2);
  }
  lm[4] = point(.7, .5);
  assert.equal(isPointing(lm), false);
  lm[12].y = lm[16].y = lm[20].y = .65;
  assert.equal(isPointing(lm), true);
  const intent = new HandIntentTracker();
  assert.equal(intent.update(lm), 'DRAW');
  lm[4] = { ...lm[8] };
  assert.equal(intent.update(lm), 'DRAW');
  lm[4] = point(.7, .5);
  assert.equal(intent.update(lm), 'DRAW');
  assert.equal(intent.update(lm), 'DRAW');
  lm[8].y = .65;
  assert.equal(intent.update(lm), 'DRAW');
  assert.equal(intent.update(lm), 'DRAW');
});

test('only a sustained open palm clears; pointing and curled fingers never wipe', async () => {
  const { HandIntentTracker, isOpenPalm } = await load('src/vision/handIntent.ts');
  const p = (x,y) => ({x,y,z:0});
  const lm = Array.from({length:21}, () => p(.5,.5));
  lm[0]=p(.5,.8);lm[5]=p(.4,.55);lm[17]=p(.6,.55);lm[9]=p(.5,.55);lm[4]=p(.2,.5);
  for (const [tip, middle, x] of [[8,6,.35],[12,10,.45],[16,14,.55],[20,18,.65]]) {
    lm[middle]=p(x,.4);lm[tip]=p(x,.15);
  }
  assert.equal(isOpenPalm(lm),true);
  const tracker = new HandIntentTracker();
  for(let i=0;i<4;i++) assert.equal(tracker.update(lm),'IDLE');
  assert.equal(tracker.update(lm),'WIPE');
  for(const tip of [12,16,20]) lm[tip].y=.65;
  assert.equal(isOpenPalm(lm),false);
  for(let i=0;i<10;i++) assert.notEqual(tracker.update(lm),'WIPE');
  lm[8].y=.65;
  for(let i=0;i<10;i++) assert.equal(tracker.update(lm),'DRAW');
  tracker.reset();
});
