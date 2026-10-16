<script setup lang="ts">
import { useToastStore } from "@/stores/toast";
import Icon from "./Icon.vue";
const toast = useToastStore();
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
    <div
      v-for="t in toast.toasts"
      :key="t.id"
      class="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl bg-ink px-4 py-2.5 text-sm text-paper shadow-float [animation:pop-in_.18s_ease-out]"
      :role="t.kind === 'error' ? 'alert' : 'status'"
    >
      <Icon :name="t.kind === 'error' ? 'alert' : 'check'" :size="16" class="mt-0.5" :class="t.kind === 'error' ? 'text-[#ff9db3]' : ''" />
      <span class="flex-1 leading-5">{{ t.message }}</span>
      <button type="button" class="-mr-1 opacity-70 hover:opacity-100" aria-label="Dismiss" @click="toast.dismiss(t.id)">
        <Icon name="x" :size="14" />
      </button>
    </div>
  </div>
</template>
