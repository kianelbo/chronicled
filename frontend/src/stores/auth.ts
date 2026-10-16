import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { authApi } from "@/api";
import { ApiError, getToken, setToken } from "@/api/http";
import type { User } from "@/types";
import { useEventsStore } from "./events";
import { useGroupsStore } from "./groups";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(getToken());
  /** True once we know whether the stored token (if any) is valid. */
  const ready = ref(false);

  const isAuthenticated = computed(() => !!token.value && !!user.value);

  function accept(res: { user: User; token: string }) {
    token.value = res.token;
    setToken(res.token);
    user.value = { id: res.user.id, email: res.user.email, displayName: res.user.displayName };
  }

  async function restore() {
    if (!token.value) {
      ready.value = true;
      return;
    }
    try {
      const me = await authApi.me();
      user.value = { id: me.id, email: me.email, displayName: me.displayName };
    } catch (e) {
      // A bad token is dropped; a network failure keeps the token so a reload can retry.
      if (e instanceof ApiError && e.status !== 0) clear();
    } finally {
      ready.value = true;
    }
  }

  async function login(email: string, password: string) {
    accept(await authApi.login({ email: email.trim().toLowerCase(), password }));
  }

  async function register(displayName: string, email: string, password: string) {
    accept(await authApi.register({ displayName: displayName.trim(), email: email.trim().toLowerCase(), password }));
  }

  function clear() {
    token.value = null;
    user.value = null;
    setToken(null);
    useGroupsStore().$reset();
    useEventsStore().$reset();
  }

  return { user, token, ready, isAuthenticated, restore, login, register, logout: clear };
});
