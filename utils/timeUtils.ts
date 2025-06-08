
export function parseTimeStringToSeconds(timeString: string): number {
  if (!timeString || typeof timeString !== 'string') return 0;
  
  let totalSeconds = 0;
  const timeStringLower = timeString.toLowerCase();

  const minutesMatch = timeStringLower.match(/(\d+)m/);
  const secondsMatch = timeStringLower.match(/(\d+)s/);
  
  if (minutesMatch) {
    totalSeconds += parseInt(minutesMatch[1], 10) * 60;
  }
  if (secondsMatch) {
    totalSeconds += parseInt(secondsMatch[1], 10);
  }
  
  // If no 'm' or 's' specifiers, and it's just a number, assume it's seconds.
  if (!minutesMatch && !secondsMatch && /^\d+$/.test(timeStringLower)) {
    totalSeconds = parseInt(timeStringLower, 10);
  }
  
  return totalSeconds;
}

export function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}
