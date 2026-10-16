import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";

declare module "vue-router" {
  interface RouteMeta {
    guest?: boolean;
    title?: string;
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: () => import("@/views/LoginView.vue"), meta: { guest: true, title: "Sign in" } },
    { path: "/register", name: "register", component: () => import("@/views/RegisterView.vue"), meta: { guest: true, title: "Create account" } },
    {
      path: "/",
      component: () => import("@/components/AppShell.vue"),
      children: [
        { path: "", redirect: { name: "timeline" } },
        {
          path: "",
          component: () => import("@/views/EventsLayout.vue"),
          children: [
            { path: "timeline", name: "timeline", component: () => import("@/views/TimelineView.vue"), meta: { title: "Timeline" } },
            { path: "log", name: "log", component: () => import("@/views/LogView.vue"), meta: { title: "Log" } },
          ],
        },
        { path: "groups", name: "groups", component: () => import("@/views/GroupsView.vue"), meta: { title: "Groups" } },
        { path: "groups/:id", name: "group", component: () => import("@/views/GroupDetailView.vue"), meta: { title: "Group" }, props: true },
        { path: "people", name: "people", component: () => import("@/views/PeopleView.vue"), meta: { title: "People" } },
        { path: "account", name: "account", component: () => import("@/views/AccountView.vue"), meta: { title: "Account" } },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: { name: "timeline" } },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.ready) await auth.restore();
  if (to.meta.guest) return auth.isAuthenticated ? { name: "timeline" } : true;
  if (!auth.isAuthenticated) return { name: "login", query: to.fullPath !== "/" ? { redirect: to.fullPath } : undefined };
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Chronicled` : "Chronicled";
});

export default router;
