/** Serializable random stream. Only committed engine actions advance its cursor. */
export interface GameRandomState {
  seed: number;
  cursor: number;
}

let activeStream: GameRandomState | null = null;

export function createGameRandomState(): GameRandomState {
  const bytes = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else bytes[0] = Math.floor(Math.random() * 0x100000000);
  return { seed: bytes[0]!, cursor: 0 };
}

export function getActiveGameRandomState(): GameRandomState | undefined {
  return activeStream ? { ...activeStream } : undefined;
}

/** Counter-based Mulberry32: seed + cursor fully determines the next roll. */
export function gameRandom(): number {
  if (!activeStream) return Math.random();
  let value = (activeStream.seed + Math.imul(++activeStream.cursor, 0x6d2b79f5)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
}

/** Nested actions share a stream; exceptions cannot leak it into another run. */
export function withGameRandom<T extends { randomState?: GameRandomState }>(state: T, action: () => T): T {
  const previous = activeStream;
  const stream = previous && (!state.randomState || previous.seed === state.randomState.seed)
    ? previous : { ...(state.randomState ?? createGameRandomState()) };
  activeStream = stream;
  try {
    const next = action();
    if (next === state) return next;
    // A nested fresh run is responsible for its own stream.
    if (next.randomState && next.randomState.seed !== stream.seed) return next;
    return { ...next, randomState: { ...stream } };
  } finally {
    activeStream = previous;
  }
}

/** Read-only previews can use a fork without consuming gameplay randomness. */
export function withGameRandomPreview<T>(state: { randomState?: GameRandomState }, preview: () => T): T {
  const previous = activeStream;
  activeStream = { ...(state.randomState ?? { seed: 0, cursor: 0 }) };
  try { return preview(); } finally { activeStream = previous; }
}
