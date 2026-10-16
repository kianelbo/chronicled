<script lang="ts">
// Survives leaving and re-entering the page so the viewport isn't reset.
let savedView: { start: number; end: number } | null = null;
let uid = 0;
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { DAY, fmtCrosshair, fmtDateTime, fmtDuration, makeTicks } from "@/lib/time";
import { useGroupsStore } from "@/stores/groups";
import type { EventType, TimedEvent } from "@/types";
import Icon from "@/components/ui/Icon.vue";
import Segmented from "@/components/ui/Segmented.vue";
import TimelineOverview from "./TimelineOverview.vue";

type LaneBy = "group" | "type" | "all";

const props = defineProps<{
  events: TimedEvent[];
  selectedId: string | null;
  range: { from: number | null; to: number | null };
  canCreate: boolean;
}>();
const emit = defineEmits<{
  select: [id: string | null];
  create: [draft: { start: number; groupId?: number; type?: EventType }];
}>();

const groups = useGroupsStore();
const clipId = `tl-clip-${++uid}`;

// ───────── constants ─────────
const BAND_H = 24;
const TICK_H = 30;
const AXIS_H = BAND_H + TICK_H;
const ROW_H = 30;
const ITEM_H = 22;
const LANE_PAD = 12;
const MIN_LANE_H = 64;
const MIN_BODY_H = 300;
const HALF = 7; // half-width of a point marker
const MIN_BAR = 12;
const GAP = 4;
const MIN_SPAN = 10 * 60_000;

// ───────── view state ─────────
const laneBy = ref<LaneBy>("group");
const showLinks = ref(true);
const wrap = ref<HTMLElement | null>(null);
const body = ref<HTMLElement | null>(null);
const width = ref(900);
const viewStart = ref(0);
const viewEnd = ref(1);
const now = ref(Date.now());
const hoverId = ref<string | null>(null);
const cursor = ref<{ x: number; y: number } | null>(null); // relative to wrap
const dragging = ref(false);
const fontTick = ref(0);

const laneOptions: { value: LaneBy; label: string }[] = [
  { value: "group", label: "Group" },
  { value: "type", label: "Type" },
  { value: "all", label: "One lane" },
];

// ───────── extent of the data ─────────
const dataRange = computed(() => {
  let min = Infinity;
  let max = -Infinity;
  for (const e of props.events) {
    if (e.start < min) min = e.start;
    const t = e.end ?? e.start;
    if (t > max) max = t;
  }
  if (!Number.isFinite(min)) return { min: now.value - 3 * DAY, max: now.value + DAY };
  return { min, max };
});
const extent = computed(() => {
  const { min, max } = dataRange.value;
  const lo = Math.min(min, now.value);
  const hi = Math.max(max, now.value);
  const pad = Math.max((hi - lo) * 0.05, DAY);
  return { start: lo - pad, end: hi + pad };
});
// Generous even for sparse data, so the 1w / 1m / 3m jumps always work.
const maxSpan = computed(() => Math.max((extent.value.end - extent.value.start) * 2, 400 * DAY));

// ───────── lanes ─────────
interface Lane {
  key: string;
  label: string;
  groupId?: number;
  type?: EventType;
  events: TimedEvent[];
}
const laneDefs = computed<Lane[]>(() => {
  const evs = props.events;
  if (laneBy.value === "all") return [{ key: "all", label: "All events", events: evs }];
  if (laneBy.value === "type") {
    return (["incident", "release"] as const)
      .map((t) => ({ key: t, type: t, label: t === "incident" ? "Incidents" : "Releases", events: evs.filter((e) => e.type === t) }))
      .filter((l) => l.events.length);
  }
  const m = new Map<number, TimedEvent[]>();
  for (const e of evs) (m.get(e.groupId) ?? m.set(e.groupId, []).get(e.groupId)!).push(e);
  return [...m.entries()]
    .map(([id, list]) => ({ key: `g${id}`, groupId: id, label: groups.nameOf(id), events: list }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

const gutter = computed(() => (laneDefs.value.length <= 1 ? 0 : width.value < 640 ? 84 : 156));
const plotW = computed(() => Math.max(50, width.value - gutter.value));
const span = computed(() => viewEnd.value - viewStart.value);
const k = computed(() => plotW.value / span.value); // px per ms
const x = (t: number) => gutter.value + (t - viewStart.value) * k.value;
const timeAt = (px: number) => viewStart.value + (px - gutter.value) / k.value;

// ───────── text measuring ─────────
let ctx: CanvasRenderingContext2D | null = null;
const measured = new Map<string, number>();
function tw(s: string): number {
  const hit = measured.get(s);
  if (hit !== undefined) return hit;
  ctx ??= document.createElement("canvas").getContext("2d");
  let w = s.length * 6.6;
  if (ctx) {
    ctx.font = '600 12px "Chivo Variable", ui-sans-serif, system-ui, sans-serif';
    w = ctx.measureText(s).width;
  }
  measured.set(s, w);
  return w;
}
function fit(s: string, max: number): string {
  if (max <= 0) return "";
  const full = tw(s);
  if (full <= max) return s;
  let n = Math.max(1, Math.floor((s.length * max) / full));
  while (n > 1 && tw(s.slice(0, n).trimEnd() + "…") > max) n--;
  return n <= 1 && tw("…") > max ? "" : s.slice(0, n).trimEnd() + "…";
}

// ───────── packing ─────────
// Rows depend only on zoom level (px per ms) — panning never reshuffles them.
interface Packed {
  ev: TimedEvent;
  r0: number;
  r1: number;
  row: number;
  room: number;
  isSpan: boolean;
}
interface LaneLayout extends Lane {
  items: Packed[];
  top: number;
  height: number;
}
const origin = computed(() => extent.value.start);

const layout = computed(() => {
  const kk = k.value;
  const o = origin.value;
  let top = 0;
  const out: LaneLayout[] = [];
  for (const lane of laneDefs.value) {
    const items: Packed[] = lane.events
      .map((ev) => {
        const isSpan = ev.end !== null;
        const w = isSpan ? Math.max((ev.end! - ev.start) * kk, MIN_BAR) : HALF * 2;
        const r0 = (ev.start - o) * kk - (isSpan ? 0 : HALF);
        return { ev, r0, r1: r0 + w, row: 0, room: Infinity, isSpan };
      })
      .sort((a, b) => a.r0 - b.r0);

    const rowEnd: number[] = [];
    const rows: Packed[][] = [];
    for (const it of items) {
      let row = rowEnd.findIndex((end) => end <= it.r0);
      if (row < 0) {
        row = rowEnd.length;
        rowEnd.push(0);
        rows.push([]);
      }
      rowEnd[row] = it.r1 + GAP;
      it.row = row;
      rows[row].push(it);
    }
    for (const r of rows) for (let i = 0; i < r.length; i++) r[i].room = i + 1 < r.length ? r[i + 1].r0 - r[i].r1 - 6 : Infinity;

    const height = Math.max(MIN_LANE_H, LANE_PAD * 2 + Math.max(1, rows.length) * ROW_H - (ROW_H - ITEM_H));
    out.push({ ...lane, items, top, height });
    top += height;
  }
  return { lanes: out, total: top };
});
const bodyH = computed(() => Math.max(MIN_BODY_H, layout.value.total));

// ───────── visible items ─────────
interface Vis {
  id: string;
  ev: TimedEvent;
  x0: number;
  w: number;
  cx: number;
  cy: number;
  y: number;
  isSpan: boolean;
  label: string;
  labelX: number;
  inside: boolean;
}
const visible = computed<Vis[]>(() => {
  void fontTick.value;
  const off = gutter.value + (origin.value - viewStart.value) * k.value;
  const out: Vis[] = [];
  for (const lane of layout.value.lanes) {
    for (const p of lane.items) {
      const x0 = p.r0 + off;
      const x1 = p.r1 + off;
      if (x0 > width.value + 4) continue;
      if (x1 + Math.min(p.room, 280) < gutter.value) continue;
      const y = lane.top + LANE_PAD + p.row * ROW_H;
      const w = x1 - x0;
      let label = "";
      let labelX = 0;
      let inside = false;
      const title = p.ev.title;
      if (p.isSpan) {
        const inner = w - 14;
        if (inner >= 28 && tw(title) <= inner) {
          label = title;
          inside = true;
          labelX = x0 + 8;
        } else if (p.room >= 60) {
          label = fit(title, p.room - 2);
          labelX = x1 + 6;
        } else if (inner >= 40) {
          label = fit(title, inner);
          inside = true;
          labelX = x0 + 8;
        }
      } else if (p.room >= 48) {
        label = fit(title, p.room - 2);
        labelX = x1 + 6;
      }
      out.push({ id: p.ev.id, ev: p.ev, x0, w, cx: x0 + w / 2, cy: y + ITEM_H / 2, y, isSpan: p.isSpan, label, labelX, inside });
    }
  }
  return out;
});

const releaseLines = computed(() => {
  if (!showLinks.value) return [];
  const r = visible.value.filter((v) => v.ev.type === "release" && v.cx >= gutter.value && v.cx <= width.value);
  return r.length <= 80 ? r : [];
});

const axis = computed(() => makeTicks(viewStart.value, viewEnd.value, k.value));
// Context labels (day / month / year) stick to the left edge, and are dropped when there's no room for them.
const bandLabels = computed(() =>
  axis.value.bands.map((b) => {
    const left = Math.max(x(b.start), gutter.value);
    const visible = Math.min(x(b.end), width.value) - left;
    const text = [visible > 190 ? b.label : b.short, b.short].find((t) => tw(t) * 1.1 + 18 <= visible) ?? "";
    return { key: b.start, x: x(b.start), textX: left + 8, text };
  }),
);
const inViewCount = computed(() => props.events.filter((e) => (e.end ?? e.start) >= viewStart.value && e.start <= viewEnd.value).length);
const nowX = computed(() => x(now.value));
const hovered = computed(() => (hoverId.value ? (props.events.find((e) => e.id === hoverId.value) ?? null) : null));

// ───────── view control ─────────
let anim = 0;
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function clampView(start: number, end: number): [number, number] {
  let s = end - start;
  s = Math.min(maxSpan.value, Math.max(MIN_SPAN, s));
  const c = (start + end) / 2;
  const lo = extent.value.start - s * 0.5;
  const hi = extent.value.end + s * 0.5;
  const center = Math.min(hi, Math.max(lo, c));
  return [center - s / 2, center + s / 2];
}
function setView(start: number, end: number) {
  const [s, e] = clampView(start, end);
  viewStart.value = s;
  viewEnd.value = e;
  savedView = { start: s, end: e };
}
function animateTo(start: number, end: number) {
  cancelAnimationFrame(anim);
  const [s1, e1] = clampView(start, end);
  if (reduceMotion()) return setView(s1, e1);
  const s0 = viewStart.value;
  const e0 = viewEnd.value;
  const t0 = performance.now();
  const D = 320;
  const step = (t: number) => {
    const p = Math.min(1, (t - t0) / D);
    const ease = 1 - Math.pow(1 - p, 3);
    // interpolate centre and log-span so zooming feels even
    const c = (s0 + e0) / 2 + ((s1 + e1) / 2 - (s0 + e0) / 2) * ease;
    const sp = Math.exp(Math.log(e0 - s0) + (Math.log(e1 - s1) - Math.log(e0 - s0)) * ease);
    setView(c - sp / 2, c + sp / 2);
    if (p < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

function fitAll(animate = true) {
  const { min, max } = dataRange.value;
  let hi = max;
  const dataSpan = Math.max(max - min, DAY);
  if (now.value >= max && now.value - max < dataSpan * 0.5) hi = now.value;
  const pad = Math.max((hi - min) * 0.05, 3 * 3_600_000);
  (animate ? animateTo : setView)(min - pad, hi + pad);
}
function lastDays(days: number) {
  const s = days * DAY;
  animateTo(now.value - s * 0.92, now.value + s * 0.08);
}
function goNow() {
  const s = span.value;
  animateTo(now.value - s / 2, now.value + s / 2);
}
function zoomAt(px: number, factor: number, animate = false) {
  const r = (px - gutter.value) / plotW.value;
  const t = viewStart.value + r * span.value;
  const ns = Math.min(maxSpan.value, Math.max(MIN_SPAN, span.value * factor));
  const s = t - r * ns;
  (animate ? animateTo : setView)(s, s + ns);
}
const zoomCentre = (factor: number) => zoomAt(gutter.value + plotW.value / 2, factor, true);

function initView() {
  if (props.range.from !== null || props.range.to !== null) return applyRange();
  const { min, max } = dataRange.value;
  if (max - min > 90 * DAY) {
    // Long history: open on the most recent 30 days of activity, the overview shows the rest.
    const end = Math.min(now.value, max) + 2 * DAY;
    return setView(end - 30 * DAY, end);
  }
  fitAll(false);
}
function applyRange() {
  const { from, to } = props.range;
  if (from === null && to === null) return fitAll();
  const end = to ?? now.value;
  const start = from ?? dataRange.value.min;
  const pad = Math.max((end - start) * 0.03, 3_600_000);
  animateTo(start - pad, end + (to === null ? Math.max((end - start) * 0.06, pad) : pad));
}

function onOverview(s: number, e: number) {
  cancelAnimationFrame(anim);
  setView(s, e);
}

// ───────── pointer handling ─────────
const pointers = new Map<number, { x: number; y: number }>();
let drag: { x0: number; start0: number; moved: boolean; itemId: string | null } | null = null;
let pinch: { dist: number; span: number; r: number; t: number } | null = null;

const localX = (clientX: number) => clientX - wrap.value!.getBoundingClientRect().left;

function onDown(e: PointerEvent) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  cancelAnimationFrame(anim);
  // A new primary pointer means any earlier gesture is over (guards against a lost pointerup).
  if (e.isPrimary) {
    pointers.clear();
    pinch = null;
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  if (pointers.size === 1) {
    const hit = (e.target as Element).closest("[data-id]");
    drag = { x0: e.clientX, start0: viewStart.value, moved: false, itemId: hit?.getAttribute("data-id") ?? null };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = localX((a.x + b.x) / 2);
    const r = (mid - gutter.value) / plotW.value;
    pinch = { dist, span: span.value, r, t: viewStart.value + r * span.value };
    drag = null;
  }
}
function onMove(e: PointerEvent) {
  const p = pointers.get(e.pointerId);
  if (p) {
    p.x = e.clientX;
    p.y = e.clientY;
  }
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const ns = Math.min(maxSpan.value, Math.max(MIN_SPAN, (pinch.span * pinch.dist) / Math.max(dist, 1)));
    const s = pinch.t - pinch.r * ns;
    setView(s, s + ns);
    return;
  }
  if (drag) {
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) > 4) {
      drag.moved = true;
      dragging.value = true;
      hoverId.value = null;
    }
    if (drag.moved) {
      const s = drag.start0 - dx / k.value;
      setView(s, s + span.value);
    }
    return;
  }
  // plain hover
  const lx = localX(e.clientX);
  const rect = wrap.value!.getBoundingClientRect();
  cursor.value = { x: lx, y: e.clientY - rect.top };
  hoverId.value = (e.target as Element).closest("[data-id]")?.getAttribute("data-id") ?? null;
}
function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (drag && pointers.size === 0) {
    if (!drag.moved) {
      emit("select", drag.itemId);
    }
    drag = null;
    dragging.value = false;
  }
}
function onLeave() {
  if (!drag) {
    hoverId.value = null;
    cursor.value = null;
  }
}
function onWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    cancelAnimationFrame(anim);
    zoomAt(localX(e.clientX), Math.exp(e.deltaY * 0.0022));
  } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    e.preventDefault();
    cancelAnimationFrame(anim);
    const d = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
    const s = viewStart.value + d / k.value;
    setView(s, s + span.value);
  }
}
function onKey(e: KeyboardEvent) {
  if ((e.target as Element).closest("[data-id]") && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    emit("select", (e.target as Element).closest("[data-id]")!.getAttribute("data-id"));
    return;
  }
  if (e.target !== wrap.value) return;
  const step = span.value * 0.2;
  if (e.key === "ArrowLeft") animateTo(viewStart.value - step, viewEnd.value - step);
  else if (e.key === "ArrowRight") animateTo(viewStart.value + step, viewEnd.value + step);
  else if (e.key === "+" || e.key === "=") zoomCentre(0.6);
  else if (e.key === "-") zoomCentre(1 / 0.6);
  else if (e.key === "0") fitAll();
  else return;
  e.preventDefault();
}
function onDblClick(e: MouseEvent) {
  if ((e.target as Element).closest("[data-id]") || !props.canCreate) return;
  const lx = localX(e.clientX);
  if (lx < gutter.value) return;
  const bodyRect = body.value!.getBoundingClientRect();
  const y = e.clientY - bodyRect.top + body.value!.scrollTop;
  if (e.clientY < bodyRect.top) return;
  const lane = layout.value.lanes.find((l) => y >= l.top && y < l.top + l.height);
  const start = Math.round(timeAt(lx) / 60_000) * 60_000;
  emit("create", { start, groupId: lane?.groupId, type: lane?.type });
}

// ───────── lifecycle ─────────
let ro: ResizeObserver | null = null;
let tick = 0;
onMounted(() => {
  ro = new ResizeObserver(([entry]) => (width.value = Math.max(320, Math.floor(entry.contentRect.width))));
  if (body.value) {
    ro.observe(body.value);
    width.value = Math.max(320, body.value.clientWidth);
  }
  if (savedView) setView(savedView.start, savedView.end);
  else initView();
  tick = window.setInterval(() => (now.value = Date.now()), 30_000);
  document.fonts?.ready.then(() => {
    measured.clear();
    fontTick.value++;
  });
});
onBeforeUnmount(() => {
  ro?.disconnect();
  clearInterval(tick);
  cancelAnimationFrame(anim);
});

watch(() => [props.range.from, props.range.to], applyRange);

// Bring a newly created/selected event into view if it's outside the window.
watch(
  () => props.selectedId,
  async (id) => {
    const ev = props.events.find((e) => e.id === id);
    if (!ev) return;
    await nextTick();
    const end = ev.end ?? ev.start;
    if (end < viewStart.value || ev.start > viewEnd.value) {
      const c = (ev.start + end) / 2;
      animateTo(c - span.value / 2, c + span.value / 2);
    }
  },
);

// ───────── tooltip ─────────
const tip = computed(() => {
  if (!hovered.value || !cursor.value || dragging.value) return null;
  const w = 288;
  const left = cursor.value.x + 16 + w > width.value ? cursor.value.x - w - 12 : cursor.value.x + 16;
  return { left: Math.max(4, left), top: cursor.value.y + 18, w };
});

const glyph = (cx: number, cy: number, t: EventType) =>
  t === "release"
    ? `M${cx} ${cy - HALF}L${cx + HALF} ${cy}L${cx} ${cy + HALF}L${cx - HALF} ${cy}Z`
    : `M${cx} ${cy - HALF}L${cx + HALF + 0.5} ${cy + HALF - 1}L${cx - HALF - 0.5} ${cy + HALF - 1}Z`;

const color = (t: EventType) => (t === "release" ? "var(--release)" : "var(--incident)");
const aria = (e: TimedEvent) =>
  `${e.type === "release" ? "Release" : "Incident"}: ${e.title}, ${fmtDateTime(e.start)}${e.end ? ` to ${fmtDateTime(e.end)}` : ""}`;
</script>

<template>
  <section class="panel overflow-hidden" aria-label="Timeline">
    <!-- controls -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3 py-2.5">
      <div class="flex items-center gap-2">
        <span class="text-[13px] font-semibold text-muted">Lanes</span>
        <Segmented v-model="laneBy" :options="laneOptions" label="Group lanes by" small />
      </div>
      <label class="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink-soft">
        <input v-model="showLinks" type="checkbox" class="size-4 accent-[var(--release)]" />
        Release lines
      </label>

      <div class="ml-auto flex flex-wrap items-center gap-1.5">
        <div class="flex items-center gap-0.5" role="group" aria-label="Jump to a period">
          <button class="btn-ghost btn-sm !px-2" @click="lastDays(1)">1d</button>
          <button class="btn-ghost btn-sm !px-2" @click="lastDays(7)">1w</button>
          <button class="btn-ghost btn-sm !px-2" @click="lastDays(30)">1m</button>
          <button class="btn-ghost btn-sm !px-2" @click="lastDays(90)">3m</button>
          <button class="btn-ghost btn-sm !px-2" @click="goNow">Now</button>
        </div>
        <span class="h-5 w-px bg-line-strong" />
        <button class="btn-icon !h-8 !w-8" aria-label="Zoom out" title="Zoom out (−)" @click="zoomCentre(1 / 0.6)"><Icon name="zoom-out" :size="17" /></button>
        <button class="btn-icon !h-8 !w-8" aria-label="Zoom in" title="Zoom in (+)" @click="zoomCentre(0.6)"><Icon name="zoom-in" :size="17" /></button>
        <button class="btn-secondary btn-sm" title="Fit all events (0)" @click="fitAll()"><Icon name="fit" :size="15" /> Fit all</button>
      </div>
    </div>

    <!-- plot -->
    <div
      ref="wrap"
      class="relative outline-offset-[-2px]"
      :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
      style="touch-action: pan-y"
      tabindex="0"
      role="application"
      aria-label="Timeline chart. Arrow keys pan, plus and minus zoom, 0 fits all events."
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @pointerleave="onLeave"
      @wheel="onWheel"
      @keydown="onKey"
      @dblclick="onDblClick"
    >
      <!-- axis (stays put while lanes scroll) -->
      <svg :width="width" :height="AXIS_H" class="block select-none border-b border-line bg-surface" aria-hidden="true">
        <defs>
          <clipPath :id="`${clipId}-axis`"><rect :x="gutter" y="0" :width="plotW" :height="AXIS_H" /></clipPath>
        </defs>
        <g :clip-path="`url(#${clipId}-axis)`">
          <g v-for="b in bandLabels" :key="b.key">
            <line :x1="b.x" :x2="b.x" y1="0" :y2="AXIS_H" style="stroke: var(--line-strong)" />
            <text v-if="b.text" :x="b.textX" y="16" font-size="12" font-weight="700" style="fill: var(--ink)">{{ b.text }}</text>
          </g>
          <line x1="0" :x2="width" :y1="BAND_H" :y2="BAND_H" style="stroke: var(--line)" />
          <g v-for="t in axis.ticks" :key="t.t">
            <line :x1="x(t.t)" :x2="x(t.t)" :y1="BAND_H" :y2="AXIS_H" style="stroke: var(--line-strong)" />
            <text :x="x(t.t) + 5" :y="BAND_H + 19" font-size="11.5" style="fill: var(--muted)">{{ t.label }}</text>
          </g>
          <!-- now -->
          <g v-if="nowX > gutter && nowX < width">
            <rect :x="nowX - 15" :y="BAND_H + 6" width="30" height="17" rx="8.5" style="fill: var(--ink)" />
            <text :x="nowX" :y="BAND_H + 18" text-anchor="middle" font-size="10.5" font-weight="700" style="fill: var(--paper)">Now</text>
          </g>
          <!-- crosshair time -->
          <g v-if="cursor && !dragging && cursor.x > gutter">
            <rect :x="Math.min(width - 128, Math.max(gutter + 2, cursor.x - 62))" :y="BAND_H + 5" width="124" height="19" rx="5" style="fill: var(--raised); stroke: var(--ink)" />
            <text
              :x="Math.min(width - 128, Math.max(gutter + 2, cursor.x - 62)) + 62"
              :y="BAND_H + 18"
              text-anchor="middle"
              font-size="11"
              font-weight="600"
              style="fill: var(--ink)"
            >{{ fmtCrosshair(timeAt(cursor.x)) }}</text>
          </g>
        </g>
      </svg>

      <!-- lanes -->
      <div ref="body" class="scroll-thin overflow-y-auto overflow-x-hidden" :style="{ maxHeight: 'max(260px, calc(100dvh - 430px))' }">
        <svg :width="width" :height="bodyH" class="block select-none">
          <defs>
            <clipPath :id="clipId"><rect :x="gutter" y="0" :width="plotW" :height="bodyH" /></clipPath>
          </defs>

          <!-- lane backgrounds + labels -->
          <g v-for="(lane, i) in layout.lanes" :key="lane.key">
            <rect v-if="i % 2 === 1" x="0" :y="lane.top" :width="width" :height="lane.height" style="fill: var(--ink)" opacity=".025" />
            <line x1="0" :x2="width" :y1="lane.top + lane.height" :y2="lane.top + lane.height" style="stroke: var(--line)" />
          </g>

          <g :clip-path="`url(#${clipId})`">
            <!-- weekends -->
            <rect v-for="w in axis.weekends" :key="w[0]" :x="x(w[0])" y="0" :width="x(w[1]) - x(w[0])" :height="bodyH" style="fill: var(--weekend)" />
            <!-- grid -->
            <line v-for="t in axis.ticks" :key="t.t" :x1="x(t.t)" :x2="x(t.t)" y1="0" :y2="bodyH" style="stroke: var(--line)" opacity=".7" />
            <line v-for="b in axis.bands" :key="b.start" :x1="x(b.start)" :x2="x(b.start)" y1="0" :y2="bodyH" style="stroke: var(--line-strong)" />
            <!-- release lines: where a release landed relative to everything else -->
            <line
              v-for="r in releaseLines"
              :key="'rl' + r.id"
              :x1="r.cx"
              :x2="r.cx"
              y1="0"
              :y2="bodyH"
              stroke-dasharray="3 4"
              stroke-width="1.25"
              style="stroke: var(--release)"
              :opacity="r.id === selectedId || r.id === hoverId ? 0.9 : 0.32"
            />
            <!-- now -->
            <line v-if="nowX > gutter && nowX < width" :x1="nowX" :x2="nowX" y1="0" :y2="bodyH" stroke-width="1.5" style="stroke: var(--ink)" opacity=".7" />

            <!-- crosshair -->
            <line v-if="cursor && !dragging && cursor.x > gutter" :x1="cursor.x" :x2="cursor.x" y1="0" :y2="bodyH" style="stroke: var(--ink)" opacity=".25" />

            <!-- events -->
            <g
              v-for="v in visible"
              :key="v.id"
              :data-id="v.id"
              role="button"
              tabindex="0"
              :aria-label="aria(v.ev)"
              :aria-pressed="v.id === selectedId"
              class="outline-none [&:focus-visible>.ring]:opacity-100"
              style="cursor: pointer"
            >
              <!-- hit area + focus/selection ring -->
              <rect
                class="ring"
                :x="v.x0 - 4"
                :y="v.y - 3"
                :width="Math.max(v.w, 16) + 8"
                :height="ITEM_H + 6"
                rx="8"
                fill="transparent"
                stroke-width="2"
                style="stroke: var(--ink)"
                :opacity="v.id === selectedId ? 1 : 0"
              />
              <template v-if="v.isSpan">
                <rect
                  :x="v.x0"
                  :y="v.y"
                  :width="v.w"
                  :height="ITEM_H"
                  rx="6"
                  stroke-width="1.5"
                  :style="{
                    fill: `color-mix(in srgb, ${color(v.ev.type)} ${v.id === selectedId || v.id === hoverId ? 34 : 18}%, transparent)`,
                    stroke: color(v.ev.type),
                  }"
                />
              </template>
              <template v-else>
                <path
                  :d="glyph(v.cx, v.cy, v.ev.type)"
                  stroke-width="2"
                  stroke-linejoin="round"
                  :style="{ fill: color(v.ev.type), stroke: color(v.ev.type) }"
                  :transform="v.id === hoverId || v.id === selectedId ? `translate(${v.cx} ${v.cy}) scale(1.2) translate(${-v.cx} ${-v.cy})` : undefined"
                />
              </template>
              <text
                v-if="v.label"
                :x="v.labelX"
                :y="v.cy + 4"
                font-size="12"
                font-weight="600"
                pointer-events="none"
                style="fill: var(--ink)"
              >{{ v.label }}</text>
            </g>
          </g>

          <!-- lane labels sit on top of the gutter -->
          <g v-if="gutter > 0">
            <rect x="0" y="0" :width="gutter" :height="bodyH" style="fill: var(--surface)" />
            <line :x1="gutter" :x2="gutter" y1="0" :y2="bodyH" style="stroke: var(--line-strong)" />
            <g v-for="lane in layout.lanes" :key="'l' + lane.key">
              <line x1="0" :x2="gutter" :y1="lane.top + lane.height" :y2="lane.top + lane.height" style="stroke: var(--line)" />
              <text :x="12" :y="lane.top + 26" font-size="13" font-weight="700" style="fill: var(--ink)">{{ fit(lane.label, gutter - 22) }}</text>
              <text :x="12" :y="lane.top + 44" font-size="11.5" style="fill: var(--muted)">{{ lane.events.length }} {{ lane.events.length === 1 ? "event" : "events" }}</text>
            </g>
          </g>
        </svg>
      </div>

      <!-- tooltip -->
      <div
        v-if="tip && hovered"
        class="pointer-events-none absolute z-20 rounded-xl border border-line bg-raised p-3 shadow-float"
        :style="{ left: tip.left + 'px', top: tip.top + 'px', width: tip.w + 'px' }"
        role="tooltip"
      >
        <p class="flex items-start gap-2 text-sm font-bold leading-5">
          <span class="mt-1.5 size-2 shrink-0 rounded-full" :style="{ background: color(hovered.type) }" />
          <span class="break-words">{{ hovered.title }}</span>
        </p>
        <p class="mt-1.5 text-xs leading-5 text-ink-soft">
          {{ hovered.type === "release" ? "Release" : "Incident" }} · {{ groups.nameOf(hovered.groupId) }}
        </p>
        <p class="text-xs leading-5 text-ink-soft">
          {{ fmtDateTime(hovered.start) }}<template v-if="hovered.end"> → {{ fmtDateTime(hovered.end) }} ({{ fmtDuration(hovered.end - hovered.start) }})</template>
        </p>
        <p v-if="hovered.tags.length" class="mt-1.5 flex flex-wrap gap-1">
          <span v-for="t in hovered.tags.slice(0, 5)" :key="t" class="chip">{{ t }}</span>
          <span v-if="hovered.tags.length > 5" class="chip">+{{ hovered.tags.length - 5 }}</span>
        </p>
      </div>
    </div>

    <!-- overview -->
    <div class="border-t border-line bg-surface px-0">
      <TimelineOverview
        :events="events"
        :extent-start="extent.start"
        :extent-end="extent.end"
        :view-start="viewStart"
        :view-end="viewEnd"
        :min-span="MIN_SPAN"
        @change="onOverview"
      />
    </div>

    <footer class="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line px-3 py-2 text-xs text-muted">
      <span class="flex items-center gap-1.5"><svg width="12" height="12" viewBox="0 0 16 16"><path d="M8 1.5L14.5 8 8 14.5 1.5 8z" style="fill: var(--release)" /></svg> Release</span>
      <span class="flex items-center gap-1.5"><svg width="12" height="12" viewBox="0 0 16 16"><path d="M8 2L14.5 13.5h-13z" style="fill: var(--incident)" /></svg> Incident</span>
      <span class="flex items-center gap-1.5"><span class="h-2.5 w-5 rounded-[3px] border-[1.5px] border-ink-soft bg-ink/10" /> Has an end time</span>
      <span class="ml-auto"><span class="font-semibold text-ink-soft">{{ inViewCount }}</span> of {{ events.length }} in view</span>
      <span class="hidden w-full sm:inline sm:w-auto">Drag to pan · Ctrl/⌘ + scroll or pinch to zoom<template v-if="canCreate"> · Double-click to add an event</template></span>
    </footer>
  </section>
</template>
