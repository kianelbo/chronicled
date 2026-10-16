<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { fmtDate } from "@/lib/time";
import { ApiError } from "@/api/http";
import { useAuthStore } from "@/stores/auth";
import { useEventsStore } from "@/stores/events";
import { useGroupsStore } from "@/stores/groups";
import { useToastStore } from "@/stores/toast";
import { GROUP_ROLES, type GroupRole, type Member } from "@/types";
import Avatar from "@/components/ui/Avatar.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import GroupFormModal from "@/components/groups/GroupFormModal.vue";
import Icon from "@/components/ui/Icon.vue";
import RoleBadge from "@/components/ui/RoleBadge.vue";

const props = defineProps<{ id: string }>();

const router = useRouter();
const auth = useAuthStore();
const groups = useGroupsStore();
const events = useEventsStore();
const toast = useToastStore();

const groupId = computed(() => Number(props.id));
const group = computed(() => groups.byId.get(groupId.value) ?? null);
const members = computed(() => groups.members[groupId.value] ?? []);
const isOwner = computed(() => group.value?.role === "owner");
const ownerCount = computed(() => members.value.filter((m) => m.role === "owner").length);
const eventCount = computed(() => events.items.filter((e) => e.groupId === groupId.value).length);

const loadError = ref("");
const loading = ref(true);

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    await groups.fetch();
    if (group.value) await groups.loadMembers(groupId.value, true);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : "Couldn't load this group";
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(groupId, load);

const roleInfo: Record<GroupRole, string> = {
  viewer: "Can read every event in the group.",
  editor: "Can also create, edit and delete events.",
  owner: "Can also manage members and their access.",
};

// ───────── add member ─────────
const email = ref("");
const newRole = ref<GroupRole>("viewer");
const adding = ref(false);
const addError = ref("");
const emailOk = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()));
const existing = computed(() => members.value.find((m) => m.email.toLowerCase() === email.value.trim().toLowerCase()));

async function addMember() {
  if (!emailOk.value || existing.value) return;
  adding.value = true;
  addError.value = "";
  try {
    await groups.addMember(groupId.value, email.value.trim().toLowerCase(), newRole.value);
    toast.success("Member added");
    email.value = "";
    newRole.value = "viewer";
  } catch (e) {
    addError.value =
      e instanceof ApiError && e.status === 404
        ? "No account uses that email. Ask them to register first, then add them."
        : e instanceof Error ? e.message : "Couldn't add the member";
  } finally {
    adding.value = false;
  }
}

// ───────── change role ─────────
const savingRole = ref<number | null>(null);
const demoteSelf = ref<{ member: Member; role: GroupRole } | null>(null);

function isLastOwner(m: Member) {
  return m.role === "owner" && ownerCount.value <= 1;
}
async function changeRole(m: Member, role: GroupRole) {
  if (role === m.role) return;
  if (m.id === auth.user?.id && role !== "owner") {
    demoteSelf.value = { member: m, role };
    return;
  }
  await applyRole(m, role);
}
async function applyRole(m: Member, role: GroupRole) {
  savingRole.value = m.id;
  try {
    await groups.setRole(groupId.value, m.id, role);
    if (m.id === auth.user?.id) groups.updateOwnRole(groupId.value, role);
    toast.success(`${m.name} is now ${role === "owner" ? "an" : "a"} ${role}`);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't change the role");
  } finally {
    savingRole.value = null;
    demoteSelf.value = null;
  }
}

// ───────── remove member ─────────
const removing = ref<Member | null>(null);
const removeBusy = ref(false);
async function confirmRemove() {
  if (!removing.value) return;
  removeBusy.value = true;
  try {
    await groups.removeMember(groupId.value, removing.value.id);
    toast.success(`${removing.value.name} was removed`);
    removing.value = null;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't remove the member");
  } finally {
    removeBusy.value = false;
  }
}

// ───────── rename / delete ─────────
const renaming = ref(false);
const deleting = ref(false);
const deleteBusy = ref(false);
async function confirmDelete() {
  deleteBusy.value = true;
  try {
    await groups.remove(groupId.value);
    await events.fetch(true);
    toast.success("Group deleted");
    router.replace({ name: "groups" });
  } catch (e) {
    toast.error(e instanceof ApiError && e.status === 404 ? "The server doesn't support deleting groups yet." : e instanceof Error ? e.message : "Couldn't delete the group");
  } finally {
    deleteBusy.value = false;
    deleting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <RouterLink to="/groups" class="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
      <Icon name="arrow-left" :size="15" /> All groups
    </RouterLink>

    <div v-if="loading && !group" class="panel grid h-40 place-items-center text-sm text-muted">Loading group…</div>

    <div v-else-if="loadError || !group" class="panel px-6 py-12 text-center">
      <h2 class="text-lg font-bold">{{ loadError ? "Couldn't load this group" : "Group not found" }}</h2>
      <p class="mx-auto mt-1.5 max-w-sm text-sm text-ink-soft">
        {{ loadError || "It may have been removed, or you may not be a member." }}
      </p>
      <RouterLink to="/groups" class="btn-secondary mt-5">Back to groups</RouterLink>
    </div>

    <template v-else>
      <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="break-words text-2xl font-extrabold tracking-tight">{{ group.name }}</h1>
            <RoleBadge :role="group.role" />
          </div>
          <p class="mt-1 text-sm text-ink-soft">
            {{ members.length }} {{ members.length === 1 ? "member" : "members" }} · {{ eventCount }} {{ eventCount === 1 ? "event" : "events" }} · created {{ fmtDate(Date.parse(group.createdAt)) }}
          </p>
        </div>
        <RouterLink :to="{ name: 'timeline', query: { groups: String(group.id) } }" class="btn-secondary"><Icon name="calendar" :size="16" /> View timeline</RouterLink>
      </div>

      <!-- members -->
      <section class="panel overflow-hidden" aria-labelledby="members-h">
        <div class="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
          <h2 id="members-h" class="text-[15px] font-bold">Members</h2>
          <p v-if="!isOwner" class="text-xs text-muted">Only owners can change members.</p>
        </div>

        <ul class="divide-y divide-line">
          <li v-for="m in members" :key="m.id" class="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <Avatar :name="m.name" :size="36" />
            <div class="min-w-0 flex-1 basis-40">
              <p class="truncate text-sm font-bold">
                {{ m.name }}<span v-if="m.id === auth.user?.id" class="ml-1.5 text-xs font-medium text-muted">(you)</span>
              </p>
              <p class="truncate text-[13px] text-muted">{{ m.email }}</p>
            </div>

            <template v-if="isOwner">
              <label class="sr-only" :for="`role-${m.id}`">Access level for {{ m.name }}</label>
              <select
                :id="`role-${m.id}`"
                class="field !h-9 !w-32 !py-0 capitalize"
                :value="m.role"
                :disabled="savingRole === m.id || isLastOwner(m)"
                :title="isLastOwner(m) ? 'A group needs at least one owner. Make someone else an owner first.' : undefined"
                @change="changeRole(m, ($event.target as HTMLSelectElement).value as GroupRole)"
              >
                <option v-for="r in GROUP_ROLES" :key="r" :value="r">{{ r }}</option>
              </select>
              <button
                class="btn-icon hover:!text-incident"
                :aria-label="`Remove ${m.name}`"
                :disabled="m.id === auth.user?.id"
                :title="m.id === auth.user?.id ? 'You can\'t remove yourself' : 'Remove from group'"
                @click="removing = m"
              >
                <Icon name="trash" :size="17" />
              </button>
            </template>
            <RoleBadge v-else :role="m.role" />
          </li>
        </ul>

        <!-- add -->
        <form v-if="isOwner" class="border-t border-line bg-paper/60 px-4 py-4 sm:px-5" novalidate @submit.prevent="addMember">
          <h3 class="mb-2.5 text-[13px] font-bold">Add a member</h3>
          <div class="flex flex-wrap items-start gap-2">
            <div class="min-w-52 flex-1">
              <label for="m-email" class="sr-only">Email address</label>
              <input id="m-email" v-model="email" type="email" class="field" placeholder="teammate@company.com" autocomplete="off" @input="addError = ''" />
            </div>
            <div>
              <label for="m-role" class="sr-only">Access level</label>
              <select id="m-role" v-model="newRole" class="field !w-32 capitalize">
                <option v-for="r in GROUP_ROLES" :key="r" :value="r">{{ r }}</option>
              </select>
            </div>
            <button type="submit" class="btn-primary h-10" :disabled="adding || !emailOk || !!existing">{{ adding ? "Adding…" : "Add member" }}</button>
          </div>
          <p v-if="existing" class="error-text">{{ existing.name }} is already in this group. Change their access in the list above.</p>
          <p v-else-if="addError" class="error-text" role="alert">{{ addError }}</p>
          <p v-else class="hint">They need an account already. <span class="capitalize">{{ newRole }}</span>: {{ roleInfo[newRole].charAt(0).toLowerCase() + roleInfo[newRole].slice(1) }}</p>
        </form>
      </section>

      <!-- access levels -->
      <section class="mt-6">
        <h2 class="mb-2 text-[15px] font-bold">Access levels</h2>
        <dl class="panel divide-y divide-line text-sm">
          <div v-for="r in GROUP_ROLES" :key="r" class="flex items-center gap-3 px-4 py-2.5 sm:px-5">
            <dt class="w-20"><RoleBadge :role="r" /></dt>
            <dd class="text-ink-soft">{{ roleInfo[r] }}</dd>
          </div>
        </dl>
      </section>

      <!-- danger zone -->
      <section v-if="isOwner" class="mt-6">
        <h2 class="mb-2 text-[15px] font-bold">Group settings</h2>
        <div class="panel flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
          <button class="btn-secondary" @click="renaming = true"><Icon name="pencil" :size="15" /> Rename group</button>
          <button class="btn-secondary text-incident" @click="deleting = true"><Icon name="trash" :size="15" /> Delete group</button>
          <p class="basis-full text-xs text-muted">Deleting a group also deletes all of its events.</p>
        </div>
      </section>
    </template>

    <GroupFormModal :open="renaming" :group="group" @close="renaming = false" @saved="renaming = false" />

    <ConfirmDialog
      :open="!!removing"
      title="Remove this member?"
      :message="removing ? `${removing.name} will lose access to ${group?.name} and its events right away.` : ''"
      confirm-label="Remove member"
      :busy="removeBusy"
      @confirm="confirmRemove"
      @cancel="removing = null"
    />
    <ConfirmDialog
      :open="!!demoteSelf"
      title="Lower your own access?"
      :message="demoteSelf ? `You'll become ${demoteSelf.role === 'editor' ? 'an' : 'a'} ${demoteSelf.role} and won't be able to manage members unless another owner restores it.` : ''"
      confirm-label="Lower my access"
      @confirm="demoteSelf && applyRole(demoteSelf.member, demoteSelf.role)"
      @cancel="demoteSelf = null"
    />
    <ConfirmDialog
      :open="deleting"
      title="Delete this group?"
      :message="`“${group?.name}” and all of its ${eventCount} event(s) will be deleted for everyone. This can't be undone.`"
      confirm-label="Delete group"
      :busy="deleteBusy"
      @confirm="confirmDelete"
      @cancel="deleting = false"
    />
  </div>
</template>
