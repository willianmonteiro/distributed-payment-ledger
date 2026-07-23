export function formatCents(cents: number | null): string {
  if (cents === null) return '…';
  return `$${(cents / 100).toFixed(2)}`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
