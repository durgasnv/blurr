export type BlowSample = {
  volume: number;
  blowStrength: number;
  isBlowing: boolean;
  blowDuration: number;
  flatness: number;
  highRatio: number;
};

export class BlowDetector {
  private context: AudioContext;
  private source: MediaStreamAudioSourceNode;
  private analyser: AnalyserNode;
  private waveform: Float32Array<ArrayBuffer>;
  private spectrum: Uint8Array<ArrayBuffer>;
  private noiseFloor = 0.008;
  private candidateMs = 0;
  private lastAt = 0;
  private sample: BlowSample = {
    volume: 0,
    blowStrength: 0,
    isBlowing: false,
    blowDuration: 0,
    flatness: 0,
    highRatio: 0,
  };

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

  update(now: number): BlowSample {
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
    const likelyBreath = rms > Math.max(0.006, this.noiseFloor * 1.8)
      && flatness > 0.28 && highRatio > 0.32;

    if (!likelyBreath) this.noiseFloor += (Math.min(rms, 0.07) - this.noiseFloor) * 0.012;
    this.candidateMs = likelyBreath ? this.candidateMs + dt : Math.max(0, this.candidateMs - dt * 2);
    const isBlowing = this.candidateMs >= 280;
    const target = isBlowing ? Math.min(1, (rms - this.noiseFloor) * 12 + 0.22) : 0;
    const sample = this.sample;
    sample.volume = rms;
    sample.flatness = flatness;
    sample.highRatio = highRatio;
    sample.isBlowing = isBlowing;
    sample.blowDuration = isBlowing ? this.candidateMs : 0;
    sample.blowStrength += (target - sample.blowStrength) * (isBlowing ? 0.18 : 0.1);
    return sample;
  }

  async close() {
    this.source.disconnect();
    await this.context.close();
  }
}
