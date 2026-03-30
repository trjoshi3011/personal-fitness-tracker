export function kgToLb(kg: number) {
  return kg * 2.2046226218;
}

export function metersToMiles(meters: number) {
  return meters / 1609.344;
}

export function metersToFeet(meters: number) {
  return meters * 3.280839895;
}

export function minutesToHhMm(totalMinutes: number | null | undefined) {
  if (
    totalMinutes == null ||
    !Number.isFinite(totalMinutes) ||
    totalMinutes <= 0
  ) {
    return "—";
  }
  const m = Math.round(totalMinutes);
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h <= 0) return `${min}m`;
  return `${h}h ${min}m`;
}

export function secondsToHhMm(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function secondsToHhMmSs(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function paceSecondsPerMile({
  seconds,
  meters,
}: {
  seconds: number;
  meters: number;
}) {
  if (meters <= 0) return null;
  const miles = metersToMiles(meters);
  if (miles <= 0) return null;
  return seconds / miles;
}

export function formatPaceMinPerMile(paceSeconds: number | null) {
  if (!paceSeconds || !Number.isFinite(paceSeconds) || paceSeconds <= 0) {
    return "—";
  }
  const total = Math.round(paceSeconds);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, "0")} /mi`;
}

