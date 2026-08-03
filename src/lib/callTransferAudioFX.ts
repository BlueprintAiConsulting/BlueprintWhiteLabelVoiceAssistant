/**
 * Web Audio API Telephony Sound Effects Generator
 * Synthesizes North American Ringback Tones (440Hz + 480Hz) and DTMF tones.
 */

class CallTransferAudioFX {
  private ctx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private intervalId: any = null;
  private isRinging: boolean = false;

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Start playing US Telephony Ringback tone (440Hz + 480Hz, 2s ON / 4s OFF)
   */
  public startRingback() {
    if (this.isRinging) return;
    this.isRinging = true;

    const playBurst = () => {
      if (!this.isRinging) return;
      try {
        const audioCtx = this.getContext();
        
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, audioCtx.currentTime); // 440 Hz

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(480, audioCtx.currentTime); // 480 Hz

        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        // Soft envelope: ramp up 0.1s, fade out last 0.1s of 2.0s burst
        gain.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.95);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);

        osc1.start(audioCtx.currentTime);
        osc2.start(audioCtx.currentTime);

        osc1.stop(audioCtx.currentTime + 2.0);
        osc2.stop(audioCtx.currentTime + 2.0);
      } catch (err) {
        console.warn('Audio FX playback notice:', err);
      }
    };

    // Play first burst immediately
    playBurst();

    // Repeat every 6 seconds (2s ring + 4s pause)
    this.intervalId = setInterval(() => {
      if (this.isRinging) playBurst();
    }, 6000);
  }

  /**
   * Stop ringback tone
   */
  public stopRingback() {
    this.isRinging = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Play quick touch-tone keypress sound
   */
  public playDTMF(freq1: number = 697, freq2: number = 1209, durationMs: number = 120) {
    try {
      const audioCtx = this.getContext();
      const o1 = audioCtx.createOscillator();
      const o2 = audioCtx.createOscillator();
      const g = audioCtx.createGain();

      o1.type = 'sine';
      o1.frequency.setValueAtTime(freq1, audioCtx.currentTime);
      o2.type = 'sine';
      o2.frequency.setValueAtTime(freq2, audioCtx.currentTime);

      g.gain.setValueAtTime(0.1, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (durationMs / 1000));

      o1.connect(g);
      o2.connect(g);
      g.connect(audioCtx.destination);

      o1.start();
      o2.start();
      o1.stop(audioCtx.currentTime + (durationMs / 1000));
      o2.stop(audioCtx.currentTime + (durationMs / 1000));
    } catch (e) {
      // Ignore audio autoplay restrictions if unhandled
    }
  }
}

export const callTransferAudioFX = new CallTransferAudioFX();
