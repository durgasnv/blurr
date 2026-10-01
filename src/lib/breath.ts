export class BreathDetector {
  private context: AudioContext;
  private source: MediaStreamAudioSourceNode;
  private analyser: AnalyserNode;
  private waveform: Float32Array<ArrayBuffer>;
  private spectrum: Uint8Array<ArrayBuffer>;
  private noiseFloor = 0.008;
  private candidateMs = 0;
  private lastAt = 0;
  private active = false;
  level = 0;

  constructor(stream: MediaStream) {
    this.context = new AudioContext();
    this.source = this.context.createMediaStreamSource(stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.5;
    this.source.connect(this.analyser);
    this.waveform = new Float32Array(this.analyser.fftSize);
    this.spectrum = new Uint8Array(this.analyser.frequencyBinCount);
  }

  async resume() { await this.context.resume(); }

  update(now: number) {
    const dt = this.lastAt ? Math.min(100, now - this.lastAt) : 16;
    this.lastAt = now;
    this.analyser.getFloatTimeDomainData(this.waveform);
    this.analyser.getByteFrequencyData(this.spectrum);
    let energy = 0;
    for (const value of this.waveform) energy += value * value;
    const rms = Math.sqrt(energy / this.waveform.length);

    const hzPerBin = this.context.sampleRate / this.analyser.fftSize;
    let total = 0, high = 0, logSum = 0, bins = 0;
    const first = Math.ceil(300 / hzPerBin);
    const last = Math.min(this.spectrum.length - 1, Math.floor(6000 / hzPerBin));
    for (let i = first; i <= last; i++) {
      const magnitude = this.spectrum[i] / 255;
      total += magnitude;
      if (i * hzPerBin > 1800) high += magnitude;
      logSum += Math.log(magnitude + 0.001);
      bins++;
    }
    const flatness = Math.exp(logSum / bins) / (total / bins + 0.001);
    const highRatio = high / (total + 0.001);
    const likelyBreath = rms > Math.max(0.018, this.noiseFloor * 2.4)
      && flatness > 0.28 && highRatio > 0.32;

    if (!likelyBreath) this.noiseFloor += (Math.min(rms, 0.07) - this.noiseFloor) * 0.012;
    this.candidateMs = likelyBreath ? Math.min(1000, this.candidateMs + dt) : Math.max(0, this.candidateMs - dt * 2);
    this.active = this.candidateMs >= 280;
    const target = this.active ? Math.min(1, (rms - this.noiseFloor) * 12 + 0.22) : 0;
    this.level += (target - this.level) * (this.active ? 0.18 : 0.1);
    return this.level;
  }

  async close() {
    this.source.disconnect();
    await this.context.close();
  }
}
