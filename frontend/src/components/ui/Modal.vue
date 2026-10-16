<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import Icon from "./Icon.vue";

const props = withDefaults(
  defineProps<{ open: boolean; title: string; variant?: "dialog" | "drawer"; width?: string; busy?: boolean }>(),
  { variant: "dialog", width: "32rem", busy: false },
);
const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && !props.busy) {
    e.stopPropagation();
    emit("close");
  } else if (e.key === "Tab" && panel.value) {
    const els = [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      document.addEventListener("keydown", onKey, true);
      document.body.style.overflow = "hidden";
      await nextTick();
      const target = panel.value?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.value;
      target?.focus();
    } else {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKey, true);
  document.body.style.overflow = "";
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex"
      :class="variant === 'drawer' ? 'justify-end' : 'items-end justify-center sm:items-center p-0 sm:p-6'"
    >
      <div class="absolute inset-0 bg-ink/45 backdrop-blur-[2px] [animation:fade-in_.15s_ease-out]" @click="!busy && emit('close')" />
      <section
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
        class="relative flex max-h-full w-full flex-col bg-raised shadow-float outline-none"
        :class="
          variant === 'drawer'
            ? 'sm:max-w-[28rem] border-l border-line [animation:sheet-in_.2s_ease-out] max-sm:mt-12 max-sm:rounded-t-2xl'
            : 'max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)] rounded-t-2xl sm:rounded-2xl border border-line [animation:pop-in_.18s_ease-out]'
        "
        :style="variant === 'dialog' ? { maxWidth: width } : undefined"
      >
        <header class="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-line">
          <slot name="header">
            <h2 class="flex-1 text-lg font-bold tracking-tight leading-7">{{ title }}</h2>
          </slot>
          <button type="button" class="btn-icon -mr-2 -mt-0.5" aria-label="Close" :disabled="busy" @click="emit('close')">
            <Icon name="x" />
          </button>
        </header>
        <div class="flex-1 overflow-y-auto scroll-thin px-5 py-4"><slot /></div>
        <footer v-if="$slots.footer" class="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
          <slot name="footer" />
        </footer>
      </section>
    </div>
  </Teleport>
</template>
