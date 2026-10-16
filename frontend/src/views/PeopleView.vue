<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useGroupsStore } from "@/stores/groups";
import type { GroupRole } from "@/types";
import Avatar from "@/components/ui/Avatar.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Icon from "@/components/ui/Icon.vue";

const auth = useAuthStore();
const groups = useGroupsStore();

const q = ref("");
const loading = ref(true);
const failed = ref(0);

async function load() {
  loading.value = true;
  failed.value = 0;
  try {
    await groups.fetch();
    // TODO: there's no "list users" endpoint, so the directory is built from each group's member list.
    const results = await Promise.allSettled(groups.groups.map((g) => groups.loadMembers(g.id, true)));
    failed.value = results.filter((r) => r.status === "rejected").length;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

interface Person {
  id: number;
  name: string;
  email: string;
  memberships: { groupId: number; group: string; role: GroupRole }[];
}

const people = computed<Person[]>(() => {
  const m = new Map<number, Person>();
  for (const g of groups.groups) {
    for (const u of groups.members[g.id] ?? []) {
      const p = m.get(u.id) ?? { id: u.id, name: u.name, email: u.email, memberships: [] };
      p.memberships.push({ groupId: g.id, group: g.name, role: u.role });
      m.set(u.id, p);
    }
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
});

const shown = computed(() => {
  const n = q.value.trim().toLowerCase();
  return n ? people.value.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(n)) : people.value;
});
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div class="mb-5">
      <h1 class="text-2xl font-extrabold tracking-tight">People</h1>
      <p class="mt-1 text-sm text-ink-soft">Everyone who shares a group with you.</p>
    </div>

    <div class="relative mb-4 max-w-sm">
      <Icon name="search" :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input v-model="q" type="search" class="field !pl-9" placeholder="Search by name or email" aria-label="Search people" />
    </div>

    <p v-if="failed" class="mb-3 rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink-soft" role="status">
      Members of {{ failed }} {{ failed === 1 ? "group" : "groups" }} couldn't be loaded.
      <button class="font-semibold text-release hover:underline" @click="load">Try again</button>
    </p>

    <div v-if="loading && !people.length" class="panel grid h-40 place-items-center text-sm text-muted">Loading people…</div>

    <EmptyState v-else-if="!people.length" title="No one here yet" text="Join or create a group and its members will show up here.">
      <RouterLink to="/groups" class="btn-primary">Go to groups</RouterLink>
    </EmptyState>

    <EmptyState v-else-if="!shown.length" title="Nobody matches that search" />

    <ul v-else class="panel divide-y divide-line overflow-hidden">
      <li v-for="p in shown" :key="p.id" class="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <Avatar :name="p.name" :size="38" />
        <div class="min-w-0 flex-1 basis-44">
          <p class="truncate text-sm font-bold">
            {{ p.name }}<span v-if="p.id === auth.user?.id" class="ml-1.5 text-xs font-medium text-muted">(you)</span>
          </p>
          <p class="truncate text-[13px] text-muted">{{ p.email }}</p>
        </div>
        <div class="flex flex-wrap justify-end gap-1.5">
          <RouterLink
            v-for="m in p.memberships"
            :key="m.groupId"
            :to="{ name: 'group', params: { id: m.groupId } }"
            class="chip !h-6 hover:border-ink-soft hover:text-ink"
          >
            {{ m.group }}<span class="text-muted">· {{ m.role }}</span>
          </RouterLink>
        </div>
      </li>
    </ul>
  </div>
</template>
