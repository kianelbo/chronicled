<script setup lang="ts">
import { useAuthStore } from "@/stores/auth";
import Toasts from "@/components/ui/Toasts.vue";
const auth = useAuthStore();
</script>

<template>
  <div v-if="!auth.ready" class="grid min-h-dvh place-items-center text-sm text-muted">Loading…</div>
  <RouterView v-else />
  <Toasts />
</template>
