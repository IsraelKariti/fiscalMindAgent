export function hoursToMs(hours: number): number {
  return hours * 60 * 60 * 1000;
}

export function humanizeDuration(ms: number): string {
  if (ms < 0) return '0 minutes';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}
