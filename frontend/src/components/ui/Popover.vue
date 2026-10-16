<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

defineProps<{ align?: "left" | "right"; width?: string }>();
const open = ref(false);
const root = ref<HTMLElement | null>(null);

function toggle() {
  open.value = !open.value;
}
function close() {
  open.value = false;
}
function onDoc(e: Event) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) close();
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && open.value) {
    close();
    root.value?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
  }
}
onMounted(() => {
  document.addEventListener("pointerdown", onDoc);
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDoc);
  document.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div ref="root" class="relative">
    <slot name="trigger" :open="open" :toggle="toggle" />
    <div
      v-if="open"
      class="absolute top-full z-30 mt-1.5 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-raised p-1.5 shadow-float [animation:pop-in_.14s_ease-out]"
      :class="align === 'right' ? 'right-0' : 'left-0'"
      :style="{ width: width ?? '16rem' }"
    >
      <slot :close="close" />
    </div>
  </div>
</template>
