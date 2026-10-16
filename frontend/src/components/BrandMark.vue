<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 28 });
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="var(--ink)" />
    <path d="M5 22h22" stroke="var(--paper)" stroke-opacity=".5" stroke-width="2" stroke-linecap="round" />
    <rect x="6" y="9" width="12" height="6" rx="3" fill="#E5587C" />
    <path d="M23 6l4 4-4 4-4-4z" fill="#7AA2FF" />
  </svg>
</template>
