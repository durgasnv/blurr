const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist');
const screenshotDir = process.env.BLURR_SCREENSHOT_DIR;
const port = Number(process.env.BLURR_TEST_PORT || 4179);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
  try { const file = path.join(root, new URL(req.url, 'http://localhost').pathname === '/' ? 'index.html' : new URL(req.url, 'http://localhost').pathname); if (!file.startsWith(root + path.sep)) throw new Error('Outside build'); const data = await fs.readFile(file); res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(data); }
  catch { res.writeHead(404); res.end(); }
});
(async () => {
 await new Promise(r => server.listen(port, '127.0.0.1', r));
 const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
 try {
  const context = await browser.newContext({ permissions: ['camera','microphone'], viewport: { width: 390, height: 844 } });
  await context.route('https://fonts.googleapis.com/**', r => r.abort());
  await context.route('https://storage.googleapis.com/**', r => r.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /Shader|WebGL|GL_INVALID/.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/?debug`);
  await page.getByRole('button', { name: 'enable camera + mic' }).waitFor();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.debug-panel').count(), 0);
  if (screenshotDir) await page.screenshot({path:path.join(screenshotDir,'blurr-intro.png')});
  console.log('PASS production intro, mobile layout, debug disabled');
  // Cancellation while real runtime/model startup is in flight.
  await page.getByRole('button', {name:'enable camera + mic'}).click();
  await page.getByRole('button', {name:'cancel', exact:true}).click();
  await page.getByRole('button', {name:'enable camera + mic'}).waitFor();
  assert.equal(await page.locator('.mirror-video').evaluate(v => v.srcObject), null);
  console.log('PASS startup cancellation stops media');
  // Denied permission is actionable and retryable.
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => {throw new DOMException('Denied', 'NotAllowedError')}; });
  await page.getByRole('button', {name:'enable camera + mic'}).click();
  await page.getByText(/access was denied/).waitFor();
  console.log('PASS permission denial and retry control');
  // WebGL context loss exposes fallback; restoring returns GPU rendering.
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.fog-canvas').classList.contains('is-fallback-hidden'));
  await page.evaluate(() => { const canvas=document.querySelector('.glass-surface');window.loss=canvas.getContext('webgl2').getExtension('WEBGL_lose_context');window.loss.loseContext(); });
  await page.waitForFunction(() => !document.querySelector('.fog-canvas').classList.contains('is-fallback-hidden'));
  assert.equal(await page.locator('.glass-surface').evaluate(c=>getComputedStyle(c).visibility), 'hidden');
  await page.evaluate(() => window.loss.restoreContext());
  await page.waitForFunction(() => document.querySelector('.fog-canvas').classList.contains('is-fallback-hidden'));
  console.log('PASS WebGL loss and restore');
  // Simulated landmarks exercise stages and real camera/audio setup without a human hand.
  await page.addInitScript(() => {
    window.createdWorkers=[];
    window.Worker=class {
      constructor() { window.createdWorkers.push(this); this.started=performance.now(); }
      postMessage(message) {
        if(message.type==='init'){this.kind=message.kind;setTimeout(()=>this.onmessage?.({data:{type:'ready'}}),0);return;}
        message.image.close();
        const scale = performance.now()-this.started > 2500 ? 1.5 : 1;
        const p=(x,y)=>({x:0.5+(x-0.5)*scale,y:0.5+(y-0.5)*scale,z:0});
        const lm=Array.from({length:21},()=>p(.5,.5));
        lm[0]=p(.5,.8);lm[5]=p(.4,.55);lm[17]=p(.6,.55);lm[9]=p(.5,.55);
        lm[6]=p(.4,.4);lm[8]=p(.4,.2);lm[4]=p(.7,.5);
        lm[10]=p(.5,.4);lm[12]=p(.5,.65);lm[14]=p(.55,.4);lm[16]=p(.55,.65);lm[18]=p(.6,.4);lm[20]=p(.6,.65);
        setTimeout(()=>this.onmessage?.({data:{type:'result', result:this.kind==='hand'?[lm]:[]}}),0);
      }
      terminate(){this.terminated=true;this.onmessage=null;}
    };
  });
  await page.reload();
  await page.getByRole('button', {name:'enable camera + mic'}).click();
  await page.getByText('blow gently.',{exact:true}).waitFor({timeout:15000});
  await page.locator('main').click({position:{x:10,y:100}});
  await page.keyboard.down('Space');
  await page.getByText('come closer.',{exact:true}).waitFor({timeout:15000});
  await page.keyboard.up('Space');
  await page.getByText('draw me something.',{exact:true}).waitFor({timeout:15000});
  await page.waitForSelector('.stage-experience', {timeout:15000});
  const [download] = await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'save mirror as PNG'}).click()]);
  assert.equal(download.suggestedFilename(),'blurr.png');
  await page.setViewportSize({width:844,height:390});
  await page.waitForTimeout(500);
  if (screenshotDir) await page.screenshot({path:path.join(screenshotDir,'blurr-experience.png')});
  await page.getByRole('button',{name:'stop camera + mic'}).click();
  assert.equal(await page.locator('.mirror-video').evaluate(v=>v.srcObject),null);
  assert.equal(await page.evaluate(()=>window.createdWorkers.every(w=>w.terminated)),true);
  console.log('PASS calibration → breath → drawing → experience → PNG → resize → stop (simulated landmarks)');
  assert.deepEqual(errors,[]);
  console.log('PASS no uncaught page errors or shader errors');
  const noise = await fs.readFile(path.resolve(__dirname, '../src/shaders/noise.glsl'), 'utf8');
  const mask = await fs.readFile(path.resolve(__dirname, '../src/shaders/fogMask.frag'), 'utf8');
  const byteState = await page.evaluate(({noise, mask}) => {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) throw new Error('Byte simulation check requires WebGL');
    const shader = (kind, source) => {
      const shader = gl.createShader(kind);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, 'attribute vec2 position; varying vec2 vUv; void main(){vUv=position*.5+.5;gl_Position=vec4(position,0.,1.);}'));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, 'precision highp float;\n'+noise+'\n'+mask));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program,'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const texture = () => {
      const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      const data = new Uint8Array(8*8*4);
      for(let i=0;i<data.length;i+=4){data[i]=0;data[i+1]=255;data[i+2]=128;data[i+3]=255;}
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,8,8,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
      return texture;
    };
    let read=texture(),write=texture();
    gl.bindFramebuffer(gl.FRAMEBUFFER,gl.createFramebuffer()); gl.viewport(0,0,8,8);
    const uniform=(name,value)=>gl.uniform1f(gl.getUniformLocation(program,name),value);
    uniform('uQuantize',1);uniform('uWetDecay',.001);uniform('uRegeneration',.001);uniform('uAspect',1);
    uniform('uEraseRadius',.02);
    gl.uniform2f(gl.getUniformLocation(program,'uEraseFrom'),-10,-10);
    gl.uniform2f(gl.getUniformLocation(program,'uEraseTo'),-10,-10);
    gl.uniform2f(gl.getUniformLocation(program,'uTexel'),1/8,1/8);
    for(let i=1;i<=1500;i++) {
      gl.bindTexture(gl.TEXTURE_2D,read);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,write,0);
      uniform('uStepSeed',i); gl.drawArrays(gl.TRIANGLES,0,6); [read,write]=[write,read];
    }
    const pixels=new Uint8Array(8*8*4);
    gl.readPixels(0,0,8,8,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let fog=0,wet=0,memory=0;
    for(let i=0;i<pixels.length;i+=4){fog+=pixels[i];wet+=pixels[i+1];memory+=pixels[i+2];}
    const result={fog:fog/64,wet:wet/64,memory:memory/64,error:gl.getError()};
    // A fingertip erases its neighborhood while distant fog stays intact.
    gl.bindTexture(gl.TEXTURE_2D,read);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,write,0);
    uniform('uRegeneration',0);uniform('uWetDecay',0);
    uniform('uEraseRadius',.18);uniform('uEraseStrength',1);
    gl.uniform2f(gl.getUniformLocation(program,'uEraseFrom'),.5,.5);
    gl.uniform2f(gl.getUniformLocation(program,'uEraseTo'),.5,.5);
    gl.drawArrays(gl.TRIANGLES,0,6);
    gl.readPixels(0,0,8,8,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    result.strokeCenter=pixels[(3*8+3)*4];
    result.distantFog=pixels[0];
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return result;
  },{noise,mask});
  assert.equal(byteState.error,0);
  assert.ok(byteState.fog>100, JSON.stringify(byteState));
  assert.ok(byteState.wet<10, JSON.stringify(byteState));
  assert.equal(byteState.memory,128);
  assert.ok(byteState.strokeCenter<10, JSON.stringify(byteState));
  assert.ok(byteState.distantFog>100, JSON.stringify(byteState));
  console.log('PASS real byte-target shader refills fog and decays moisture below byte precision');
  await context.close();
  const fallbackContext = await browser.newContext();
  await fallbackContext.route('https://**', r => r.abort());
  await fallbackContext.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
      if (kind === 'webgl' || kind === 'webgl2') return null;
      return original.call(this, kind, ...args);
    };
  });
  const fallback = await fallbackContext.newPage();
  await fallback.goto(`http://127.0.0.1:${port}/`);
  await fallback.getByRole('button', {name: 'enable camera + mic'}).waitFor();
  await fallback.waitForTimeout(500);
  assert.equal(await fallback.locator('.fog-canvas').evaluate(c => getComputedStyle(c).visibility), 'visible');
  console.log('PASS Canvas fallback when WebGL is unavailable');
  await fallbackContext.close();
  const chunkContext = await browser.newContext();
  await chunkContext.route('https://**', r => r.abort());
  await chunkContext.route('**/assets/GlassSurface-*.js', r => r.abort());
  const chunkPage = await chunkContext.newPage();
  await chunkPage.goto(`http://127.0.0.1:${port}/`);
  await chunkPage.getByRole('button', {name: 'enable camera + mic'}).waitFor();
  await chunkPage.waitForTimeout(500);
  assert.equal(await chunkPage.locator('.fog-canvas').evaluate(c => getComputedStyle(c).visibility), 'visible');
  assert.equal(await chunkPage.locator('.glass-surface').count(), 0);
  console.log('PASS failed renderer chunk preserves usable interface and Canvas fallback');
  await chunkContext.close();
  if (process.env.BLURR_TEST_REAL_MODELS === '1') {
    const realContext = await browser.newContext({permissions:['camera','microphone']});
    await realContext.route('https://fonts.googleapis.com/**', r => r.abort());
    const realPage = await realContext.newPage();
    await realPage.goto(`http://127.0.0.1:${port}/`);
    await realPage.getByRole('button', {name:'enable camera + mic'}).click();
    await realPage.getByText('show me your hand.', {exact:true}).waitFor({timeout:70000});
    await realPage.getByRole('button', {name:'stop camera + mic'}).click();
    console.log('PASS real local WASM worker and downloaded hand model initialize');
    await realContext.close();
  }
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
