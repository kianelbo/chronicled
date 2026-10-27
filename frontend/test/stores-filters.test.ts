import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { EventInput, Group, LogEvent, Member } from "../src/types";

const apiMocks = vi.hoisted(() => ({
  auth: { login: vi.fn(), register: vi.fn(), me: vi.fn() },
  events: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  groups: {
    list: vi.fn(), create: vi.fn(), rename: vi.fn(), remove: vi.fn(),
    members: vi.fn(), addMember: vi.fn(), setRole: vi.fn(), removeMember: vi.fn(),
  },
}));

vi.mock("../src/api", () => ({
  authApi: apiMocks.auth,
  eventsApi: apiMocks.events,
  groupsApi: apiMocks.groups,
}));

import { useAuthStore } from "../src/stores/auth";
import { useEventsStore } from "../src/stores/events";
import { useGroupsStore } from "../src/stores/groups";
import { useEventFilters } from "../src/composables/useEventFilters";

const user = { id: 1, email: "ada@example.com", displayName: "Ada" };
const groupA: Group = { id: 10, name: "Alpha", createdAt: "2026-01-01", role: "owner" };
const groupB: Group = { id: 20, name: "Beta", createdAt: "2026-01-02", role: "viewer" };

function event(
  overrides: Partial<LogEvent> & Pick<LogEvent, "id" | "type" | "title" | "startTime" | "endTime" | "tags" | "postedBy" | "groupId">,
): LogEvent {
  return {
    description: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    postedByName: null,
    ...overrides,
  };
}

const eventA = event({
  id: "a", type: "incident", title: "Database outage",
  description: "Primary db issue", startTime: "2026-01-10T00:00:00Z",
  endTime: "2026-01-11T00:00:00Z", tags: ["database", "urgent"],
  postedBy: 1, postedByName: "Ada", groupId: 10,
});
const eventB = event({
  id: "b", type: "release", title: "API launch",
  description: "New release", startTime: "2026-01-12T00:00:00Z",
  endTime: null, tags: ["api"], postedBy: 2, postedByName: "Bea", groupId: 20,
});

beforeEach(() => {
  setActivePinia(createPinia());
  for (const group of Object.values(apiMocks)) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
  apiMocks.auth.me.mockResolvedValue({ ...user, username: "Ada" });
});

describe("events store", () => {
  it("loads once by default, supports forced refresh, and exposes parsed timestamps", async () => {
    apiMocks.events.list.mockResolvedValue([eventA]);
    const store = useEventsStore();

    await store.fetch();
    await store.fetch();
    expect(apiMocks.events.list).toHaveBeenCalledOnce();
    expect(store.all[0]).toMatchObject({ id: "a", start: Date.parse(eventA.startTime), end: Date.parse(eventA.endTime!) });

    apiMocks.events.list.mockResolvedValue([eventB]);
    await store.fetch(true);
    expect(apiMocks.events.list).toHaveBeenCalledTimes(2);
    expect(store.items).toEqual([eventB]);
  });

  it("retains and reports fetch failures, and clears loading state", async () => {
    const store = useEventsStore();
    apiMocks.events.list.mockRejectedValueOnce(new Error("offline"));

    await expect(store.fetch()).rejects.toThrow("offline");
    expect(store.error).toBe("offline");
    expect(store.loading).toBe(false);
    expect(store.loaded).toBe(false);
  });

  it("keeps local state in sync with event create, update, remove and reset", async () => {
    const store = useEventsStore();
    store.items = [eventA, eventB];
    const input: EventInput & { groupId: number } = {
      type: "incident", title: "New", description: null,
      startTime: "2026-02-01T00:00:00Z", endTime: null, tags: [], groupId: 10,
    };
    const created = event({ ...input, id: "c", postedBy: 1 });
    apiMocks.events.create.mockResolvedValue(created);
    await store.create(input);
    expect(store.items.map((item) => item.id)).toEqual(["c", "a", "b"]);

    const updated = { ...eventA, title: "Fixed outage" };
    apiMocks.events.update.mockResolvedValue(updated);
    await store.update("a", { title: updated.title });
    expect(store.items.find((item) => item.id === "a")?.title).toBe("Fixed outage");

    apiMocks.events.remove.mockResolvedValue(undefined);
    await store.remove("b");
    expect(store.items.map((item) => item.id)).toEqual(["c", "a"]);
    store.$reset();
    expect(store.items).toEqual([]);
    expect(store.loaded).toBe(false);
  });
});

describe("groups store", () => {
  it("derives permissions and group names by role", () => {
    const store = useGroupsStore();
    store.groups = [groupA, groupB, { ...groupB, id: 30, role: "editor" }];

    expect(store.roleOf(10)).toBe("owner");
    expect(store.canEdit(10)).toBe(true);
    expect(store.canEdit(20)).toBe(false);
    expect(store.canManage(10)).toBe(true);
    expect(store.canManage(30)).toBe(false);
    expect(store.nameOf(999)).toBe("Unknown group");
    expect(store.editable.map((g) => g.id)).toEqual([10, 30]);
  });

  it("sorts create/rename, removes groups and member cache, and updates own role", async () => {
    const store = useGroupsStore();
    store.groups = [groupA, groupB];
    store.members = { 10: [], 20: [] };
    apiMocks.groups.create.mockResolvedValue({ id: 30, name: "Charlie", createdAt: "2026-01-03" });
    await store.create("Charlie");
    expect(store.groups.map((g) => g.name)).toEqual(["Alpha", "Beta", "Charlie"]);
    expect(store.groups.find((g) => g.id === 30)?.role).toBe("owner");

    apiMocks.groups.rename.mockResolvedValue({ id: 20, name: "Aardvark", createdAt: groupB.createdAt });
    await store.rename(20, "Aardvark");
    expect(store.groups.map((g) => g.name)).toEqual(["Aardvark", "Alpha", "Charlie"]);

    apiMocks.groups.remove.mockResolvedValue(undefined);
    await store.remove(10);
    expect(store.groups.some((g) => g.id === 10)).toBe(false);
    expect(store.members[10]).toBeUndefined();
    store.updateOwnRole(20, "owner");
    expect(store.roleOf(20)).toBe("owner");
  });

  it("caches member reads, refreshes after add, and updates/removes membership locally", async () => {
    const store = useGroupsStore();
    const members: Member[] = [
      { id: 1, email: user.email, name: user.displayName, role: "owner", createdAt: "today" },
      { id: 2, email: "bea@example.com", name: "Bea", role: "viewer", createdAt: "today" },
    ];
    apiMocks.groups.members.mockResolvedValue(members);
    expect(await store.loadMembers(10)).toEqual(members);
    await store.loadMembers(10);
    expect(apiMocks.groups.members).toHaveBeenCalledOnce();

    apiMocks.groups.addMember.mockResolvedValue(undefined);
    apiMocks.groups.members.mockResolvedValueOnce([members[0], { ...members[1], role: "editor" }]);
    await store.addMember(10, "bea@example.com", "editor");
    expect(apiMocks.groups.members).toHaveBeenCalledTimes(2);
    expect(store.members[10][1].role).toBe("editor");

    apiMocks.groups.setRole.mockResolvedValue(undefined);
    await store.setRole(10, 2, "owner");
    expect(store.members[10][1].role).toBe("owner");
    apiMocks.groups.removeMember.mockResolvedValue(undefined);
    await store.removeMember(10, 2);
    expect(store.members[10].map((m) => m.id)).toEqual([1]);
  });
});

describe("auth store", () => {
  it("normalizes credentials and persists accepted sessions", async () => {
    const store = useAuthStore();
    apiMocks.auth.login.mockResolvedValue({ user, token: "signed-in" });
    await store.login(" ADA@EXAMPLE.COM ", "secret");
    expect(apiMocks.auth.login).toHaveBeenCalledWith({ email: "ada@example.com", password: "secret" });
    expect(store.isAuthenticated).toBe(true);
    expect(localStorage.getItem("chronicled.token")).toBe("signed-in");

    apiMocks.auth.register.mockResolvedValue({ user, token: "registered" });
    await store.register(" Ada ", " ADA@EXAMPLE.COM ", "secret");
    expect(apiMocks.auth.register).toHaveBeenCalledWith({
      displayName: "Ada", email: "ada@example.com", password: "secret",
    });
    expect(store.token).toBe("registered");
  });

  it("restores a valid session and retains the token after a network failure", async () => {
    const store = useAuthStore();
    store.token = "stored";
    apiMocks.auth.me.mockResolvedValue({ ...user, username: "Ada" });
    await store.restore();
    expect(store.user).toEqual(user);
    expect(store.ready).toBe(true);

    store.ready = false;
    store.user = null;
    apiMocks.auth.me.mockRejectedValueOnce({ status: 0 });
    await store.restore();
    expect(store.token).toBe("stored");
    expect(store.ready).toBe(true);
  });

  it("clears invalid sessions and resets groups and events on logout", async () => {
    const store = useAuthStore();
    const groups = useGroupsStore();
    const events = useEventsStore();
    store.token = "bad";
    store.user = user;
    groups.groups = [groupA];
    events.items = [eventA];
    apiMocks.auth.me.mockRejectedValueOnce(new (await import("../src/api/http")).ApiError("expired", 401));
    await store.restore();
    expect(store.isAuthenticated).toBe(false);
    expect(groups.groups).toEqual([]);
    expect(events.items).toEqual([]);

    store.token = "active";
    store.user = user;
    store.logout();
    expect(store.token).toBeNull();
    expect(localStorage.getItem("chronicled.token")).toBeNull();
  });
});

describe("shared event filters", () => {
  beforeEach(() => {
    useEventFilters().clear();
    const groups = useGroupsStore();
    groups.groups = [groupA, groupB];
    const events = useEventsStore();
    events.items = [eventA, eventB];
  });

  it("applies type, group, author, tags, search, and overlap date filters", () => {
    const filters = useEventFilters();
    expect(filters.counts.value).toEqual({ total: 2, incidents: 1, releases: 1 });

    filters.type.value = "incident";
    filters.groupIds.value = [10];
    filters.author.value = 1;
    filters.tags.value = ["urgent"];
    filters.q.value = "ALPHA";
    filters.setCustom(Date.parse("2026-01-10T12:00:00Z"), Date.parse("2026-01-10T13:00:00Z"));
    expect(filters.filtered.value.map((e) => e.id)).toEqual(["a"]);
    expect(filters.counts.value).toEqual({ total: 1, incidents: 1, releases: 0 });
    expect(filters.activeCount.value).toBe(6);

    filters.setCustom(Date.parse("2026-01-12T00:00:00Z"), null);
    expect(filters.filtered.value).toEqual([]);
  });

  it("builds tag counts and author choices within selected group scope", () => {
    const filters = useEventFilters();
    expect(filters.tagCounts.value).toEqual([["api", 1], ["database", 1], ["urgent", 1]]);
    expect(filters.authors.value).toHaveLength(2);

    filters.groupIds.value = [10];
    expect(filters.tagCounts.value).toEqual([["database", 1], ["urgent", 1]]);
    expect(filters.authors.value).toEqual([{ id: 1, name: "Ada" }]);
    expect(filters.toggle(filters.tags.value, "urgent")).toEqual(["urgent"]);
  });

  it("round-trips filters through URL query and clears invalid filter parameters", () => {
    const filters = useEventFilters();
    filters.type.value = "release";
    filters.groupIds.value = [20, 10];
    filters.tags.value = ["api", "release"];
    filters.author.value = 2;
    filters.q.value = "  launch ";
    const query = filters.toQuery();
    expect(query).toMatchObject({ type: "release", groups: "20,10", tags: "api,release", author: "2", q: "launch" });

    filters.fromQuery({
      type: "incident", groups: "10,0,bad,20", tags: "database,,urgent",
      author: "1", q: "database", from: "2026-01-10", to: "2026-01-11",
    });
    expect(filters.type.value).toBe("incident");
    expect(filters.groupIds.value).toEqual([10, 20]);
    expect(filters.tags.value).toEqual(["database", "urgent"]);
    expect(filters.author.value).toBe(1);
    expect(filters.preset.value).toBe("custom");
    expect(filters.toQuery()).toMatchObject({ from: "2026-01-10", to: "2026-01-11" });

    filters.fromQuery({ type: "unknown", groups: "0,-1", period: "bad" });
    expect(filters.type.value).toBeNull();
    expect(filters.groupIds.value).toEqual([]);
    expect(filters.preset.value).toBe("any");
  });
});
