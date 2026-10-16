<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { LIMITS } from "@/config";
import { fromLocalInput, toLocalInput } from "@/lib/time";
import { useEventFilters } from "@/composables/useEventFilters";
import { useEventsStore } from "@/stores/events";
import { useGroupsStore } from "@/stores/groups";
import { useToastStore } from "@/stores/toast";
import type { EventInput, EventType, TimedEvent } from "@/types";
import Icon from "@/components/ui/Icon.vue";
import Modal from "@/components/ui/Modal.vue";
import Segmented from "@/components/ui/Segmented.vue";
import TagInput from "@/components/ui/TagInput.vue";

export interface EventDraft {
  groupId?: number;
  start?: number;
  type?: EventType;
}

const props = defineProps<{ open: boolean; event: TimedEvent | null; draft?: EventDraft }>();
const emit = defineEmits<{ close: []; saved: [id: string] }>();

const events = useEventsStore();
const groups = useGroupsStore();
const toast = useToastStore();
const { tagCounts } = useEventFilters();

const type = ref<EventType>("incident");
const title = ref("");
const groupId = ref<number | null>(null);
const start = ref("");
const hasEnd = ref(false);
const end = ref("");
const description = ref("");
const tags = ref<string[]>([]);
const touched = ref(false);
const busy = ref(false);
const serverError = ref("");

const isEdit = computed(() => !!props.event);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    touched.value = false;
    serverError.value = "";
    const e = props.event;
    if (e) {
      type.value = e.type;
      title.value = e.title;
      groupId.value = e.groupId;
      start.value = toLocalInput(e.start);
      hasEnd.value = e.end !== null;
      end.value = e.end !== null ? toLocalInput(e.end) : "";
      description.value = e.description ?? "";
      tags.value = [...e.tags];
    } else {
      const d = props.draft ?? {};
      type.value = d.type ?? "incident";
      title.value = "";
      groupId.value = d.groupId ?? groups.editable[0]?.id ?? null;
      start.value = toLocalInput(d.start ?? Date.now());
      hasEnd.value = false;
      end.value = "";
      description.value = "";
      tags.value = [];
    }
  },
  { immediate: true },
);

const errors = computed(() => {
  const e: Record<string, string> = {};
  const t = title.value.trim();
  if (!t) e.title = "Add a title.";
  else if (t.length > LIMITS.title) e.title = `Keep the title under ${LIMITS.title} characters.`;
  if (!isEdit.value && groupId.value === null) e.group = "Choose a group.";
  if (!start.value || Number.isNaN(fromLocalInput(start.value))) e.start = "Set a start time.";
  if (hasEnd.value) {
    if (!end.value || Number.isNaN(fromLocalInput(end.value))) e.end = "Set an end time or remove it.";
    else if (start.value && fromLocalInput(end.value) < fromLocalInput(start.value)) e.end = "End must not be before the start.";
  }
  if (description.value.length > LIMITS.description) e.description = `Keep the description under ${LIMITS.description} characters.`;
  return e;
});
const valid = computed(() => Object.keys(errors.value).length === 0);

function toggleEnd() {
  hasEnd.value = !hasEnd.value;
  if (hasEnd.value && !end.value && start.value) end.value = toLocalInput(fromLocalInput(start.value) + 3_600_000);
}

async function submit() {
  touched.value = true;
  if (!valid.value) return;
  busy.value = true;
  serverError.value = "";
  const input: EventInput = {
    type: type.value,
    title: title.value.trim(),
    description: description.value.trim() ? description.value : null,
    startTime: new Date(fromLocalInput(start.value)).toISOString(),
    endTime: hasEnd.value ? new Date(fromLocalInput(end.value)).toISOString() : null,
    tags: tags.value,
  };
  try {
    const saved = props.event ? await events.update(props.event.id, input) : await events.create({ ...input, groupId: groupId.value! });
    toast.success(props.event ? "Event saved" : "Event created");
    emit("saved", saved.id);
    emit("close");
  } catch (e) {
    serverError.value = e instanceof Error ? e.message : "Couldn't save the event";
  } finally {
    busy.value = false;
  }
}

const show = (k: string) => touched.value && errors.value[k];
const typeOptions: { value: EventType; label: string }[] = [
  { value: "incident", label: "Incident" },
  { value: "release", label: "Release" },
];
const suggestions = computed(() => tagCounts.value.slice(0, 8).map(([t]) => t));
</script>

<template>
  <Modal :open="open" :title="isEdit ? 'Edit event' : 'New event'" width="36rem" :busy="busy" @close="emit('close')">
    <form id="event-form" class="space-y-4" novalidate @submit.prevent="submit">
      <p v-if="!isEdit && !groups.editable.length" class="rounded-lg border border-line-strong bg-paper px-3 py-2.5 text-sm text-ink-soft">
        You need the editor or owner role in a group to create events. Create a group or ask an owner for access.
      </p>

      <div>
        <span class="label" id="type-label">Type</span>
        <Segmented v-model="type" :options="typeOptions" label="Event type" aria-labelledby="type-label" />
      </div>

      <div>
        <label for="ev-title" class="label">Title</label>
        <input id="ev-title" v-model="title" class="field" :maxlength="LIMITS.title + 20" placeholder="Checkout API returning 502s" data-autofocus />
        <p v-if="show('title')" class="error-text">{{ errors.title }}</p>
      </div>

      <div>
        <label for="ev-group" class="label">Group</label>
        <select v-if="!isEdit" id="ev-group" v-model="groupId" class="field">
          <option v-for="g in groups.editable" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
        <input v-else class="field" :value="groups.nameOf(groupId ?? 0)" disabled aria-describedby="group-hint" />
        <p v-if="isEdit" id="group-hint" class="hint">An event can't move to another group.</p>
        <p v-if="show('group')" class="error-text">{{ errors.group }}</p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <div class="mb-1.5 flex items-center justify-between">
            <label for="ev-start" class="!mb-0 label">Start</label>
            <button type="button" class="text-xs font-semibold text-release hover:underline" @click="start = toLocalInput(Date.now())">Set to now</button>
          </div>
          <input id="ev-start" v-model="start" type="datetime-local" class="field" />
          <p v-if="show('start')" class="error-text">{{ errors.start }}</p>
        </div>
        <div>
          <div class="mb-1.5 flex items-center justify-between">
            <label for="ev-end" class="!mb-0 label">End</label>
            <button type="button" class="text-xs font-semibold text-release hover:underline" @click="toggleEnd">
              {{ hasEnd ? "Remove end" : "Add end time" }}
            </button>
          </div>
          <input v-if="hasEnd" id="ev-end" v-model="end" type="datetime-local" class="field" :min="start" />
          <div v-else class="flex h-10 items-center rounded-lg border border-dashed border-line-strong px-3 text-sm text-muted">Point in time</div>
          <p v-if="show('end')" class="error-text">{{ errors.end }}</p>
        </div>
      </div>
      <p class="hint !-mt-2">Times are in your local time zone. Add an end time for events that last a while, such as an outage or a rollout.</p>

      <div>
        <label for="ev-tags" class="label">Tags</label>
        <TagInput id="ev-tags" v-model="tags" :suggestions="suggestions" />
      </div>

      <div>
        <label for="ev-desc" class="label">Description</label>
        <textarea id="ev-desc" v-model="description" rows="5" class="field" placeholder="What happened, what was the impact, what was done about it?" />
        <p v-if="show('description')" class="error-text">{{ errors.description }}</p>
      </div>

      <div v-if="serverError" role="alert" class="flex items-start gap-2 rounded-lg border border-incident/40 bg-incident/10 px-3 py-2.5 text-sm text-incident">
        <Icon name="alert" :size="16" class="mt-0.5" /> {{ serverError }}
      </div>
    </form>

    <template #footer>
      <button type="button" class="btn-secondary" :disabled="busy" @click="emit('close')">Cancel</button>
      <button type="submit" form="event-form" class="btn-primary" :disabled="busy || (!isEdit && !groups.editable.length)">
        {{ busy ? "Saving…" : isEdit ? "Save changes" : "Create event" }}
      </button>
    </template>
  </Modal>
</template>
