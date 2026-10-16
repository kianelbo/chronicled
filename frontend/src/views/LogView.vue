<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useEventActions } from "@/composables/eventActions";
import { useEventFilters } from "@/composables/useEventFilters";
import { dayKey, fmtDayLong, fmtDuration, fmtTime } from "@/lib/time";
import { useGroupsStore } from "@/stores/groups";
import type { TimedEvent } from "@/types";
import Icon from "@/components/ui/Icon.vue";
import Segmented from "@/components/ui/Segmented.vue";
import TypeGlyph from "@/components/ui/TypeGlyph.vue";

const f = useEventFilters();
const actions = useEventActions();
const groups = useGroupsStore();

const order = ref<"desc" | "asc">("desc");
const PAGE = 100;
const limit = ref(PAGE);
const expanded = ref(new Set<string>());

// Sorting is client-side too; filters changing never touches the network.
const sorted = computed(() => {
  const list = [...f.filtered.value];
  list.sort((a, b) => (order.value === "desc" ? b.start - a.start : a.start - b.start));
  return list;
});
watch([() => f.filtered.value.length, order], () => (limit.value = PAGE));

interface Day {
  key: string;
  ts: number;
  events: TimedEvent[];
  incidents: number;
}
const days = computed<Day[]>(() => {
  const out: Day[] = [];
  for (const e of sorted.value.slice(0, limit.value)) {
    const key = dayKey(e.start);
    let d = out[out.length - 1];
    if (!d || d.key !== key) {
      d = { key, ts: e.start, events: [], incidents: 0 };
      out.push(d);
    }
    d.events.push(e);
    if (e.type === "incident") d.incidents++;
  }
  return out;
});
const remaining = computed(() => Math.max(0, sorted.value.length - limit.value));

const isLong = (e: TimedEvent) => !!e.description && (e.description.length > 240 || e.description.split("\n").length > 3);
function toggle(id: string) {
  const s = new Set(expanded.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  expanded.value = s;
}

const orderOptions = [
  { value: "desc" as const, label: "Newest first" },
  { value: "asc" as const, label: "Oldest first" },
];
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
</script>

<template>
  <div>
    <div class="mb-3 flex justify-end">
      <Segmented v-model="order" :options="orderOptions" label="Sort order" small />
    </div>

    <!-- Every vertical measure below is a multiple of --rule, so text sits on the ruled lines. -->
    <div class="panel notebook relative !bg-raised">
      <span class="pointer-events-none absolute inset-y-0 left-[4.75rem] w-px bg-line-strong sm:left-[6.25rem]" aria-hidden="true" />

      <section v-for="d in days" :key="d.key" :aria-label="fmtDayLong(d.ts)">
        <header
          class="sticky top-[6.3rem] z-10 flex items-end justify-between gap-3 border-b border-line-strong bg-surface pb-0 pl-4 pr-4 sm:top-14 sm:pl-6"
          style="height: calc(var(--rule) * 2)"
        >
          <h2 class="text-[15px] font-extrabold tracking-tight">{{ fmtDayLong(d.ts) }}</h2>
          <p class="text-xs text-muted">
            <template v-if="d.incidents">{{ plural(d.incidents, "incident") }}<template v-if="d.events.length - d.incidents">, </template></template>
            <template v-if="d.events.length - d.incidents">{{ plural(d.events.length - d.incidents, "release") }}</template>
          </p>
        </header>

        <div style="height: var(--rule)" />

        <article
          v-for="e in d.events"
          :key="e.id"
          class="group relative grid grid-cols-[4.75rem_1fr] sm:grid-cols-[6.25rem_1fr]"
          :class="e.id === actions.selectedId.value ? 'bg-ink/[0.05]' : ''"
          style="margin-bottom: var(--rule)"
        >
          <!-- time column -->
          <div class="pr-3 text-right font-mono text-[13px] text-ink-soft">
            <div class="font-semibold text-ink">{{ fmtTime(e.start) }}</div>
            <div v-if="e.end" class="text-muted">
              {{ dayKey(e.end) === dayKey(e.start) ? "" : "+" }}{{ fmtTime(e.end) }}
            </div>
          </div>

          <!-- entry -->
          <div class="min-w-0 pl-4 pr-3 sm:pr-4">
            <div class="flex items-start gap-2">
              <span class="flex h-[var(--rule)] items-center"><TypeGlyph :type="e.type" :size="14" /></span>
              <button
                type="button"
                class="min-w-0 flex-1 text-left text-[15px] font-bold tracking-tight hover:underline decoration-1 underline-offset-[3px]"
                @click="actions.select(e.id)"
              >
                {{ e.title }}
              </button>
              <div v-if="groups.canEdit(e.groupId)" class="flex h-[var(--rule)] items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:hidden">
                <button class="btn-icon !h-7 !w-7" :aria-label="`Edit ${e.title}`" @click="actions.edit(e)"><Icon name="pencil" :size="15" /></button>
                <button class="btn-icon !h-7 !w-7 hover:!text-incident" :aria-label="`Delete ${e.title}`" @click="actions.remove(e)"><Icon name="trash" :size="15" /></button>
              </div>
            </div>

            <div v-if="e.description" class="text-sm text-ink-soft">
              <p class="whitespace-pre-wrap break-words" :class="expanded.has(e.id) ? '' : 'line-clamp-3'">{{ e.description }}</p>
              <button v-if="isLong(e)" class="text-[13px] font-semibold text-release hover:underline" @click="toggle(e.id)">
                {{ expanded.has(e.id) ? "Show less" : "Read more" }}
              </button>
            </div>

            <p class="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
              <span>{{ groups.nameOf(e.groupId) }}</span>
              <span aria-hidden="true">/</span>
              <span>{{ e.postedByName ?? "Unknown" }}</span>
              <template v-if="e.end">
                <span aria-hidden="true">/</span>
                <span class="font-semibold text-ink-soft">{{ fmtDuration(e.end - e.start) }}</span>
              </template>
              <button
                v-for="t in e.tags"
                :key="t"
                class="chip hover:border-ink-soft hover:text-ink"
                :title="`Filter by ${t}`"
                @click="!f.tags.value.includes(t) && (f.tags.value = [...f.tags.value, t])"
              >
                {{ t }}
              </button>
            </p>
          </div>
        </article>
      </section>

      <div v-if="remaining" class="flex items-center justify-center border-t border-line bg-surface" style="height: calc(var(--rule) * 3)">
        <button class="btn-secondary" @click="limit += PAGE">Show {{ Math.min(PAGE, remaining) }} more of {{ remaining }} {{ order === "desc" ? "older" : "newer" }} entries</button>
      </div>
      <div v-else style="height: var(--rule)" />
    </div>
  </div>
</template>
