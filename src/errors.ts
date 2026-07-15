export type DegradedReason =
  'missing' | 'busy' | 'unsupported-schema' | 'unreadable';

export function classifyDatabaseError(error: unknown): DegradedReason {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code: unknown }).code);

    if (code.includes('BUSY') || code.includes('LOCKED')) {
      return 'busy';
    }
  }
  return 'unreadable';
}
