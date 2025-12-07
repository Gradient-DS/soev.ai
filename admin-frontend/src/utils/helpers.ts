/**
 * Formats a numeric value with thousands separators for readability
 */
export function formatNumber(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) {
    return String(value);
  }
  return num.toLocaleString('en-US');
}
