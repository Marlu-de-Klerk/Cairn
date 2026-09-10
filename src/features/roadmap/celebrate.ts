/**
 * Whether the one-time completion celebration (spec §6.3) should animate.
 * Checked live (not cached at module load) since a user can change their OS
 * setting without reloading the tab in some browsers, and this is cheap to
 * call right before the celebration fires.
 */
export function celebrationEnabled(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
