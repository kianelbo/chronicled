<script setup lang="ts">
import { ref } from "vue";
import { LIMITS } from "@/config";
import Icon from "./Icon.vue";

const props = defineProps<{ modelValue: string[]; suggestions?: string[]; id?: string }>();
const emit = defineEmits<{ "update:modelValue": [tags: string[]] }>();

const draft = ref("");
const input = ref<HTMLInputElement | null>(null);

function add(raw: string) {
  const tag = raw.trim().replace(/,+$/, "").trim().slice(0, LIMITS.tag);
  if (!tag) return;
  if (props.modelValue.length >= LIMITS.tags) return;
  if (props.modelValue.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
  emit("update:modelValue", [...props.modelValue, tag]);
}
function commit() {
  add(draft.value);
  draft.value = "";
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    commit();
  } else if (e.key === "Backspace" && !draft.value && props.modelValue.length) {
    emit("update:modelValue", props.modelValue.slice(0, -1));
  }
}
function remove(tag: string) {
  emit("update:modelValue", props.modelValue.filter((t) => t !== tag));
  input.value?.focus();
}
const free = () => (props.suggestions ?? []).filter((s) => !props.modelValue.includes(s)).slice(0, 8);
</script>

<template>
  <div>
    <div
      class="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-line-strong bg-raised px-2 py-1.5 transition-colors hover:border-ink-soft focus-within:border-release focus-within:ring-2 focus-within:ring-release/25"
      @click="input?.focus()"
    >
      <span v-for="t in modelValue" :key="t" class="chip !h-6 bg-paper pr-1 text-[12.5px]">
        {{ t }}
        <button type="button" class="rounded p-0.5 hover:bg-ink/10" :aria-label="`Remove tag ${t}`" @click.stop="remove(t)">
          <Icon name="x" :size="12" />
        </button>
      </span>
      <input
        :id="id"
        ref="input"
        v-model="draft"
        :disabled="modelValue.length >= LIMITS.tags"
        :maxlength="LIMITS.tag"
        class="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted/80"
        :placeholder="modelValue.length ? '' : 'Type a tag, press Enter'"
        @keydown="onKey"
        @blur="commit"
      />
    </div>
    <div v-if="free().length" class="mt-2 flex flex-wrap gap-1.5">
      <button v-for="s in free()" :key="s" type="button" class="chip hover:border-ink-soft hover:text-ink" @click="add(s)">
        <Icon name="plus" :size="11" /> {{ s }}
      </button>
    </div>
    <p class="hint">{{ modelValue.length }} of {{ LIMITS.tags }} tags</p>
  </div>
</template>
