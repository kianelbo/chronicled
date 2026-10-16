<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { fmtDate } from "@/lib/time";
import { useEventsStore } from "@/stores/events";
import { useGroupsStore } from "@/stores/groups";
import Avatar from "@/components/ui/Avatar.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import GroupFormModal from "@/components/groups/GroupFormModal.vue";
import Icon from "@/components/ui/Icon.vue";
import RoleBadge from "@/components/ui/RoleBadge.vue";
import type { Group } from "@/types";

const groups = useGroupsStore();
const events = useEventsStore();
const router = useRouter();
const creating = ref(false);

onMounted(async () => {
  await groups.fetch();
  // Member avatars; failures just leave a row without avatars.
  await Promise.allSettled(groups.groups.map((g) => groups.loadMembers(g.id)));
});

const eventCounts = computed(() => {
  const m = new Map<number, number>();
  for (const e of events.items) m.set(e.groupId, (m.get(e.groupId) ?? 0) + 1);
  return m;
});

function created(g: Group) {
  router.push({ name: "group", params: { id: g.id } });
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div class="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight">Groups</h1>
        <p class="mt-1 text-sm text-ink-soft">A group decides who can see and edit a set of events.</p>
      </div>
      <button class="btn-primary" @click="creating = true"><Icon name="plus" :size="16" /> New group</button>
    </div>

    <div v-if="!groups.loaded" class="panel grid h-40 place-items-center text-sm text-muted">Loading groups…</div>

    <EmptyState v-else-if="!groups.groups.length" title="You're not in a group yet" text="Create one for your team, or ask an owner to add your email to theirs.">
      <button class="btn-primary" @click="creating = true"><Icon name="plus" :size="16" /> Create a group</button>
    </EmptyState>

    <ul v-else class="panel divide-y divide-line overflow-hidden">
      <li v-for="g in groups.groups" :key="g.id">
        <RouterLink :to="{ name: 'group', params: { id: g.id } }" class="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-ink/5 sm:px-5">
          <div class="min-w-0 flex-1">
            <p class="truncate text-[15px] font-bold tracking-tight">{{ g.name }}</p>
            <p class="mt-0.5 text-[13px] text-muted">
              {{ eventCounts.get(g.id) ?? 0 }} {{ (eventCounts.get(g.id) ?? 0) === 1 ? "event" : "events" }} · created {{ fmtDate(Date.parse(g.createdAt)) }}
            </p>
          </div>
          <div v-if="groups.members[g.id]?.length" class="hidden items-center sm:flex" :title="`${groups.members[g.id].length} members`">
            <div class="flex -space-x-2">
              <Avatar v-for="m in groups.members[g.id].slice(0, 4)" :key="m.id" :name="m.name" :size="28" class="ring-2 ring-surface" />
            </div>
            <span v-if="groups.members[g.id].length > 4" class="ml-2 text-xs text-muted">+{{ groups.members[g.id].length - 4 }}</span>
          </div>
          <RoleBadge :role="g.role" />
          <Icon name="chevron-right" :size="16" class="text-muted" />
        </RouterLink>
      </li>
    </ul>

    <GroupFormModal :open="creating" @close="creating = false" @saved="created" />
  </div>
</template>
