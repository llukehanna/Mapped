/**
 * Pick games (Flags · Identify, Capitals · Identify): the choices that `n` hint rungs take away. Each rung removes one more wrong
 * choice, in the order they're shown, skipping the target and the ones already picked wrongly (those are disabled anyway).
 */
export function removedChoices(choices: readonly string[], goal: string, wrongPicked: readonly string[], n: number): string[] {
  return choices.filter((id) => id !== goal && !wrongPicked.includes(id)).slice(0, Math.max(0, n));
}
