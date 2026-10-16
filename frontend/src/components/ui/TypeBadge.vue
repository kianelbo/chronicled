<script setup lang="ts">
import type { EventType } from "@/types";
import TypeGlyph from "./TypeGlyph.vue";
defineProps<{ type: EventType }>();
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-md px-2 h-6 text-xs font-semibold"
    :class="type === 'release' ? 'bg-release/12 text-release' : 'bg-incident/12 text-incident'"
  >
    <TypeGlyph :type="type" :size="11" />
    {{ type === "release" ? "Release" : "Incident" }}
  </span>
</template>
