import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { eventsApi } from "@/api";
import type { EventInput, LogEvent, TimedEvent } from "@/types";

function timed(e: LogEvent): TimedEvent {
  return { ...e, start: Date.parse(e.startTime), end: e.endTime ? Date.parse(e.endTime) : null };
}

/**
 * Holds every event the user can see. It is loaded with a single request and
 * kept in sync from mutation responses, so filtering never needs the network.
 */
export const useEventsStore = defineStore("events", () => {
  const items = ref<LogEvent[]>([]);
  const loaded = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const all = computed<TimedEvent[]>(() => items.value.map(timed));

  async function fetch(force = false) {
    if (loading.value || (loaded.value && !force)) return;
    loading.value = true;
    error.value = null;
    try {
      items.value = await eventsApi.list();
      loaded.value = true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load events";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function create(input: EventInput & { groupId: number }) {
    const ev = await eventsApi.create(input);
    items.value = [ev, ...items.value];
    return ev;
  }

  async function update(id: string, input: Partial<EventInput>) {
    const ev = await eventsApi.update(id, input);
    items.value = items.value.map((e) => (e.id === id ? ev : e));
    return ev;
  }

  async function remove(id: string) {
    await eventsApi.remove(id);
    items.value = items.value.filter((e) => e.id !== id);
  }

  function $reset() {
    items.value = [];
    loaded.value = false;
    error.value = null;
  }

  return { items, all, loaded, loading, error, fetch, create, update, remove, $reset };
});
