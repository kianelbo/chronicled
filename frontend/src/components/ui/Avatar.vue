<script setup lang="ts">
import { computed } from "vue";
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 32 });

const initials = computed(() => {
  const parts = props.name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
});
// Stable hue per name, kept low in saturation so avatars stay quiet next to the signal colours.
const hue = computed(() => {
  let h = 0;
  for (const c of props.name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
});
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-ink select-none"
    :style="{
      width: size + 'px',
      height: size + 'px',
      fontSize: size * 0.38 + 'px',
      background: `color-mix(in srgb, hsl(${hue} 35% 55%) 28%, var(--raised))`,
      boxShadow: `inset 0 0 0 1px color-mix(in srgb, hsl(${hue} 35% 45%) 40%, transparent)`,
    }"
    aria-hidden="true"
  >
    {{ initials }}
  </span>
</template>
