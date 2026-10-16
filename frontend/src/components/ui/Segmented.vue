<script setup lang="ts" generic="T extends string | number | null">
defineProps<{ modelValue: T; options: { value: T; label: string }[]; label: string; small?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: T] }>();
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="inline-flex rounded-lg border border-line-strong bg-paper p-0.5">
    <button
      v-for="o in options"
      :key="String(o.value)"
      type="button"
      role="radio"
      :aria-checked="o.value === modelValue"
      class="rounded-md px-3 text-[13px] font-semibold transition-colors"
      :class="[
        small ? 'h-7' : 'h-8',
        o.value === modelValue ? 'bg-raised text-ink shadow-[0_1px_2px_rgba(18,38,58,.15)]' : 'text-muted hover:text-ink',
      ]"
      @click="emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>
