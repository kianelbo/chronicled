<script setup lang="ts">
import Modal from "./Modal.vue";

withDefaults(
  defineProps<{ open: boolean; title: string; message: string; confirmLabel: string; danger?: boolean; busy?: boolean }>(),
  { danger: true, busy: false },
);
const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <Modal :open="open" :title="title" width="26rem" :busy="busy" @close="emit('cancel')">
    <p class="text-sm leading-6 text-ink-soft">{{ message }}</p>
    <template #footer>
      <button type="button" class="btn-secondary" :disabled="busy" data-autofocus @click="emit('cancel')">Cancel</button>
      <button type="button" :class="danger ? 'btn-danger' : 'btn-primary'" :disabled="busy" @click="emit('confirm')">
        {{ busy ? "Working…" : confirmLabel }}
      </button>
    </template>
  </Modal>
</template>
