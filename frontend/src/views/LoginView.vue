<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AuthLayout from "@/components/AuthLayout.vue";
import Icon from "@/components/ui/Icon.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref("");
const password = ref("");
const error = ref("");
const busy = ref(false);

async function submit() {
  error.value = "";
  busy.value = true;
  try {
    await auth.login(email.value, password.value);
    const redirect = typeof route.query.redirect === "string" && route.query.redirect.startsWith("/") ? route.query.redirect : "/timeline";
    router.replace(redirect);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Sign in failed";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthLayout title="Sign in" subtitle="Use the email and password you registered with.">
    <form class="space-y-4" novalidate @submit.prevent="submit">
      <div v-if="error" role="alert" class="flex items-start gap-2 rounded-lg border border-incident/40 bg-incident/10 px-3 py-2.5 text-sm text-incident">
        <Icon name="alert" :size="16" class="mt-0.5" /> {{ error }}
      </div>
      <div>
        <label for="email" class="label">Email</label>
        <input id="email" v-model="email" type="email" class="field" autocomplete="email" required autofocus />
      </div>
      <div>
        <label for="password" class="label">Password</label>
        <input id="password" v-model="password" type="password" class="field" autocomplete="current-password" required />
      </div>
      <button type="submit" class="btn-primary h-10 w-full" :disabled="busy || !email || !password">
        {{ busy ? "Signing in…" : "Sign in" }}
      </button>
    </form>
    <p class="mt-6 text-sm text-ink-soft">
      New here?
      <RouterLink to="/register" class="font-semibold text-release underline-offset-2 hover:underline">Create an account</RouterLink>
    </p>
  </AuthLayout>
</template>
