export function parseTimeStringToSeconds(timeString: string): number {
  // Dukungan format lama ("", null, dll)
  if (!timeString || typeof timeString !== "string") return NaN;

  const str = timeString.trim().toLowerCase();

  // 1) Jika hanya angka -> detik langsung
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }

  // 2) Format dengan tanda titik dua (hh:mm:ss atau mm:ss)
  if (/^\d+:\d{1,2}(?::\d{1,2})?$/.test(str)) {
    const parts = str.split(":").map((p) => parseInt(p, 10));
    if (parts.length === 2) {
      const [m, s] = parts;
      return m * 60 + s;
    }
    if (parts.length === 3) {
      const [h, m, s] = parts;
      return h * 3600 + m * 60 + s;
    }
  }

  // 3) Format dengan huruf (1m20s, 1m 20s, 90s, 2m, dll)
  let totalSeconds = 0;
  const minutesMatch = str.match(/(\d+)\s*m/) || str.match(/(\d+)m/);
  const secondsMatch = str.match(/(\d+)\s*s/) || str.match(/(\d+)s/);
  if (minutesMatch) {
    totalSeconds += parseInt(minutesMatch[1], 10) * 60;
  }
  if (secondsMatch) {
    totalSeconds += parseInt(secondsMatch[1], 10);
  }
  if (totalSeconds > 0) return totalSeconds;

  // 4) Gagal parse
  return NaN;
}

export function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  } else {
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }
}
