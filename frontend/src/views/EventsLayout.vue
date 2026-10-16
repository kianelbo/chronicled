<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { EVENT_ACTIONS } from "@/composables/eventActions";
import { useEventFilters } from "@/composables/useEventFilters";
import { useEventsStore } from "@/stores/events";
import { useGroupsStore } from "@/stores/groups";
import { useToastStore } from "@/stores/toast";
import type { TimedEvent } from "@/types";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import EventDetail from "@/components/events/EventDetail.vue";
import EventFormModal, { type EventDraft } from "@/components/events/EventFormModal.vue";
import FilterBar from "@/components/events/FilterBar.vue";
import Icon from "@/components/ui/Icon.vue";

const route = useRoute();
const router = useRouter();
const events = useEventsStore();
const groups = useGroupsStore();
const toast = useToastStore();
const filters = useEventFilters();

// ───────── filters <-> URL ─────────
const FILTER_KEYS = ["type", "groups", "tags", "author", "q", "period", "from", "to"];
function syncUrl() {
  const next = filters.toQuery();
  const cur = route.query;
  const same =
    Object.keys(next).length === FILTER_KEYS.filter((k) => cur[k] !== undefined).length &&
    Object.entries(next).every(([k, v]) => cur[k] === v);
  if (!same) router.replace({ query: next });
}
onMounted(() => {
  // A shared link wins; otherwise keep whatever filters were already set.
  if (FILTER_KEYS.some((k) => route.query[k] !== undefined)) filters.fromQuery(route.query);
  else syncUrl();
});
watch(
  () => [filters.type.value, filters.groupIds.value, filters.tags.value, filters.author.value, filters.q.value, filters.preset.value, filters.from.value, filters.to.value],
  syncUrl,
  { deep: true },
);
watch(() => route.name, syncUrl);

// ───────── event actions ─────────
const selectedId = ref<string | null>(null);
const detailOpen = ref(false);
const formOpen = ref(false);
const formEvent = ref<TimedEvent | null>(null);
const formDraft = ref<EventDraft | undefined>();
const deleting = ref<TimedEvent | null>(null);
const deleteBusy = ref(false);

const detailEvent = computed(() => (detailOpen.value ? (events.all.find((e) => e.id === selectedId.value) ?? null) : null));
const canCreate = computed(() => groups.editable.length > 0);

function select(id: string | null, openDetail = true) {
  selectedId.value = id;
  detailOpen.value = id !== null && openDetail;
}
function create(draft?: EventDraft) {
  if (!canCreate.value) {
    toast.info("You need the editor or owner role in a group to add events.");
    return;
  }
  formEvent.value = null;
  // Default to the group being viewed when exactly one is selected.
  const only = filters.groupIds.value.length === 1 ? filters.groupIds.value[0] : undefined;
  formDraft.value = { ...draft, groupId: draft?.groupId ?? (only && groups.canEdit(only) ? only : undefined) };
  formOpen.value = true;
}
function edit(e: TimedEvent) {
  detailOpen.value = false;
  formEvent.value = e;
  formDraft.value = undefined;
  formOpen.value = true;
}
function remove(e: TimedEvent) {
  deleting.value = e;
}
async function confirmDelete() {
  if (!deleting.value) return;
  deleteBusy.value = true;
  try {
    await events.remove(deleting.value.id);
    toast.success("Event deleted");
    if (selectedId.value === deleting.value.id) select(null);
    deleting.value = null;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't delete the event");
  } finally {
    deleteBusy.value = false;
  }
}
function onSaved(id: string) {
  selectedId.value = id;
}

provide(EVENT_ACTIONS, { selectedId, select, create, edit, remove, canCreate });

async function reload() {
  try {
    await Promise.all([groups.fetch(true), events.fetch(true)]);
    toast.success("Up to date");
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't refresh");
  }
}
async function retry() {
  try {
    await groups.fetch();
    await events.fetch(true);
  } catch {
    /* the store keeps the message */
  }
}

const noGroups = computed(() => groups.loaded && groups.groups.length === 0);
const nothingLogged = computed(() => events.loaded && events.items.length === 0);
const noMatches = computed(() => events.loaded && events.items.length > 0 && filters.filtered.value.length === 0);
</script>

<template>
  <div class="space-y-3">
    <FilterBar>
      <button class="btn-icon" aria-label="Reload from server" title="Reload from server" :disabled="events.loading" @click="reload">
        <Icon name="refresh" :class="events.loading ? 'animate-spin' : ''" />
      </button>
      <button class="btn-primary" @click="create()"><Icon name="plus" :size="16" /> New event</button>
    </FilterBar>

    <p v-if="events.loaded && events.items.length" class="text-sm text-muted" aria-live="polite">
      <span class="font-semibold text-ink">{{ filters.counts.value.total }}</span>
      {{ filters.counts.value.total === 1 ? "event" : "events" }}
      <template v-if="filters.counts.value.total">
        — {{ filters.counts.value.incidents }} {{ filters.counts.value.incidents === 1 ? "incident" : "incidents" }},
        {{ filters.counts.value.releases }} {{ filters.counts.value.releases === 1 ? "release" : "releases" }}
      </template>
      <template v-if="filters.activeCount.value"> (of {{ events.items.length }} total)</template>
    </p>

    <div v-if="!events.loaded && events.loading" class="panel grid h-72 place-items-center text-sm text-muted">Loading events…</div>

    <EmptyState v-else-if="events.error && !events.loaded" title="Couldn't load events" :text="events.error">
      <button class="btn-primary" @click="retry">Try again</button>
    </EmptyState>

    <EmptyState
      v-else-if="noGroups"
      title="Start by creating a group"
      text="Events live in groups, which decide who can see and edit them. Create one for your team, or ask an owner to add you to theirs."
    >
      <RouterLink to="/groups" class="btn-primary"><Icon name="plus" :size="16" /> Create a group</RouterLink>
    </EmptyState>

    <EmptyState
      v-else-if="nothingLogged"
      title="Nothing logged yet"
      text="Record the first release or incident and the timeline will start to fill in."
    >
      <button class="btn-primary" @click="create()"><Icon name="plus" :size="16" /> New event</button>
    </EmptyState>

    <EmptyState v-else-if="noMatches" title="No events match these filters" text="Widen the period, remove a tag, or clear everything to see all events again.">
      <button class="btn-secondary" @click="filters.clear()">Clear filters</button>
    </EmptyState>

    <RouterView v-else-if="events.loaded" />

    <EventFormModal :open="formOpen" :event="formEvent" :draft="formDraft" @close="formOpen = false" @saved="onSaved" />
    <EventDetail :event="detailEvent" @close="detailOpen = false" @edit="edit" @remove="remove" />
    <ConfirmDialog
      :open="!!deleting"
      title="Delete this event?"
      :message="deleting ? `“${deleting.title}” will be removed for everyone in ${groups.nameOf(deleting.groupId)}. This can't be undone.` : ''"
      confirm-label="Delete event"
      :busy="deleteBusy"
      @confirm="confirmDelete"
      @cancel="deleting = null"
    />
  </div>
</template>
