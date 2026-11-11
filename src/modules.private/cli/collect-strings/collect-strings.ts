/**
 * The commander option's collector: one more string on the repeated
 * flag's list — the CLI's spelling of the wire's repeated query param
 * (the IN filter). Pure: a fresh array every time, the previous list
 * untouched.
 */
export function collectStrings(value: string, previous: readonly string[] = []): readonly string[] {
  return [...previous, value];
}
