<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import AuthLayout from "@/components/AuthLayout.vue";
import Icon from "@/components/ui/Icon.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();

const displayName = ref("");
const email = ref("");
const password = ref("");
const error = ref("");
const busy = ref(false);

const emailOk = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()));
const passwordOk = computed(() => password.value.length >= 8);
const valid = computed(() => displayName.value.trim().length > 0 && emailOk.value && passwordOk.value);

async function submit() {
  error.value = "";
  busy.value = true;
  try {
    await auth.register(displayName.value, email.value, password.value);
    router.replace("/groups");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Registration failed";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthLayout title="Create your account" subtitle="Then create a group or ask to be added to one.">
    <form class="space-y-4" novalidate @submit.prevent="valid && submit()">
      <div v-if="error" role="alert" class="flex items-start gap-2 rounded-lg border border-incident/40 bg-incident/10 px-3 py-2.5 text-sm text-incident">
        <Icon name="alert" :size="16" class="mt-0.5" /> {{ error }}
      </div>
      <div>
        <label for="name" class="label">Name</label>
        <input id="name" v-model="displayName" class="field" autocomplete="name" required autofocus />
      </div>
      <div>
        <label for="email" class="label">Email</label>
        <input id="email" v-model="email" type="email" class="field" autocomplete="email" required />
        <p v-if="email && !emailOk" class="error-text">Enter a valid email address.</p>
      </div>
      <div>
        <label for="password" class="label">Password</label>
        <input id="password" v-model="password" type="password" class="field" autocomplete="new-password" required />
        <p class="hint" :class="password && !passwordOk ? '!text-incident' : ''">At least 8 characters.</p>
      </div>
      <button type="submit" class="btn-primary h-10 w-full" :disabled="busy || !valid">
        {{ busy ? "Creating account…" : "Create account" }}
      </button>
    </form>
    <p class="mt-6 text-sm text-ink-soft">
      Already registered?
      <RouterLink to="/login" class="font-semibold text-release underline-offset-2 hover:underline">Sign in</RouterLink>
    </p>
  </AuthLayout>
</template>
