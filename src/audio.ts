// Tiny Web Audio sound effects — no asset files, nothing to fetch.
// Two distinct cues: a light "blip" for a pawn move and a low wooden "knock" for a wall.

let ctx: AudioContext | null = null
let muted = false

export function setMuted(m: boolean): void {
  muted = m
}

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface ToneOpts {
  freq: number
  freqEnd?: number
  type: OscillatorType
  dur: number
  gain: number
  delay?: number
}

function tone(c: AudioContext, opts: ToneOpts): void {
  const t0 = c.currentTime + (opts.delay ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = opts.type
  osc.frequency.setValueAtTime(opts.freq, t0)
  if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t0 + opts.dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(opts.gain, t0 + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + opts.dur + 0.02)
}

function noise(c: AudioContext, dur: number, gain: number, cutoff: number, delay = 0): void {
  const t0 = c.currentTime + delay
  const len = Math.floor(c.sampleRate * dur)
  const buffer = c.createBuffer(1, len, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  src.buffer = buffer
  const filt = c.createBiquadFilter()
  filt.type = 'lowpass'
  filt.frequency.value = cutoff
  const g = c.createGain()
  g.gain.value = gain
  src.connect(filt).connect(g).connect(c.destination)
  src.start(t0)
}

/** Soft higher-pitched blip — a pawn move. */
export function playMove(): void {
  if (muted) return
  const c = ensureCtx()
  if (!c) return
  tone(c, { freq: 660, freqEnd: 480, type: 'triangle', dur: 0.09, gain: 0.16 })
}

/** Low wooden knock (transient noise + thud) — a wall placement. */
export function playWall(): void {
  if (muted) return
  const c = ensureCtx()
  if (!c) return
  noise(c, 0.05, 0.12, 1400)
  tone(c, { freq: 190, freqEnd: 80, type: 'sine', dur: 0.16, gain: 0.3 })
}
