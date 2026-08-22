/**
 * A handful of demo-only pages (mockClients.ts data, never shown for a real
 * client — see CapabilityPlaceholder fallback in each of them) previously used
 * `Math.random()` to add cosmetic variance to sample CPU/memory/issue-count
 * numbers. Found during a fabrication sweep: `Math.random()` re-evaluates on
 * every server render, so the SAME demo record showed a DIFFERENT number on
 * every refresh — not a real-customer data-fabrication risk (these pages never
 * render for a real client), but a genuine internal-consistency defect for a
 * demo that's supposed to be illustrative, stable sample data.
 *
 * Deterministic replacement: seeded by stable inputs (e.g. a client/app ID),
 * so the same demo record always renders the same "varied-looking" number.
 */
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return h;
}

/** Deterministic pseudo-random float in [0, 1), seeded by `seed`. */
export function seededUnit(seed: string): number {
  const h = hashSeed(seed);
  // Fold the 32-bit hash into [0, 1) without ever going negative.
  return (h >>> 0) / 4294967296;
}

/** Deterministic signed variance in [-amplitude/2, amplitude/2), seeded by `seed`. */
export function seededVariance(seed: string, amplitude: number): number {
  return (seededUnit(seed) - 0.5) * amplitude;
}
