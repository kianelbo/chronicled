import { defineStore } from "pinia";
import { ref } from "vue";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
}

export const useToastStore = defineStore("toast", () => {
  const toasts = ref<Toast[]>([]);
  let seq = 0;

  function push(kind: Toast["kind"], message: string, ms = 4500) {
    const id = ++seq;
    toasts.value.push({ id, kind, message });
    if (ms > 0) setTimeout(() => dismiss(id), ms);
  }
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return {
    toasts,
    dismiss,
    success: (m: string) => push("success", m),
    error: (m: string) => push("error", m, 7000),
    info: (m: string) => push("info", m),
  };
});
