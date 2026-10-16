<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { makeTicks } from "@/lib/time";
import type { TimedEvent } from "@/types";

const props = defineProps<{
  events: TimedEvent[];
  extentStart: number;
  extentEnd: number;
  viewStart: number;
  viewEnd: number;
  minSpan: number;
}>();
const emit = defineEmits<{ change: [start: number, end: number] }>();

const H = 56;
const AXIS = 16;
const root = ref<HTMLElement | null>(null);
const width = ref(800);
let ro: ResizeObserver | null = null;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (width.value = Math.max(100, e.contentRect.width)));
  if (root.value) ro.observe(root.value);
});
onBeforeUnmount(() => ro?.disconnect());

const extent = computed(() => Math.max(1, props.extentEnd - props.extentStart));
const k = computed(() => width.value / extent.value);
const px = (t: number) => (t - props.extentStart) * k.value;

// Stacked activity histogram, so you can see where the busy periods are at a glance.
const bars = computed(() => {
  const n = Math.max(10, Math.floor(width.value / 7));
  const inc = new Array<number>(n).fill(0);
  const rel = new Array<number>(n).fill(0);
  for (const e of props.events) {
    const i = Math.min(n - 1, Math.max(0, Math.floor(((e.start - props.extentStart) / extent.value) * n)));
    if (e.type === "incident") inc[i]++;
    else rel[i]++;
  }
  const max = Math.max(1, ...inc.map((v, i) => v + rel[i]));
  const bw = width.value / n;
  const plotH = H - AXIS - 4;
  return inc.map((v, i) => {
    const hi = (v / max) * plotH;
    const hr = (rel[i] / max) * plotH;
    return { x: i * bw + 1, w: Math.max(1, bw - 2), hi, hr, y: H - AXIS - hi };
  });
});

const ticks = computed(() => makeTicks(props.extentStart, props.extentEnd, k.value, 90).ticks.filter((t) => px(t.t) >= 26));

const win = computed(() => {
  const x0 = Math.max(0, px(props.viewStart));
  const x1 = Math.min(width.value, px(props.viewEnd));
  return { x: x0, w: Math.max(6, x1 - x0) };
});

type Mode = "move" | "left" | "right" | "seek";
let mode: Mode | null = null;
let grabT = 0;
let startAtDown = 0;
let endAtDown = 0;

const tAt = (clientX: number) => {
  const r = root.value!.getBoundingClientRect();
  return props.extentStart + ((clientX - r.left) / r.width) * extent.value;
};

function down(e: PointerEvent, m: Mode) {
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  mode = m;
  grabT = tAt(e.clientX);
  startAtDown = props.viewStart;
  endAtDown = props.viewEnd;
}
function rootDown(e: PointerEvent) {
  // Click on empty track: centre the window there, then keep dragging it.
  const span = props.viewEnd - props.viewStart;
  const t = tAt(e.clientX);
  emit("change", t - span / 2, t + span / 2);
  down(e, "seek");
  startAtDown = t - span / 2;
  endAtDown = t + span / 2;
}
function move(e: PointerEvent) {
  if (!mode) return;
  const d = tAt(e.clientX) - grabT;
  if (mode === "move" || mode === "seek") emit("change", startAtDown + d, endAtDown + d);
  else if (mode === "left") emit("change", Math.min(startAtDown + d, endAtDown - props.minSpan), endAtDown);
  else emit("change", startAtDown, Math.max(endAtDown + d, startAtDown + props.minSpan));
}
function up() {
  mode = null;
}
</script>

<template>
  <div ref="root" class="relative select-none touch-none" :style="{ height: H + 'px' }" aria-label="Overview of all events. Drag the window to change the visible period." role="group" @pointerdown="rootDown" @pointermove="move" @pointerup="up" @pointercancel="up">
    <svg :width="width" :height="H" class="absolute inset-0 block">
      <g>
        <template v-for="(b, i) in bars" :key="i">
          <rect v-if="b.hi > 0" :x="b.x" :y="b.y" :width="b.w" :height="b.hi" rx="1" style="fill: var(--incident)" opacity=".85" />
          <rect v-if="b.hr > 0" :x="b.x" :y="b.y - b.hr" :width="b.w" :height="b.hr" rx="1" style="fill: var(--release)" opacity=".85" />
        </template>
      </g>
      <line :x1="0" :x2="width" :y1="H - AXIS" :y2="H - AXIS" style="stroke: var(--line-strong)" />
      <g font-size="10.5" style="fill: var(--muted)">
        <text v-for="t in ticks" :key="t.t" :x="Math.min(width - 4, Math.max(2, px(t.t) + 3))" :y="H - 4">{{ t.label }}</text>
      </g>
    </svg>

    <!-- visible window -->
    <div
      class="absolute top-0 border-x-2 border-ink bg-ink/10 cursor-grab active:cursor-grabbing"
      :style="{ left: win.x + 'px', width: win.w + 'px', height: H - AXIS + 'px' }"
      @pointerdown.stop="down($event, 'move')"
    >
      <span class="absolute -left-2 top-0 h-full w-4 cursor-ew-resize" @pointerdown.stop="down($event, 'left')" />
      <span class="absolute -right-2 top-0 h-full w-4 cursor-ew-resize" @pointerdown.stop="down($event, 'right')" />
      <span class="absolute left-[-5px] top-1/2 h-5 w-2 -translate-y-1/2 rounded-sm bg-ink" />
      <span class="absolute right-[-5px] top-1/2 h-5 w-2 -translate-y-1/2 rounded-sm bg-ink" />
    </div>
  </div>
</template>
