export const PASS_CATALOG = Object.freeze({
  "GENERAL PASS": { rarity: "COMMON", zone: "G" },
  "DAY PASS": { rarity: "COMMON", zone: "D" },
  "EARLY ACCESS": { rarity: "UNCOMMON", zone: "E" },
  "EXPLORER PASS": { rarity: "UNCOMMON", zone: "X" },
  "CREATOR PASS": { rarity: "RARE", zone: "C" },
  "WORKSHOP PASS": { rarity: "RARE", zone: "W" },
  "PARTNER PASS": { rarity: "EPIC", zone: "P" },
  "BACKSTAGE PASS": { rarity: "EPIC", zone: "B" },
  "FOUNDER PASS": { rarity: "LEGENDARY", zone: "F" },
  "SECRET ACCESS": { rarity: "LEGENDARY", zone: "S" },
  "ZERO PASS": { rarity: "MYTHIC", zone: "Z" },
  "BLACK SIGNAL": { rarity: "MYTHIC", zone: "Q" }
});

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function sanitizeCode(value, max = 12) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, max);
}

export function normalizeAccessCode(value) {
  return sanitizeCode(value, 40);
}

export function randomToken(length = 10) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = "";
  for (const byte of bytes) result += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return result;
}

export function randomHex(bytes = 16) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function makeDrawCode(eventCode, sessionCode) {
  const tail = randomToken(10);
  return `${sanitizeCode(eventCode)}-${sanitizeCode(sessionCode, 10)}-${tail.slice(0, 5)}-${tail.slice(5)}`;
}

export function compactDate(date) {
  const [year = "", month = "", day = ""] = String(date ?? "").split("-");
  return `${year.slice(-2)}${month}${day}`;
}

export function makeSerial(eventCode, date, sessionCode, number) {
  return `${sanitizeCode(eventCode)}-${compactDate(date)}-${sanitizeCode(sessionCode, 10)}-${String(number).padStart(4, "0")}`;
}

export function passMeta(passType) {
  const normalized = String(passType ?? "GENERAL PASS").trim().toUpperCase();
  const match = PASS_CATALOG[normalized] ?? PASS_CATALOG["GENERAL PASS"];
  return { passType: normalized in PASS_CATALOG ? normalized : "GENERAL PASS", ...match };
}

export function makeZone(passType, number) {
  return `${passMeta(passType).zone}-${String(number).padStart(2, "0")}`;
}

export function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ""));
}

export function clampInteger(value, min, max, fallback = min) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
