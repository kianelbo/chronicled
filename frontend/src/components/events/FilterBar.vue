<script setup lang="ts">
import { computed } from "vue";
import { useEventFilters, PRESETS } from "@/composables/useEventFilters";
import { useEventsStore } from "@/stores/events";
import { useGroupsStore } from "@/stores/groups";
import { fromLocalInput, toLocalInput } from "@/lib/time";
import Icon from "@/components/ui/Icon.vue";
import Popover from "@/components/ui/Popover.vue";
import Segmented from "@/components/ui/Segmented.vue";
import type { EventType } from "@/types";

const f = useEventFilters();
const groups = useGroupsStore();
const events = useEventsStore();

const typeOptions: { value: EventType | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "incident", label: "Incidents" },
  { value: "release", label: "Releases" },
];

const groupLabel = computed(() => {
  const n = f.groupIds.value.length;
  if (!n) return "All groups";
  if (n === 1) return groups.nameOf(f.groupIds.value[0]);
  return `${n} groups`;
});
const tagLabel = computed(() => (f.tags.value.length ? (f.tags.value.length === 1 ? f.tags.value[0] : `${f.tags.value.length} tags`) : "Tags"));
const authorLabel = computed(() => f.authors.value.find((a) => a.id === f.author.value)?.name ?? "Posted by");
const periodLabel = computed(() => {
  if (f.preset.value === "custom") return "Custom range";
  return PRESETS.find((p) => p.value === f.preset.value)?.label ?? "Any time";
});

const fromInput = computed({
  get: () => (f.from.value ? toLocalInput(f.from.value).slice(0, 10) : ""),
  set: (v: string) => f.setCustom(v ? fromLocalInput(v + "T00:00") : null, f.to.value),
});
const toInput = computed({
  get: () => (f.to.value ? toLocalInput(f.to.value).slice(0, 10) : ""),
  set: (v: string) => f.setCustom(f.from.value, v ? fromLocalInput(v + "T23:59") : null),
});

const trigger = "btn-secondary btn-sm !h-9 max-w-[11rem]";
const active = "!border-ink !bg-ink/6";
</script>

<template>
  <div class="flex flex-wrap items-center gap-2" role="search">
    <div class="relative min-w-48 flex-1 sm:max-w-72">
      <Icon name="search" :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input v-model="f.q.value" type="search" class="field !h-9 !pl-9" placeholder="Search title, text, tags" aria-label="Search events" />
    </div>

    <Segmented v-model="f.type.value" :options="typeOptions" label="Event type" />

    <Popover width="17rem">
      <template #trigger="{ toggle, open }">
        <button :class="[trigger, f.groupIds.value.length && active]" aria-haspopup="listbox" :aria-expanded="open" @click="toggle">
          <Icon name="shield" :size="15" /><span class="truncate">{{ groupLabel }}</span><Icon name="chevron-down" :size="14" />
        </button>
      </template>
      <p v-if="!groups.groups.length" class="px-2.5 py-2 text-sm text-muted">You're not in any group yet.</p>
      <ul class="max-h-72 overflow-y-auto scroll-thin">
        <li v-for="g in groups.groups" :key="g.id">
          <label class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-ink/8">
            <input type="checkbox" class="size-4 accent-[var(--ink)]" :checked="f.groupIds.value.includes(g.id)" @change="f.groupIds.value = f.toggle(f.groupIds.value, g.id)" />
            <span class="flex-1 truncate">{{ g.name }}</span>
            <span class="text-xs text-muted">{{ events.all.filter((e) => e.groupId === g.id).length }}</span>
          </label>
        </li>
      </ul>
      <button v-if="f.groupIds.value.length" class="btn-ghost btn-sm mt-1 w-full" @click="f.groupIds.value = []">Show all groups</button>
    </Popover>

    <Popover width="17rem">
      <template #trigger="{ toggle, open }">
        <button :class="[trigger, f.tags.value.length && active]" aria-haspopup="listbox" :aria-expanded="open" @click="toggle">
          <Icon name="tag" :size="15" /><span class="truncate">{{ tagLabel }}</span><Icon name="chevron-down" :size="14" />
        </button>
      </template>
      <p v-if="!f.tagCounts.value.length" class="px-2.5 py-2 text-sm text-muted">No tags yet. Add tags when you create an event.</p>
      <ul class="max-h-72 overflow-y-auto scroll-thin">
        <li v-for="[tag, n] in f.tagCounts.value" :key="tag">
          <label class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-ink/8">
            <input type="checkbox" class="size-4 accent-[var(--ink)]" :checked="f.tags.value.includes(tag)" @change="f.tags.value = f.toggle(f.tags.value, tag)" />
            <span class="flex-1 truncate">{{ tag }}</span>
            <span class="text-xs text-muted">{{ n }}</span>
          </label>
        </li>
      </ul>
      <p v-if="f.tags.value.length > 1" class="px-2.5 pb-1 pt-1.5 text-xs text-muted">Shows events with any selected tag.</p>
    </Popover>

    <Popover width="15rem">
      <template #trigger="{ toggle, open }">
        <button :class="[trigger, f.author.value && active]" aria-haspopup="listbox" :aria-expanded="open" @click="toggle">
          <Icon name="user" :size="15" /><span class="truncate">{{ authorLabel }}</span><Icon name="chevron-down" :size="14" />
        </button>
      </template>
      <template #default="{ close }">
        <button class="flex w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-ink/8" @click="f.author.value = null; close()">Anyone</button>
        <button
          v-for="a in f.authors.value"
          :key="a.id"
          class="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-ink/8"
          @click="f.author.value = a.id; close()"
        >
          <span class="truncate">{{ a.name }}</span><Icon v-if="f.author.value === a.id" name="check" :size="15" />
        </button>
      </template>
    </Popover>

    <Popover width="17rem">
      <template #trigger="{ toggle, open }">
        <button :class="[trigger, f.preset.value !== 'any' && active]" aria-haspopup="menu" :aria-expanded="open" @click="toggle">
          <Icon name="clock" :size="15" /><span class="truncate">{{ periodLabel }}</span><Icon name="chevron-down" :size="14" />
        </button>
      </template>
      <template #default="{ close }">
        <button
          v-for="p in PRESETS"
          :key="p.value"
          class="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-ink/8"
          @click="f.setPreset(p.value); close()"
        >
          {{ p.label }}<Icon v-if="f.preset.value === p.value" name="check" :size="15" />
        </button>
        <div class="mt-1 border-t border-line px-2.5 pb-2 pt-2.5">
          <p class="mb-2 text-xs font-semibold text-muted">Custom range</p>
          <div class="grid grid-cols-2 gap-2">
            <input v-model="fromInput" type="date" class="field !h-8 !min-w-0 !px-2 text-[13px]" aria-label="From date" />
            <input v-model="toInput" type="date" class="field !h-8 !min-w-0 !px-2 text-[13px]" aria-label="To date" />
          </div>
        </div>
      </template>
    </Popover>

    <button v-if="f.activeCount.value" class="btn-ghost btn-sm !h-9" @click="f.clear()">
      <Icon name="x" :size="14" /> Clear {{ f.activeCount.value }} {{ f.activeCount.value === 1 ? "filter" : "filters" }}
    </button>

    <div class="ml-auto flex items-center gap-1.5"><slot /></div>
  </div>
</template>
