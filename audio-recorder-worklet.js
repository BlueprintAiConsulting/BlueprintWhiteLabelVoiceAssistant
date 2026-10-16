class AudioRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sourceBuffer = [];
    this.sourceOffset = 0;
    this.pendingSamples = [];
    this.targetSampleRate = 16000;
    this.resampleRatio = sampleRate / this.targetSampleRate;
    this.isReceptionistSpeaking = false;
    this.lastReportTime = 0;

    this.port.onmessage = (event) => {
      if (event.data && typeof event.data.isReceptionistSpeaking === 'boolean') {
        this.isReceptionistSpeaking = event.data.isReceptionistSpeaking;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      const channelData = input[0]; // Mono channel Float32Array
      let energy = 0;
      for (let i = 0; i < channelData.length; i++) {
        energy += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(energy / channelData.length);

      // Periodically report microphone RMS energy back to UI (~12 times/sec) for live VU meter
      const now = currentTime;
      if (now - this.lastReportTime > 0.08) {
        this.lastReportTime = now;
        this.port.postMessage({ type: 'audio-level', level: rms });
      }

      // CRITICAL FOR MOBILE:
      // When the receptionist is listening (!isReceptionistSpeaking), ALWAYS pass audio through
      // with full gain (1.0). Gemini Live's native neural VAD handles start-of-speech & room noise.
      // A client-side noise gate muting lower-RMS mobile microphone input caused mobile speech
      // to be zeroed out (0x0000), making Gemini never hear the caller.
      //
      // When receptionist IS speaking, duck audio unless caller is speaking loud (barge-in)
      // to prevent the smartphone speaker output from looping back into the microphone.
      let gateGain = 1.0;
      if (this.isReceptionistSpeaking) {
        gateGain = rms >= 0.045 ? 1.0 : 0.0;
      }

      for (let i = 0; i < channelData.length; i++) {
        this.sourceBuffer.push(channelData[i]);
      }

      // Linear resampling to 16,000 Hz regardless of native device rate (44.1k/48k)
      while (this.sourceBuffer.length >= 2) {
        const index = Math.floor(this.sourceOffset);
        if (index + 1 >= this.sourceBuffer.length) break;
        const fraction = this.sourceOffset - index;
        const sample = (this.sourceBuffer[index] * (1 - fraction) + this.sourceBuffer[index + 1] * fraction) * gateGain;
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

      // Send ~20 ms packets (320 samples @ 16kHz) for low latency
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
