<script setup lang="ts">
import { computed } from "vue";
import TimelineChart from "@/components/timeline/TimelineChart.vue";
import { useEventActions } from "@/composables/eventActions";
import { useEventFilters } from "@/composables/useEventFilters";
import { useGroupsStore } from "@/stores/groups";

const f = useEventFilters();
const actions = useEventActions();
const groups = useGroupsStore();

const range = computed(() => ({ from: f.from.value, to: f.to.value }));
</script>

<template>
  <TimelineChart
    :events="f.filtered.value"
    :selected-id="actions.selectedId.value"
    :range="range"
    :can-create="actions.canCreate.value"
    @select="(id) => actions.select(id)"
    @create="(d) => actions.create({ ...d, groupId: d.groupId && groups.canEdit(d.groupId) ? d.groupId : undefined })"
  />
</template>
