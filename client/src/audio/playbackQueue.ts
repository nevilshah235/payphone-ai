export class PlaybackQueue {
  private ctx: AudioContext;
  private nextStart = 0;
  private sampleRate = 16000;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  setSampleRate(sr: number) {
    this.sampleRate = sr;
  }

  /** Enqueue a PCM16 mono chunk for gapless playback. */
  enqueue(pcm16: Uint8Array) {
    if (pcm16.length < 2) return;
    // Copy into an aligned Int16Array
    const int16 = new Int16Array(pcm16.byteLength / 2);
    const view = new DataView(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
    for (let i = 0; i < int16.length; i++) int16[i] = view.getInt16(i * 2, true);

    const float = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float[i] = (int16[i] ?? 0) / 0x8000;

    const buffer = this.ctx.createBuffer(1, float.length, this.sampleRate);
    buffer.copyToChannel(float, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    const start = Math.max(now, this.nextStart);
    src.start(start);
    this.nextStart = start + buffer.duration;
  }

  flush() {
    this.nextStart = this.ctx.currentTime;
  }
}
