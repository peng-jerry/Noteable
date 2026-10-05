const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "just now", "5 minutes ago", "yesterday", or a date for older times. */
export function relativeTime(iso, now = Date.now()) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((then - now) / 1000);
  const abs = Math.abs(seconds);

  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(seconds / 86400), "day");
  return fullDate(iso, { includeYear: new Date(iso).getFullYear() !== new Date(now).getFullYear() });
}

export function fullDate(iso, { includeYear = true, time = false } = {}) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: includeYear ? "numeric" : undefined,
    hour: time ? "numeric" : undefined,
    minute: time ? "2-digit" : undefined,
  });
}
