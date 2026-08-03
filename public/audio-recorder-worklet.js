class AudioRecorderProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      const channelData = input[0]; // Mono channel Float32Array
      
      // Convert Float32Array [-1.0, 1.0] to Int16Array [-32768, 32767]
      const pcm16 = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        let val = Math.max(-1, Math.min(1, channelData[i]));
        pcm16[i] = val < 0 ? val * 0x8000 : val * 0x7FFF;
      }
      
      // Transfer the underlying ArrayBuffer
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }
    return true;
  }
}

registerProcessor('audio-recorder-processor', AudioRecorderProcessor);
