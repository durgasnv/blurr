/** One transferred frame in flight; no frame queue or inference on the UI thread. */
export class DetectorClient<T> {
  // MediaPipe's WASM loader uses importScripts, so this must be a classic worker.
  private worker = new Worker(`${import.meta.env.BASE_URL}vision-worker.js`);
  private busy = false;
  private closed = false;
  private lastAt = -Infinity;
  private lastVideoTime = -1;
  private result: T | undefined;
  private error: Error | undefined;

  static async create<T>(kind: 'hand' | 'face') {
    const client = new DetectorClient<T>();
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`${kind} tracking took too long to start`)), 60000);
        client.worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
        client.worker.onmessage = event => {
          clearTimeout(timeout);
          if (event.data.type === 'ready') resolve();
          else reject(new Error(event.data.error));
        };
        client.worker.postMessage({ type: 'init', kind });
      });
    } catch (error) { client.close(); throw error; }
    client.worker.onerror = event => { client.busy = false; client.error = new Error(event.message); };
    client.worker.onmessage = event => {
      client.busy = false;
      if (event.data.type === 'error') client.error = new Error(event.data.error);
      else client.result = event.data.result;
    };
    return client;
  }

  update(video: HTMLVideoElement, now: number, interval: number): T | undefined {
    if (this.error) throw this.error;
    const result = this.result;
    this.result = undefined;
    if (!this.closed && !this.busy && now - this.lastAt >= interval
      && video.readyState >= 2 && video.videoWidth > 0 && video.currentTime !== this.lastVideoTime) {
      this.busy = true;
      this.lastAt = now;
      this.lastVideoTime = video.currentTime;
      const width = Math.min(640, video.videoWidth);
      const height = Math.round(width * video.videoHeight / video.videoWidth);
      void createImageBitmap(video, { resizeWidth: width, resizeHeight: height }).then(image => {
        if (this.closed) { image.close(); return; }
        this.worker.postMessage({ type: 'frame', image, at: now }, [image]);
      }).catch(error => { this.busy = false; if (!this.closed) this.error = error; });
    }
    return result;
  }

  close() { this.closed = true; this.worker.terminate(); this.result = undefined; }
}
