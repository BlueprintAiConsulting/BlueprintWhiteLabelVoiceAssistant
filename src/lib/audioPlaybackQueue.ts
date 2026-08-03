export class AudioPlaybackQueue {
  private ctx: AudioContext | null = null;
  private sampleRate: number;
  private nextPlayTime: number = 0;
  private activeSources: AudioBufferSourceNode[] = [];

  constructor(sampleRate: number = 24000) {
    this.sampleRate = sampleRate;
  }

  public init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx({ sampleRate: this.sampleRate });
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    // Unlock iOS AudioContext by playing a silent 1-sample buffer
    try {
      const buffer = this.ctx.createBuffer(1, 1, this.sampleRate);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      source.start(0);
    } catch (_) {}

    this.nextPlayTime = this.ctx.currentTime;
  }

  public enqueueBase64Pcm(base64Data: string) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;

    try {
      const binaryStr = atob(base64Data);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // Convert Int16Array to Float32Array
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      const audioBuffer = this.ctx.createBuffer(1, float32.length, this.sampleRate);
      audioBuffer.copyToChannel(float32, 0);

      const source = this.ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.ctx.destination);

      const startTime = Math.max(this.nextPlayTime, this.ctx.currentTime);
      source.start(startTime);
      this.nextPlayTime = startTime + audioBuffer.duration;

      this.activeSources.push(source);
      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx > -1) this.activeSources.splice(idx, 1);
      };
    } catch (err) {
      console.error("Error decoding PCM audio chunk:", err);
    }
  }

  public clear() {
    this.activeSources.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch (_) {}
    });
    this.activeSources = [];
    if (this.ctx) {
      this.nextPlayTime = this.ctx.currentTime;
    }
  }

  public close() {
    this.clear();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
