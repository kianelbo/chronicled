import type { InjectionKey, Ref } from "vue";
import { inject } from "vue";
import type { EventDraft } from "@/components/events/EventFormModal.vue";
import type { TimedEvent } from "@/types";

export interface EventActions {
  selectedId: Ref<string | null>;
  select: (id: string | null, openDetail?: boolean) => void;
  create: (draft?: EventDraft) => void;
  edit: (e: TimedEvent) => void;
  remove: (e: TimedEvent) => void;
  canCreate: Ref<boolean>;
}

export const EVENT_ACTIONS: InjectionKey<EventActions> = Symbol("event-actions");

export function useEventActions(): EventActions {
  const v = inject(EVENT_ACTIONS);
  if (!v) throw new Error("useEventActions must be used inside EventsLayout");
  return v;
}
