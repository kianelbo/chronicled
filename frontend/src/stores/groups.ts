import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { groupsApi } from "@/api";
import type { Group, GroupRole, Member } from "@/types";

const rank: Record<GroupRole, number> = { viewer: 1, editor: 2, owner: 3 };
const byName = (a: Group, b: Group) => a.name.localeCompare(b.name);

export const useGroupsStore = defineStore("groups", () => {
  const groups = ref<Group[]>([]);
  const loaded = ref(false);
  const loading = ref(false);
  const members = ref<Record<number, Member[]>>({});

  const byId = computed(() => new Map(groups.value.map((g) => [g.id, g])));
  /** Groups where the user may create events. */
  const editable = computed(() => groups.value.filter((g) => rank[g.role] >= rank.editor));

  const roleOf = (id: number): GroupRole | null => byId.value.get(id)?.role ?? null;
  const canEdit = (id: number) => (roleOf(id) ? rank[roleOf(id)!] >= rank.editor : false);
  const canManage = (id: number) => roleOf(id) === "owner";
  const nameOf = (id: number) => byId.value.get(id)?.name ?? "Unknown group";

  async function fetch(force = false) {
    if ((loaded.value && !force) || loading.value) return;
    loading.value = true;
    try {
      groups.value = await groupsApi.list();
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function create(name: string) {
    const g = await groupsApi.create(name);
    const group: Group = { ...g, role: "owner" };
    groups.value = [...groups.value, group].sort(byName);
    return group;
  }

  async function rename(id: number, name: string) {
    const g = await groupsApi.rename(id, name);
    groups.value = groups.value.map((x) => (x.id === id ? { ...x, name: g.name } : x)).sort(byName);
  }

  async function remove(id: number) {
    await groupsApi.remove(id);
    groups.value = groups.value.filter((g) => g.id !== id);
    delete members.value[id];
  }

  async function loadMembers(id: number, force = false) {
    if (members.value[id] && !force) return members.value[id];
    const list = await groupsApi.members(id);
    members.value = { ...members.value, [id]: list };
    return list;
  }

  async function addMember(id: number, email: string, role: GroupRole) {
    await groupsApi.addMember(id, email, role);
    // The response lacks createdAt/name parity with the list endpoint, so re-read it.
    await loadMembers(id, true);
  }

  async function setRole(id: number, userId: number, role: GroupRole) {
    await groupsApi.setRole(id, userId, role);
    members.value = {
      ...members.value,
      [id]: (members.value[id] ?? []).map((m) => (m.id === userId ? { ...m, role } : m)),
    };
    // Keep the user's own role in sync if they changed themselves.
    return role;
  }

  async function removeMember(id: number, userId: number) {
    await groupsApi.removeMember(id, userId);
    members.value = { ...members.value, [id]: (members.value[id] ?? []).filter((m) => m.id !== userId) };
  }

  function updateOwnRole(id: number, role: GroupRole) {
    groups.value = groups.value.map((g) => (g.id === id ? { ...g, role } : g));
  }

  function $reset() {
    groups.value = [];
    loaded.value = false;
    members.value = {};
  }

  return {
    groups, loaded, loading, members, byId, editable,
    roleOf, canEdit, canManage, nameOf,
    fetch, create, rename, remove, loadMembers, addMember, setRole, removeMember, updateOwnRole, $reset,
  };
});
