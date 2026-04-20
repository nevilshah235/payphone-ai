// AudioWorklet that downsamples mic audio (usually 48kHz) to 16kHz PCM16
// and posts Int16Array buffers of ~20ms (320 samples) to the main thread.
class MicWorklet extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const target = (options && options.processorOptions && options.processorOptions.targetRate) || 16000;
    this.targetRate = target;
    this.ratio = sampleRate / target;
    this.frameSize = Math.floor(target * 0.02); // 20ms @ target rate
    this.carry = [];
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    // cheap linear resample
    const out = [];
    for (let i = 0; i < channel.length; i += this.ratio) {
      const idx = Math.floor(i);
      out.push(channel[idx]);
    }
    this.carry.push(...out);
    while (this.carry.length >= this.frameSize) {
      const frame = this.carry.splice(0, this.frameSize);
      const pcm = new Int16Array(frame.length);
      for (let j = 0; j < frame.length; j++) {
        const s = Math.max(-1, Math.min(1, frame[j]));
        pcm[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor("mic-worklet", MicWorklet);
