export class AudioPlaybackQueue {
  private ctx: AudioContext | null = null;
  private sampleRate: number;
  private nextPlayTime: number = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private onPlaybackStateChange?: (isPlaying: boolean) => void;
  private playbackEndTimer: any = null;

  constructor(sampleRate: number = 24000, onPlaybackStateChange?: (isPlaying: boolean) => void) {
    this.sampleRate = sampleRate;
    this.onPlaybackStateChange = onPlaybackStateChange;
  }

  public setPlaybackStateChangeCallback(cb: (isPlaying: boolean) => void) {
    this.onPlaybackStateChange = cb;
  }

  public init(existingCtx?: AudioContext) {
    if (existingCtx && existingCtx.state !== "closed") {
      this.ctx = existingCtx;
    } else if (!this.ctx) {
      const prewarmed = typeof window !== "undefined" ? (window as any).__prewarmedAudioCtx : null;
      if (prewarmed && prewarmed.state !== "closed") {
        this.ctx = prewarmed;
      } else {
        const AudioCtx = typeof window !== "undefined"
          ? (window.AudioContext || (window as any).webkitAudioContext)
          : (globalThis as any).AudioContext;
        if (AudioCtx) {
          try {
            this.ctx = new AudioCtx({ sampleRate: this.sampleRate });
          } catch (_) {
            this.ctx = new AudioCtx();
          }
        }
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
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

  public isPlaying(): boolean {
    if (!this.ctx) return false;
    return this.activeSources.length > 0 && this.nextPlayTime > this.ctx.currentTime;
  }

  public enqueueBase64Pcm(base64Data: string) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;

    if (this.ctx.state === "suspended") void this.ctx.resume();

    try {
      const binaryStr = atob(base64Data);
      const len = binaryStr.length;
      if (len === 0) return;

      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // Safe 16-bit PCM integer decoding (safely handles odd byte length without RangeError)
      const numSamples = Math.floor(len / 2);
      if (numSamples === 0) return;

      const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, numSamples);
      const float32 = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      const audioBuffer = this.ctx.createBuffer(1, float32.length, this.sampleRate);
      audioBuffer.copyToChannel(float32, 0);

      const source = this.ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.ctx.destination);

      const wasPlaying = this.isPlaying();
      const currentTime = this.ctx.currentTime;
      // Schedule gaplessly onto Web Audio timeline. If audio clock advanced past nextPlayTime, start immediately.
      const startTime = Math.max(this.nextPlayTime, currentTime);
      source.start(startTime);
      this.nextPlayTime = startTime + audioBuffer.duration;

      this.activeSources.push(source);

      if (!wasPlaying) {
        this.onPlaybackStateChange?.(true);
      }

      this.schedulePlaybackEndCheck();

      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx > -1) this.activeSources.splice(idx, 1);
        this.checkPlaybackEnded();
      };
    } catch (err) {
      console.error("Error decoding PCM audio chunk:", err);
    }
  }

  private schedulePlaybackEndCheck() {
    if (this.playbackEndTimer) clearTimeout(this.playbackEndTimer);
    if (!this.ctx) return;
    const remainingMs = Math.max(0, (this.nextPlayTime - this.ctx.currentTime) * 1000) + 60;
    this.playbackEndTimer = setTimeout(() => {
      this.checkPlaybackEnded();
    }, remainingMs);
  }

  private checkPlaybackEnded() {
    if (!this.ctx) {
      this.onPlaybackStateChange?.(false);
      return;
    }
    if (this.activeSources.length === 0 || this.ctx.currentTime >= this.nextPlayTime - 0.05) {
      if (this.playbackEndTimer) {
        clearTimeout(this.playbackEndTimer);
        this.playbackEndTimer = null;
      }
      this.onPlaybackStateChange?.(false);
    }
  }

  public clear() {
    if (this.playbackEndTimer) {
      clearTimeout(this.playbackEndTimer);
      this.playbackEndTimer = null;
    }
    this.activeSources.forEach((source) => {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch (_) {}
    });
    this.activeSources = [];
    if (this.ctx) {
      this.nextPlayTime = this.ctx.currentTime;
    }
    this.onPlaybackStateChange?.(false);
  }

  public close() {
    this.clear();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
