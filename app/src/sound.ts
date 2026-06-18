// Крошечные синтезированные эффекты через WebAudio: без файлов, работают офлайн.
// Создаётся лениво при первом проигрывании (webview Telegram требует жеста).
let ctx: AudioContext | null = null
let muted = localStorage.getItem('krMuted') === '1'

export function isSoundOn(): boolean { return !muted }
export function setSoundOn(on: boolean): void {
  muted = !on
  localStorage.setItem('krMuted', muted ? '1' : '0')
}

function audioCtx(): AudioContext | null {
  if (muted) return null
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = ctx ?? new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}

function blip(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'sine', peak = 0.12): void {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, at)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g); g.connect(c.destination)
  o.start(at); o.stop(at + dur + 0.02)
}

export type Sfx = 'reveal' | 'correct' | 'wrong' | 'turn' | 'win' | 'lose' | 'tap' | 'tick'

export function playSfx(name: Sfx): void {
  const c = audioCtx()
  if (!c) return
  const t = c.currentTime
  switch (name) {
    case 'tap': blip(c, 660, t, 0.06, 'sine', 0.05); break
    case 'reveal': blip(c, 523, t, 0.1, 'triangle', 0.06); blip(c, 784, t + 0.06, 0.12, 'triangle', 0.05); break
    case 'turn': blip(c, 720, t, 0.1, 'sine', 0.06); break
    case 'tick': blip(c, 440, t, 0.04, 'square', 0.03); break
    case 'wrong': blip(c, 200, t, 0.16, 'sawtooth', 0.05); break
    case 'correct': [659.25, 880, 1174.7].forEach((f, i) => blip(c, f, t + i * 0.06, 0.18, 'triangle', 0.08)); break
    case 'win': [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(c, f, t + i * 0.09, 0.26, 'triangle', 0.1)); break
    case 'lose': [392, 330, 262].forEach((f, i) => blip(c, f, t + i * 0.12, 0.24, 'sine', 0.08)); break
  }
}
