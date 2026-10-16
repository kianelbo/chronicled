// ───────── Formatting ─────────
const fDateTime = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const fTime = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const fDayLong = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fCross = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const fmtDateTime = (ms: number) => fDateTime.format(ms);
export const fmtDate = (ms: number) => fDate.format(ms);
export const fmtTime = (ms: number) => fTime.format(ms);
export const fmtDayLong = (ms: number) => fDayLong.format(ms);
export const fmtCrosshair = (ms: number) => fCross.format(ms);

export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return "under a minute";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

export const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** "YYYY-MM-DDTHH:mm" in local time, the format <input type="datetime-local"> wants. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (s: string) => new Date(s).getTime();

export const DAY = 86_400_000;

// ───────── Axis ticks ─────────
type Unit = "minute" | "hour" | "day" | "week" | "month" | "year";
interface Step {
  unit: Unit;
  n: number;
}
const UNIT_MS: Record<Unit, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: DAY,
  week: 7 * DAY,
  month: 30.44 * DAY,
  year: 365.25 * DAY,
};
const STEPS: Step[] = [
  { unit: "minute", n: 1 }, { unit: "minute", n: 5 }, { unit: "minute", n: 15 }, { unit: "minute", n: 30 },
  { unit: "hour", n: 1 }, { unit: "hour", n: 3 }, { unit: "hour", n: 6 }, { unit: "hour", n: 12 },
  { unit: "day", n: 1 }, { unit: "week", n: 1 },
  { unit: "month", n: 1 }, { unit: "month", n: 3 }, { unit: "month", n: 6 },
  { unit: "year", n: 1 }, { unit: "year", n: 2 }, { unit: "year", n: 5 }, { unit: "year", n: 10 },
];

function floorTo(ms: number, s: Step): Date {
  const d = new Date(ms);
  switch (s.unit) {
    case "minute":
      d.setSeconds(0, 0);
      d.setMinutes(Math.floor(d.getMinutes() / s.n) * s.n);
      break;
    case "hour":
      d.setMinutes(0, 0, 0);
      d.setHours(Math.floor(d.getHours() / s.n) * s.n);
      break;
    case "day":
      d.setHours(0, 0, 0, 0);
      break;
    case "week":
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
      break;
    case "month":
      d.setHours(0, 0, 0, 0);
      d.setDate(1);
      d.setMonth(Math.floor(d.getMonth() / s.n) * s.n);
      break;
    case "year":
      d.setHours(0, 0, 0, 0);
      d.setMonth(0, 1);
      d.setFullYear(Math.floor(d.getFullYear() / s.n) * s.n);
      break;
  }
  return d;
}
function advance(d: Date, s: Step): Date {
  const x = new Date(d);
  switch (s.unit) {
    case "minute": x.setMinutes(x.getMinutes() + s.n); break;
    case "hour": x.setHours(x.getHours() + s.n); break;
    case "day": x.setDate(x.getDate() + s.n); break;
    case "week": x.setDate(x.getDate() + 7 * s.n); break;
    case "month": x.setMonth(x.getMonth() + s.n); break;
    case "year": x.setFullYear(x.getFullYear() + s.n); break;
  }
  return x;
}

const fHM = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const fDayTick = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });
const fWeekTick = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const fMonthTick = new Intl.DateTimeFormat(undefined, { month: "short" });
const fMonthYear = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const fDayBand = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });
const fDayBandShort = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

function tickLabel(ms: number, s: Step): string {
  switch (s.unit) {
    case "minute":
    case "hour": return fHM.format(ms);
    case "day": return fDayTick.format(ms);
    case "week": return fWeekTick.format(ms);
    case "month": return s.n >= 3 ? `${fMonthTick.format(ms)} ${new Date(ms).getFullYear()}` : fMonthTick.format(ms);
    case "year": return String(new Date(ms).getFullYear());
  }
}

export interface Tick { t: number; label: string }
export interface Band { start: number; end: number; label: string; short: string }
export interface Ticks { ticks: Tick[]; bands: Band[]; weekends: [number, number][] }

/** Round ticks for the visible window; `k` is pixels per millisecond. */
export function makeTicks(start: number, end: number, k: number, minPx = 76): Ticks {
  const step = STEPS.find((s) => UNIT_MS[s.unit] * s.n * k >= minPx) ?? STEPS[STEPS.length - 1];

  const ticks: Tick[] = [];
  let d = floorTo(start, step);
  for (let guard = 0; d.getTime() <= end && guard < 400; guard++) {
    const t = d.getTime();
    if (t >= start - UNIT_MS[step.unit] * step.n) ticks.push({ t, label: tickLabel(t, step) });
    d = advance(d, step);
  }

  // Context bands one level above the tick unit.
  const bands: Band[] = [];
  const bandStep: Step | null =
    step.unit === "minute" || step.unit === "hour" ? { unit: "day", n: 1 }
    : step.unit === "day" || step.unit === "week" ? { unit: "month", n: 1 }
    : step.unit === "month" ? { unit: "year", n: 1 }
    : null;
  if (bandStep) {
    let b = floorTo(start, bandStep);
    for (let guard = 0; b.getTime() < end && guard < 400; guard++) {
      const next = advance(b, bandStep);
      const t = b.getTime();
      const label =
        bandStep.unit === "day" ? fDayBand.format(t)
        : bandStep.unit === "month" ? fMonthYear.format(t)
        : String(b.getFullYear());
      const short = bandStep.unit === "day" ? fDayBandShort.format(t) : bandStep.unit === "month" ? fMonthYear.format(t) : label;
      bands.push({ start: t, end: next.getTime(), label, short });
      b = next;
    }
  }

  const weekends: [number, number][] = [];
  if (DAY * k >= 9 && step.unit !== "month" && step.unit !== "year") {
    let day = floorTo(start, { unit: "day", n: 1 });
    for (let guard = 0; day.getTime() < end && guard < 400; guard++) {
      const dow = day.getDay();
      if (dow === 6 || dow === 0) {
        const next = advance(day, { unit: "day", n: 1 });
        weekends.push([day.getTime(), next.getTime()]);
      }
      day = advance(day, { unit: "day", n: 1 });
    }
  }
  return { ticks, bands, weekends };
}
