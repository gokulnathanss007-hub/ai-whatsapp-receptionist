import type { CollectedSlots } from "@/lib/types";

/**
 * Merges this turn's captured slots into the conversation's running state.
 * Only defined values overwrite — an unset field this turn must never erase
 * a value captured on an earlier turn.
 */
export function mergeCollectedSlots(
  existing: Record<string, unknown>,
  incoming: CollectedSlots,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}
