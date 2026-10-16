<script setup lang="ts">
import { computed } from "vue";
import { useEventFilters } from "@/composables/useEventFilters";
import { fmtDateTime, fmtDuration } from "@/lib/time";
import { useGroupsStore } from "@/stores/groups";
import type { TimedEvent } from "@/types";
import Icon from "@/components/ui/Icon.vue";
import Modal from "@/components/ui/Modal.vue";
import TypeBadge from "@/components/ui/TypeBadge.vue";

const props = defineProps<{ event: TimedEvent | null }>();
const emit = defineEmits<{ close: []; edit: [e: TimedEvent]; remove: [e: TimedEvent] }>();

const groups = useGroupsStore();
const filters = useEventFilters();
const canEdit = computed(() => (props.event ? groups.canEdit(props.event.groupId) : false));

function filterByTag(tag: string) {
  if (!filters.tags.value.includes(tag)) filters.tags.value = [...filters.tags.value, tag];
  emit("close");
}
</script>

<template>
  <Modal :open="!!event" title="Event details" variant="drawer" @close="emit('close')">
    <template v-if="event">
      <div class="space-y-5">
        <div class="flex flex-wrap items-center gap-2">
          <TypeBadge :type="event.type" />
          <span class="chip"><Icon name="shield" :size="12" /> {{ groups.nameOf(event.groupId) }}</span>
        </div>

        <h3 class="text-xl font-extrabold leading-tight tracking-tight">{{ event.title }}</h3>

        <dl class="space-y-2.5 text-sm">
          <div class="flex gap-3">
            <dt class="w-20 shrink-0 text-muted">{{ event.end ? "Started" : "Time" }}</dt>
            <dd class="font-medium">{{ fmtDateTime(event.start) }}</dd>
          </div>
          <div v-if="event.end" class="flex gap-3">
            <dt class="w-20 shrink-0 text-muted">Ended</dt>
            <dd class="font-medium">{{ fmtDateTime(event.end) }}</dd>
          </div>
          <div v-if="event.end" class="flex gap-3">
            <dt class="w-20 shrink-0 text-muted">Duration</dt>
            <dd class="font-medium">{{ fmtDuration(event.end - event.start) }}</dd>
          </div>
          <div class="flex gap-3">
            <dt class="w-20 shrink-0 text-muted">Posted by</dt>
            <dd class="font-medium">{{ event.postedByName ?? "Unknown" }}</dd>
          </div>
        </dl>

        <div v-if="event.tags.length" class="flex flex-wrap gap-1.5">
          <button v-for="t in event.tags" :key="t" class="chip hover:border-ink-soft hover:text-ink" :title="`Filter by ${t}`" @click="filterByTag(t)">
            <Icon name="tag" :size="11" /> {{ t }}
          </button>
        </div>

        <div>
          <h4 class="mb-1.5 text-[13px] font-semibold">Description</h4>
          <p v-if="event.description" class="whitespace-pre-wrap break-words text-sm leading-6 text-ink-soft">{{ event.description }}</p>
          <p v-else class="text-sm text-muted">No description.</p>
        </div>

        <p class="text-xs text-muted">
          Logged {{ fmtDateTime(Date.parse(event.createdAt)) }}<template v-if="event.updatedAt !== event.createdAt">, edited {{ fmtDateTime(Date.parse(event.updatedAt)) }}</template>
        </p>
      </div>
    </template>

    <template v-if="event" #footer>
      <p v-if="!canEdit" class="mr-auto text-xs text-muted">You have view-only access to this group.</p>
      <template v-else>
        <button class="btn-secondary text-incident mr-auto" @click="emit('remove', event!)"><Icon name="trash" :size="15" /> Delete</button>
        <button class="btn-primary" @click="emit('edit', event!)"><Icon name="pencil" :size="15" /> Edit</button>
      </template>
    </template>
  </Modal>
</template>
