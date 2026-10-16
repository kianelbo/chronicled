<script setup lang="ts">
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useGroupsStore } from "@/stores/groups";
import Avatar from "@/components/ui/Avatar.vue";
import Icon from "@/components/ui/Icon.vue";
import RoleBadge from "@/components/ui/RoleBadge.vue";

const auth = useAuthStore();
const groups = useGroupsStore();
const router = useRouter();

function signOut() {
  auth.logout();
  router.replace({ name: "login" });
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <h1 class="mb-5 text-2xl font-extrabold tracking-tight">Your account</h1>

    <section class="panel flex flex-wrap items-center gap-4 p-5">
      <Avatar :name="auth.user?.displayName ?? '?'" :size="56" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-lg font-bold tracking-tight">{{ auth.user?.displayName }}</p>
        <p class="truncate text-sm text-ink-soft">{{ auth.user?.email }}</p>
      </div>
      <button class="btn-secondary" @click="signOut"><Icon name="logout" :size="16" /> Sign out</button>
    </section>

    <section class="mt-6">
      <h2 class="mb-2 text-[15px] font-bold">Your groups</h2>
      <p v-if="!groups.groups.length" class="panel px-5 py-4 text-sm text-ink-soft">
        You're not in any group. <RouterLink to="/groups" class="font-semibold text-release hover:underline">Create one</RouterLink>.
      </p>
      <ul v-else class="panel divide-y divide-line overflow-hidden">
        <li v-for="g in groups.groups" :key="g.id">
          <RouterLink :to="{ name: 'group', params: { id: g.id } }" class="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-ink/5">
            <span class="truncate font-semibold">{{ g.name }}</span>
            <RoleBadge :role="g.role" />
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>
