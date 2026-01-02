type BuzzerHandle = {
  stop: () => void
}

let audioCtx: AudioContext | null = null
let currentHandle: BuzzerHandle | null = null

function getCtx(): AudioContext | null {
  if (audioCtx) return audioCtx
  const AC = (globalThis.AudioContext || (globalThis as any).webkitAudioContext) as
    | typeof AudioContext
    | undefined
  if (!AC) return null
  audioCtx = new AC()
  return audioCtx
}

// Must be called from a user gesture (e.g., Start Turn tap).
export async function unlockAudio(): Promise<void> {
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      // ignore
    }
  }

  // iOS often needs an actual sound "tick" to fully unlock.
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    gain.gain.value = 0.0001
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.02)
  } catch {
    // ignore
  }
}

export function stopBuzzer(): void {
  currentHandle?.stop()
  currentHandle = null
}

export function playBuzzer(durationMs = 2000): void {
  stopBuzzer()
  const ctx = getCtx()
  if (!ctx) return

  // A simple "buzzer" using a square wave + tremolo.
  const osc = ctx.createOscillator()
  osc.type = 'square'
  osc.frequency.value = 110

  const tremolo = ctx.createOscillator()
  tremolo.type = 'square'
  tremolo.frequency.value = 14

  const tremoloGain = ctx.createGain()
  tremoloGain.gain.value = 0.5

  const gain = ctx.createGain()
  gain.gain.value = 0.0

  tremolo.connect(tremoloGain).connect(gain.gain)
  osc.connect(gain).connect(ctx.destination)

  const startAt = ctx.currentTime
  // Quick attack to avoid click, then hold, then release.
  gain.gain.setValueAtTime(0.0, startAt)
  gain.gain.linearRampToValueAtTime(0.25, startAt + 0.02)

  osc.start(startAt)
  tremolo.start(startAt)

  const stopAt = startAt + Math.max(0.2, durationMs / 1000)
  gain.gain.linearRampToValueAtTime(0.0, stopAt - 0.03)
  osc.stop(stopAt)
  tremolo.stop(stopAt)

  const handle: BuzzerHandle = {
    stop: () => {
      try {
        gain.gain.cancelScheduledValues(ctx.currentTime)
        gain.gain.setValueAtTime(0.0, ctx.currentTime)
      } catch {
        // ignore
      }
      try {
        osc.stop()
      } catch {
        // ignore
      }
      try {
        tremolo.stop()
      } catch {
        // ignore
      }
    },
  }

  currentHandle = handle
}

