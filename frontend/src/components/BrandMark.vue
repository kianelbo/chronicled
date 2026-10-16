<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 28 });
</script>

<template>
  <img src="/favicon.svg" :width="size" :height="size" alt="" aria-hidden="true" />
</template>
