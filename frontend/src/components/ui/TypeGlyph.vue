<script setup lang="ts">
import type { EventType } from "@/types";
withDefaults(defineProps<{ type: EventType; size?: number; span?: boolean }>(), { size: 14, span: false });
</script>

<template>
  <!-- Release = diamond, incident = triangle. Shape + colour, so it never relies on colour alone. -->
  <svg :width="size" :height="size" viewBox="0 0 16 16" aria-hidden="true" class="shrink-0">
    <path v-if="type === 'release'" d="M8 1.5L14.5 8 8 14.5 1.5 8z" fill="var(--release)" stroke="var(--release)" stroke-width="1.5" stroke-linejoin="round" />
    <path v-else d="M8 2L14.5 13.5h-13z" fill="var(--incident)" stroke="var(--incident)" stroke-width="1.5" stroke-linejoin="round" />
  </svg>
</template>
