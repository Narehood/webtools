export const commonZones = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const offsetPattern = /^(?:utc|gmt)?([+-])(\d{1,2})(?::?(\d{2}))?$/i;

export function formatZoneTime(date: Date, zone: string) {
  const trimmed = zone.trim();
  if (!trimmed) throw new Error("Enter a time zone");
  const compact = trimmed.replace(/\s/g, "");
  const offset = offsetPattern.exec(compact);
  if (offset && !trimmed.includes("/")) {
    const sign = offset[1] === "-" ? -1 : 1;
    const hours = Number(offset[2]);
    const minutes = Number(offset[3] ?? "0");
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes > 0)) throw new Error("Offset must be within ±14 hours");
    const total = sign * (hours * 60 + minutes);
    const shifted = new Date(date.getTime() + total * 60_000);
    const time = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(shifted).replace(/\u202f/g, " ");
    const label = `UTC${offset[1]}${String(hours).padStart(2, "0")}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
    return { label, time };
  }
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: trimmed,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date).replace(/\u202f/g, " ");
  return { label: trimmed, time };
}

export function localZoneName() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
  } catch {
    return "Local";
  }
}
