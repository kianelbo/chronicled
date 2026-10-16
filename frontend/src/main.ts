import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import { onUnauthorized } from "./api/http";
import { useAuthStore } from "./stores/auth";
import { useToastStore } from "./stores/toast";
import "./style.css";

const app = createApp(App);
app.use(createPinia());

// An expired or revoked token: sign out and go to the login page.
onUnauthorized(() => {
  const auth = useAuthStore();
  if (!auth.token) return;
  auth.logout();
  useToastStore().info("Your session expired. Sign in again to continue.");
  router.replace({ name: "login", query: { redirect: router.currentRoute.value.fullPath } });
});

app.use(router);
app.mount("#app");
