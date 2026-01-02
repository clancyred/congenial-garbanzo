function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0
  const c = globalThis.crypto as Crypto | undefined
  if (c?.getRandomValues) {
    // Rejection sampling to avoid modulo bias
    const uint32Max = 0xffffffff
    const limit = uint32Max - (uint32Max % maxExclusive)
    const buf = new Uint32Array(1)
    while (true) {
      c.getRandomValues(buf)
      const x = buf[0]!
      if (x < limit) return x % maxExclusive
    }
  }
  return Math.floor(Math.random() * maxExclusive)
}

export function shuffled<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  // Fisher–Yates
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

