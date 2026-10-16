<script setup lang="ts">
import type { GroupRole } from "@/types";
defineProps<{ role: GroupRole }>();
</script>

<!-- Intensity of ink encodes power: outline < tint < solid. -->
<template>
  <span
    class="inline-flex items-center rounded-md px-2 h-6 text-xs font-semibold capitalize"
    :class="{
      'border border-line-strong text-muted': role === 'viewer',
      'bg-ink/10 text-ink': role === 'editor',
      'bg-ink text-paper': role === 'owner',
    }"
  >
    {{ role }}
  </span>
</template>
