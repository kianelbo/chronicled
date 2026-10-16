<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { LIMITS } from "@/config";
import { useGroupsStore } from "@/stores/groups";
import { useToastStore } from "@/stores/toast";
import type { Group } from "@/types";
import Icon from "@/components/ui/Icon.vue";
import Modal from "@/components/ui/Modal.vue";

const props = defineProps<{ open: boolean; group?: Group | null }>();
const emit = defineEmits<{ close: []; saved: [group: Group] }>();

const groups = useGroupsStore();
const toast = useToastStore();
const name = ref("");
const busy = ref(false);
const error = ref("");

watch(
  () => props.open,
  (o) => {
    if (!o) return;
    name.value = props.group?.name ?? "";
    error.value = "";
  },
  { immediate: true },
);

const trimmed = computed(() => name.value.trim());
const valid = computed(() => trimmed.value.length > 0 && trimmed.value.length <= LIMITS.groupName);

async function submit() {
  if (!valid.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (props.group) {
      await groups.rename(props.group.id, trimmed.value);
      toast.success("Group renamed");
      emit("saved", { ...props.group, name: trimmed.value });
    } else {
      const g = await groups.create(trimmed.value);
      toast.success("Group created");
      emit("saved", g);
    }
    emit("close");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Couldn't save the group";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal :open="open" :title="group ? 'Rename group' : 'New group'" width="26rem" :busy="busy" @close="emit('close')">
    <form id="group-form" class="space-y-3" novalidate @submit.prevent="submit">
      <div>
        <label for="g-name" class="label">Group name</label>
        <input id="g-name" v-model="name" class="field" :maxlength="LIMITS.groupName" placeholder="Payments platform" data-autofocus />
        <p v-if="!group" class="hint">You become the owner and can add teammates afterwards.</p>
      </div>
      <div v-if="error" role="alert" class="flex items-start gap-2 rounded-lg border border-incident/40 bg-incident/10 px-3 py-2.5 text-sm text-incident">
        <Icon name="alert" :size="16" class="mt-0.5" /> {{ error }}
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn-secondary" :disabled="busy" @click="emit('close')">Cancel</button>
      <button type="submit" form="group-form" class="btn-primary" :disabled="busy || !valid">
        {{ busy ? "Saving…" : group ? "Save name" : "Create group" }}
      </button>
    </template>
  </Modal>
</template>
