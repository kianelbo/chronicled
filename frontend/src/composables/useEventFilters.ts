import { computed, ref } from "vue";
import type { LocationQuery } from "vue-router";
import { useEventsStore } from "@/stores/events";
import { useGroupsStore } from "@/stores/groups";
import { DAY, toLocalInput } from "@/lib/time";
import type { EventType, TimedEvent } from "@/types";

export type Preset = "any" | "24h" | "7d" | "30d" | "90d" | "custom";
export const PRESETS: { value: Preset; label: string; ms: number }[] = [
  { value: "any", label: "Any time", ms: 0 },
  { value: "24h", label: "Last 24 hours", ms: DAY },
  { value: "7d", label: "Last 7 days", ms: 7 * DAY },
  { value: "30d", label: "Last 30 days", ms: 30 * DAY },
  { value: "90d", label: "Last 90 days", ms: 90 * DAY },
];

// Module-level state: the timeline and the log share one set of filters.
const type = ref<EventType | null>(null);
const groupIds = ref<number[]>([]); // empty = every group
const tags = ref<string[]>([]);
const author = ref<number | null>(null);
const q = ref("");
const preset = ref<Preset>("any");
const from = ref<number | null>(null);
const to = ref<number | null>(null);

function setPreset(p: Preset) {
  preset.value = p;
  const def = PRESETS.find((x) => x.value === p);
  if (p === "any") from.value = to.value = null;
  else if (def && p !== "custom") {
    from.value = Date.now() - def.ms;
    to.value = null;
  }
}

function setCustom(f: number | null, t: number | null) {
  preset.value = f || t ? "custom" : "any";
  from.value = f;
  to.value = t;
}

function clear() {
  type.value = null;
  groupIds.value = [];
  tags.value = [];
  author.value = null;
  q.value = "";
  setPreset("any");
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

// ───────── URL <-> state ─────────
function toQuery(): Record<string, string> {
  const o: Record<string, string> = {};
  if (type.value) o.type = type.value;
  if (groupIds.value.length) o.groups = groupIds.value.join(",");
  if (tags.value.length) o.tags = tags.value.join(",");
  if (author.value) o.author = String(author.value);
  if (q.value.trim()) o.q = q.value.trim();
  if (preset.value === "custom") {
    if (from.value) o.from = toLocalInput(from.value).slice(0, 10);
    if (to.value) o.to = toLocalInput(to.value).slice(0, 10);
  } else if (preset.value !== "any") o.period = preset.value;
  return o;
}

function fromQuery(query: LocationQuery) {
  const s = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : "");
  type.value = s("type") === "incident" || s("type") === "release" ? (s("type") as EventType) : null;
  groupIds.value = s("groups").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  tags.value = s("tags").split(",").filter(Boolean);
  author.value = Number(s("author")) || null;
  q.value = s("q");
  const period = s("period") as Preset;
  if (PRESETS.some((p) => p.value === period && p.value !== "any")) setPreset(period);
  else if (s("from") || s("to")) {
    const f = s("from") ? new Date(s("from") + "T00:00").getTime() : null;
    const t = s("to") ? new Date(s("to") + "T23:59:59").getTime() : null;
    setCustom(Number.isNaN(f) ? null : f, Number.isNaN(t) ? null : t);
  } else setPreset("any");
}

export function useEventFilters() {
  const events = useEventsStore();
  const groups = useGroupsStore();

  const groupSet = computed(() => new Set(groupIds.value));
  /** Events in the selected groups, before any other filter. Feeds the tag/author pickers. */
  const scoped = computed(() =>
    groupIds.value.length ? events.all.filter((e) => groupSet.value.has(e.groupId)) : events.all,
  );

  const tagCounts = computed(() => {
    const m = new Map<string, number>();
    for (const e of scoped.value) for (const t of e.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  });

  const authors = computed(() => {
    const m = new Map<number, string>();
    for (const e of scoped.value) m.set(e.postedBy, e.postedByName ?? `User ${e.postedBy}`);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });

  const filtered = computed<TimedEvent[]>(() => {
    const needle = q.value.trim().toLowerCase();
    const f = from.value;
    const t = to.value;
    return events.all.filter((e) => {
      if (type.value && e.type !== type.value) return false;
      if (groupIds.value.length && !groupSet.value.has(e.groupId)) return false;
      if (author.value && e.postedBy !== author.value) return false;
      if (tags.value.length && !tags.value.some((x) => e.tags.includes(x))) return false;
      // Same overlap rule the backend uses for ?from / ?to.
      if (f !== null && (e.end ?? e.start) < f) return false;
      if (t !== null && e.start > t) return false;
      if (needle) {
        const hay = `${e.title} ${e.description ?? ""} ${e.tags.join(" ")} ${e.postedByName ?? ""} ${groups.nameOf(e.groupId)}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  });

  const counts = computed(() => {
    let incidents = 0;
    for (const e of filtered.value) if (e.type === "incident") incidents++;
    return { total: filtered.value.length, incidents, releases: filtered.value.length - incidents };
  });

  const activeCount = computed(
    () =>
      (type.value ? 1 : 0) +
      (groupIds.value.length ? 1 : 0) +
      (tags.value.length ? 1 : 0) +
      (author.value ? 1 : 0) +
      (q.value.trim() ? 1 : 0) +
      (preset.value !== "any" ? 1 : 0),
  );

  return {
    type, groupIds, tags, author, q, preset, from, to,
    filtered, counts, tagCounts, authors, activeCount,
    setPreset, setCustom, clear, toggle, toQuery, fromQuery,
  };
}
