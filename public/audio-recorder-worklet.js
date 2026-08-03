class AudioRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sourceBuffer = [];
    this.sourceOffset = 0;
    this.pendingSamples = [];
    this.targetSampleRate = 16000;
    this.resampleRatio = sampleRate / this.targetSampleRate;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      const channelData = input[0]; // Mono channel Float32Array
      for (let i = 0; i < channelData.length; i++) this.sourceBuffer.push(channelData[i]);

      // Linear resampling prevents browsers that ignore the requested
      // AudioContext rate (often 44.1/48 kHz) from sending mislabeled audio.
      while (this.sourceBuffer.length >= 2) {
        const index = Math.floor(this.sourceOffset);
        if (index + 1 >= this.sourceBuffer.length) break;
        const fraction = this.sourceOffset - index;
        const sample = this.sourceBuffer[index] * (1 - fraction) + this.sourceBuffer[index + 1] * fraction;
        const clamped = Math.max(-1, Math.min(1, sample));
        this.pendingSamples.push(clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF);
        this.sourceOffset += this.resampleRatio;

        const consumed = Math.floor(this.sourceOffset);
        if (consumed > 0) {
          const consumable = Math.min(consumed, this.sourceBuffer.length - 1);
          this.sourceBuffer.splice(0, consumable);
          this.sourceOffset -= consumable;
        }
      }

      // Send ~20 ms packets, reducing WebSocket overhead while keeping input
      // latency low enough for natural turn-taking.
      const packetSize = 320;
      while (this.pendingSamples.length >= packetSize) {
        const packet = this.pendingSamples.splice(0, packetSize);
        const packetBuffer = new Int16Array(packet).buffer;
        this.port.postMessage(packetBuffer, [packetBuffer]);
      }
    }
    return true;
  }
}

registerProcessor('audio-recorder-processor', AudioRecorderProcessor);
