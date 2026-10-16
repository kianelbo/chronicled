<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useEventsStore } from "@/stores/events";
import { useGroupsStore } from "@/stores/groups";
import { useToastStore } from "@/stores/toast";
import { useTheme } from "@/composables/useTheme";
import { APP_NAME } from "@/config";
import Avatar from "./ui/Avatar.vue";
import BrandMark from "./BrandMark.vue";
import Icon from "./ui/Icon.vue";
import Popover from "./ui/Popover.vue";

const auth = useAuthStore();
const groups = useGroupsStore();
const events = useEventsStore();
const toast = useToastStore();
const router = useRouter();
const { dark, toggle } = useTheme();

const nav = [
  { to: "/timeline", label: "Timeline", icon: "calendar" },
  { to: "/log", label: "Log", icon: "list" },
  { to: "/groups", label: "Groups", icon: "shield" },
  { to: "/people", label: "People", icon: "users" },
];

// Load everything the app needs once; the views only read from the stores.
onMounted(async () => {
  try {
    await groups.fetch();
    await events.fetch();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't load your data");
  }
});

function signOut() {
  auth.logout();
  router.replace({ name: "login" });
}
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="sticky top-0 z-40 border-b border-line bg-surface/92 backdrop-blur">
      <div class="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
        <RouterLink to="/timeline" class="flex items-center gap-2.5 rounded-lg pr-1" aria-label="Chronicled home">
          <BrandMark />
          <span class="text-[17px] font-extrabold tracking-tight">{{ APP_NAME }}</span>
        </RouterLink>

        <nav class="ml-2 hidden items-center gap-1 sm:flex" aria-label="Main">
          <RouterLink
            v-for="n in nav"
            :key="n.to"
            :to="n.to"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink"
            active-class="!bg-ink/9 !text-ink"
          >
            {{ n.label }}
          </RouterLink>
        </nav>

        <div class="ml-auto flex items-center gap-1">
          <button class="btn-icon" :aria-label="dark ? 'Switch to light theme' : 'Switch to dark theme'" @click="toggle">
            <Icon :name="dark ? 'sun' : 'moon'" />
          </button>
          <Popover align="right" width="15rem">
            <template #trigger="{ toggle: t, open }">
              <button
                class="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-ink/8"
                aria-haspopup="menu"
                :aria-expanded="open"
                @click="t"
              >
                <Avatar :name="auth.user?.displayName ?? '?'" :size="28" />
                <span class="hidden max-w-32 truncate text-sm font-semibold sm:block">{{ auth.user?.displayName }}</span>
                <Icon name="chevron-down" :size="14" class="text-muted" />
              </button>
            </template>
            <template #default="{ close }">
              <div class="px-2.5 py-2">
                <p class="truncate text-sm font-semibold">{{ auth.user?.displayName }}</p>
                <p class="truncate text-xs text-muted">{{ auth.user?.email }}</p>
              </div>
              <div class="my-1 border-t border-line" />
              <RouterLink to="/account" class="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-ink/8" @click="close">
                <Icon name="user" :size="16" /> Your account
              </RouterLink>
              <button class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-ink/8" @click="signOut">
                <Icon name="logout" :size="16" /> Sign out
              </button>
            </template>
          </Popover>
        </div>
      </div>

      <nav class="flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 sm:hidden" aria-label="Main">
        <RouterLink
          v-for="n in nav"
          :key="n.to"
          :to="n.to"
          class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-muted"
          active-class="!bg-ink/9 !text-ink"
        >
          <Icon :name="n.icon" :size="15" /> {{ n.label }}
        </RouterLink>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6"><RouterView /></main>
  </div>
</template>
