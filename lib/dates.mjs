export function normalizeDate(value) {
  if (!value) {
    return null;
  }
  const compact = value.replaceAll("-", "");
  if (!/^\d{8}$/.test(compact)) {
    throw new Error(`Invalid date: ${value}. Expected YYYY-MM-DD or YYYYMMDD.`);
  }
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

export function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: localTimeZone(),
  }).format(new Date());
}

export function localTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function dateKey(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: localTimeZone(),
  }).format(date);
}

export function inRange(key, since, until) {
  if (!key) {
    return false;
  }
  if (since && key < since) {
    return false;
  }
  if (until && key > until) {
    return false;
  }
  return true;
}

export function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return dateKey(date.toISOString());
}

export function shiftDateKey(value, days) {
  const [year, month, day] = String(value || todayKey()).split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return dateKey(date.toISOString());
}
