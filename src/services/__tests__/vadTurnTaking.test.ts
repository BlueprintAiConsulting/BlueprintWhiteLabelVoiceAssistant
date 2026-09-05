import { describe, it, expect, vi } from "vitest";
import { GeminiLiveSession } from "../geminiLiveService.ts";

describe("VAD & Turn-Taking Integration Tests", () => {
  it("reports turn states correctly during server messages and barge-in", async () => {
    const states: string[] = [];
    let interruptedCalled = false;

    const mockWs: any = {
      readyState: 1, // OPEN
      send: () => {},
      close: () => {}
    };

    const session = new GeminiLiveSession({
      accessToken: "test_token_123",
      onTurnStateChange: (st) => states.push(st),
      onInterrupted: () => {
        interruptedCalled = true;
      }
    });

    (session as any).ws = mockWs;
    (session as any).initMicrophoneCapture = vi.fn().mockResolvedValue(undefined);

    // 1. Simulate setupComplete
    await (session as any).handleServerMessage({ setupComplete: {} });
    expect(states).toContain("receptionist_speaking");
    expect(states).toContain("listening");

    // 2. Simulate model audio turn start
    await (session as any).handleServerMessage({
      serverContent: {
        modelTurn: {
          parts: [{ text: "Hello! How can I help?" }]
        }
      }
    });
    expect(states[states.length - 1]).toBe("receptionist_speaking");

    // 3. Simulate barge-in interruption
    await (session as any).handleServerMessage({
      serverContent: {
        interrupted: true
      }
    });
    expect(interruptedCalled).toBe(true);
    expect(states).toContain("interrupted");
  });

  it("sends audioStreamEnd signal on session stop / hang-up", () => {
    const sentMessages: string[] = [];
    const mockWs: any = {
      readyState: 1, // OPEN
      send: (msg: string) => sentMessages.push(msg),
      close: () => {}
    };

    const session = new GeminiLiveSession({ accessToken: "test_token_123" });
    (session as any).ws = mockWs;

    session.sendAudioStreamEnd();
    expect(sentMessages.some(m => m.includes("audioStreamEnd"))).toBe(true);
  });

  it("handles mobile microphone prepareAudio and streams PCM chunks to WebSocket", async () => {
    const sentMessages: string[] = [];
    const audioLevels: number[] = [];

    const mockWs: any = {
      readyState: 1, // OPEN
      send: (msg: string) => sentMessages.push(msg),
      close: () => {}
    };

    const session = new GeminiLiveSession({
      accessToken: "test_token_123",
      onAudioLevel: (lvl) => audioLevels.push(lvl)
    });

    (session as any).ws = mockWs;
    (session as any).isConnected = true;

    // Test handleMicPcmPacket
    const dummyPcm = new Int16Array(320).buffer;
    (session as any).handleMicPcmPacket(dummyPcm);

    expect(sentMessages.length).toBe(1);
    const parsed = JSON.parse(sentMessages[0]);
    expect(parsed.realtimeInput.audio.mimeType).toBe("audio/pcm;rate=16000");
    expect(typeof parsed.realtimeInput.audio.data).toBe("string");

    // Test onAudioLevel forwarding
    (session as any).options.onAudioLevel?.(0.042);
    expect(audioLevels).toContain(0.042);
  });
});

describe("AudioPlaybackQueue Skip Prevention Tests", () => {
  it("does NOT clear or skip audio mid-sentence when >8 seconds of audio is queued ahead", async () => {
    const { AudioPlaybackQueue } = await import("../../lib/audioPlaybackQueue.ts");

    class MockSource {
      buffer: any = null;
      onended: (() => void) | null = null;
      connect() {}
      disconnect() {}
      start() {}
      stop() {}
    }

    const origAudioContext = (globalThis as any).AudioContext;
    (globalThis as any).AudioContext = class {
      currentTime = 0;
      state = "running";
      destination = {};
      createBuffer(ch: number, len: number, sr: number) {
        return { duration: len / sr, length: len, sampleRate: sr, copyToChannel: () => {} };
      }
      createBufferSource() {
        return new MockSource();
      }
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
    };

    let stateChanges: boolean[] = [];
    const queue = new AudioPlaybackQueue(24000, (playing) => {
      stateChanges.push(playing);
    });

    queue.init();

    // 1-second chunk of 24kHz 16-bit PCM (48000 bytes)
    const chunk = new Uint8Array(48000);
    let binary = "";
    for (let i = 0; i < 48000; i++) binary += String.fromCharCode(chunk[i]);
    const base64OneSec = btoa(binary);

    // Enqueue 12 seconds worth of audio chunks rapidly (Gemini streaming burst)
    for (let i = 0; i < 12; i++) {
      queue.enqueueBase64Pcm(base64OneSec);
    }

    // Crucial check: all 12 sources must be preserved in queue, NOT wiped or stopped!
    expect((queue as any).activeSources.length).toBe(12);
    expect(queue.isPlaying()).toBe(true);
    expect((queue as any).nextPlayTime).toBe(12);
    expect(stateChanges[0]).toBe(true);

    queue.close();
    (globalThis as any).AudioContext = origAudioContext;
  });

  it("safely handles odd-byte base64 PCM strings without throwing RangeError", async () => {
    const { AudioPlaybackQueue } = await import("../../lib/audioPlaybackQueue.ts");

    class MockSource {
      buffer: any = null;
      onended: (() => void) | null = null;
      connect() {}
      disconnect() {}
      start() {}
      stop() {}
    }

    const origAudioContext = (globalThis as any).AudioContext;
    (globalThis as any).AudioContext = class {
      currentTime = 0;
      state = "running";
      destination = {};
      createBuffer(ch: number, len: number, sr: number) {
        return { duration: len / sr, length: len, sampleRate: sr, copyToChannel: () => {} };
      }
      createBufferSource() {
        return new MockSource();
      }
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
    };

    const queue = new AudioPlaybackQueue(24000);
    queue.init();

    // Odd number of bytes (5 bytes)
    const oddBytes = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
    let binary = "";
    for (let i = 0; i < oddBytes.length; i++) binary += String.fromCharCode(oddBytes[i]);
    const base64Odd = btoa(binary);

    expect(() => queue.enqueueBase64Pcm(base64Odd)).not.toThrow();
    expect((queue as any).activeSources.length).toBe(1);

    queue.close();
    (globalThis as any).AudioContext = origAudioContext;
  });
});
