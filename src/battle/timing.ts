/**
 * Shot timing (DESIGN.md, "Shot timing"). Pure: no DOM, canvas or World.
 *
 * Within one cast a shot never overtakes the one fired before it: each shot's effective speed is
 * min(its own speed, the previous shot's effective speed), in firing order. Echo volleys are a
 * separate cast (the list restarts), and Hydra shards are exempt (they use their own speed).
 */
export function capSpeeds(speeds: readonly number[]): number[] {
  const out: number[] = [];
  let prev = Infinity;
  for (const s of speeds) {
    prev = Math.min(s, prev);
    out.push(prev);
  }
  return out;
}
