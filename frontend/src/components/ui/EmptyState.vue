<script setup lang="ts">
defineProps<{ title: string; text?: string }>();
</script>

<template>
  <div class="panel flex flex-col items-center px-6 py-14 text-center">
    <slot name="art" />
    <h3 class="text-lg font-bold tracking-tight">{{ title }}</h3>
    <p v-if="text" class="mt-1.5 max-w-sm text-sm leading-6 text-ink-soft">{{ text }}</p>
    <div v-if="$slots.default" class="mt-5 flex flex-wrap justify-center gap-2"><slot /></div>
  </div>
</template>
