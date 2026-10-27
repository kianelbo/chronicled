import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import express from "express";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import * as schema from "../src/db/schema.js";
import authRoutes from "../src/routes/auth.js";
import eventRoutes from "../src/routes/events.js";
import groupRoutes from "../src/routes/groups.js";

const dbMock = vi.hoisted(() => ({ instance: null as unknown }));
const bcryptMocks = vi.hoisted(() => ({
  hash: vi.fn(async () => "hashed-password"),
  compare: vi.fn(async () => true),
}));

vi.mock("../src/db/client", () => ({
  get db() {
    return dbMock.instance;
  },
}));
vi.mock("bcrypt", () => ({ default: bcryptMocks }));

const JWT_SECRET = "backend-tests-secret";
const database = new PGlite();
const db = drizzle(database, { schema });
const users = schema.users;
const groups = schema.groups;
const groupMembers = schema.groupMembers;
const events = schema.events;

let server: ReturnType<ReturnType<typeof express>["listen"]>;
let baseUrl: string;

function token(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET);
}

async function request(path: string, options: RequestInit = {}, userId?: number) {
  const headers = new Headers(options.headers);
  if (userId !== undefined) headers.set("Authorization", `Bearer ${token(userId)}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const body = response.status === 204 ? undefined : await response.json();
  return { response, body };
}

function json(method: string, value: unknown): RequestInit {
  return { method, body: JSON.stringify(value) };
}

async function seedUser(email = "ada@example.com", displayName = "Ada") {
  const [user] = await db.insert(users)
    .values({ email, displayName, passwordHash: "hashed-password" })
    .returning();
  return user;
}

async function seedGroup(ownerId: number, name = "Team") {
  const [group] = await db.insert(groups).values({ name }).returning();
  await db.insert(groupMembers).values({ groupId: group.id, userId: ownerId, role: "owner" });
  return group;
}

async function seedEvent(groupId: number, postedBy: number, title = "Outage", tags = ["production"]) {
  const [event] = await db.insert(events).values({
    type: "incident",
    title,
    description: "Details",
    startTime: new Date("2026-01-02T03:04:05.000Z"),
    endTime: new Date("2026-01-02T04:04:05.000Z"),
    tags,
    groupId,
    postedBy,
  }).returning();
  return event;
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  dbMock.instance = db;
  await database.exec(`
    CREATE TYPE event_type AS ENUM ('incident', 'release');
    CREATE TYPE group_role AS ENUM ('viewer', 'editor', 'owner');
    CREATE TABLE users (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      display_name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE groups (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE group_members (
      group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role group_role NOT NULL DEFAULT 'viewer',
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (group_id, user_id)
    );
    CREATE TABLE events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      type event_type NOT NULL,
      title text NOT NULL,
      description text,
      start_time timestamptz NOT NULL,
      end_time timestamptz,
      tags text[] NOT NULL DEFAULT ARRAY[]::text[],
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      posted_by integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      group_id integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      CHECK (end_time IS NULL OR end_time >= start_time)
    );
  `);

  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use("/api/events", eventRoutes);
  app.use("/api/groups", groupRoutes);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await database.close();
});

beforeEach(async () => {
  await database.exec("TRUNCATE events, group_members, groups, users RESTART IDENTITY CASCADE");
  bcryptMocks.hash.mockClear();
  bcryptMocks.compare.mockReset().mockResolvedValue(true);
});

describe("authentication", () => {
  it("rejects missing, malformed, invalid, and non-positive-user tokens", async () => {
    expect((await request("/api/groups")).response.status).toBe(401);
    for (const authorization of ["Basic abc", "Bearer", "Bearer invalid.token.value"]) {
      expect((await fetch(`${baseUrl}/api/groups`, { headers: { Authorization: authorization } })).status).toBe(401);
    }

    const invalidId = await fetch(`${baseUrl}/api/groups`, {
      headers: { Authorization: `Bearer ${jwt.sign({ userId: 0 }, JWT_SECRET)}` },
    });
    expect(invalidId.status).toBe(401);
  });

  it("registers credentials in the database, rejects duplicates, and authenticates login", async () => {
    expect((await request("/api/auth/register", json("POST", { email: "ada@example.com" }))).response.status).toBe(400);

    const registered = await request("/api/auth/register", json("POST", {
      email: "ada@example.com",
      displayName: "Ada",
      password: "pass",
    }));
    expect(registered.response.status).toBe(201);
    expect(jwt.verify(registered.body.token, JWT_SECRET)).toMatchObject({ userId: registered.body.user.id });
    expect(await db.select({ id: users.id, email: users.email, displayName: users.displayName, passwordHash: users.passwordHash }).from(users))
      .toEqual([{ id: registered.body.user.id, email: "ada@example.com", displayName: "Ada", passwordHash: "hashed-password" }]);
    expect(bcryptMocks.hash).toHaveBeenCalledWith("pass", 10);

    expect((await request("/api/auth/register", json("POST", {
      email: "ada@example.com", displayName: "Duplicate", password: "pass",
    }))).response.status).toBe(409);

    expect((await request("/api/auth/login", json("POST", {}))).response.status).toBe(400);
    expect((await request("/api/auth/login", json("POST", { email: "missing@example.com", password: "pass" }))).response.status).toBe(401);

    bcryptMocks.compare.mockResolvedValueOnce(false);
    expect((await request("/api/auth/login", json("POST", { email: "ada@example.com", password: "wrong" }))).response.status).toBe(401);

    const login = await request("/api/auth/login", json("POST", { email: "ada@example.com", password: "pass" }));
    expect(login.response.status).toBe(200);
    expect(login.body.user).toMatchObject({ email: "ada@example.com", displayName: "Ada" });
    expect(jwt.verify(login.body.token, JWT_SECRET)).toMatchObject({ userId: registered.body.user.id });

    const me = await request("/api/auth/me", {}, registered.body.user.id);
    expect(me.body).toEqual({ id: registered.body.user.id, email: "ada@example.com", displayName: "Ada", username: "Ada" });
    expect((await request("/api/auth/me", {}, 999)).response.status).toBe(404);
  });
});

describe("group and membership persistence", () => {
  it("creates a group and owner membership, then lists its persisted state", async () => {
    const owner = await seedUser();
    expect((await request("/api/groups", json("POST", { name: "  " }), owner.id)).response.status).toBe(400);

    const created = await request("/api/groups", json("POST", { name: " Team " }), owner.id);
    expect(created.response.status).toBe(201);
    const [persistedGroup] = await db.select().from(groups);
    const [persistedMember] = await db.select().from(groupMembers);
    expect(persistedGroup).toMatchObject({ id: created.body.group.id, name: "Team" });
    expect(persistedMember).toMatchObject({ groupId: persistedGroup.id, userId: owner.id, role: "owner" });

    const listed = await request("/api/groups", {}, owner.id);
    expect(listed.body.groups).toHaveLength(1);
    expect(listed.body.groups[0]).toMatchObject({ id: persistedGroup.id, name: "Team", role: "owner" });
  });

  it("persists group renames and enforces owner-only rename/delete", async () => {
    const owner = await seedUser();
    const viewer = await seedUser("bea@example.com", "Bea");
    const group = await seedGroup(owner.id);
    await db.insert(groupMembers).values({ groupId: group.id, userId: viewer.id, role: "viewer" });
    await seedEvent(group.id, owner.id);

    expect((await request(`/api/groups/${group.id}`, json("PATCH", { name: "Changed" }), viewer.id)).response.status).toBe(403);
    expect((await request(`/api/groups/0`, json("PATCH", { name: "Changed" }), owner.id)).response.status).toBe(400);
    expect((await request(`/api/groups/${group.id}`, json("PATCH", { name: " " }), owner.id)).response.status).toBe(400);

    const renamed = await request(`/api/groups/${group.id}`, json("PATCH", { name: " Changed " }), owner.id);
    expect(renamed.response.status).toBe(200);
    expect((await db.select({ name: groups.name }).from(groups).where(eq(groups.id, group.id)))[0].name).toBe("Changed");

    expect((await request(`/api/groups/${group.id}`, { method: "DELETE" }, viewer.id)).response.status).toBe(403);
    const deleted = await request(`/api/groups/${group.id}`, { method: "DELETE" }, owner.id);
    expect(deleted.response.status).toBe(204);
    expect(await db.select().from(groups)).toEqual([]);
    expect(await db.select().from(groupMembers)).toEqual([]);
    expect(await db.select().from(events)).toEqual([]);
  });

  it("adds/upserts, changes, and deletes member rows; protects the last owner", async () => {
    const owner = await seedUser();
    const memberUser = await seedUser("bea@example.com", "Bea");
    const group = await seedGroup(owner.id);

    expect((await request(`/api/groups/${group.id}/members`, {}, owner.id)).body.members)
      .toMatchObject([{ id: owner.id, email: owner.email, role: "owner" }]);
    expect((await request(`/api/groups/${group.id}/members`, json("POST", { email: "bad", role: "viewer" }), owner.id)).response.status).toBe(400);
    expect((await request(`/api/groups/${group.id}/members`, json("POST", { email: "none@example.com", role: "viewer" }), owner.id)).response.status).toBe(404);

    const add = await request(`/api/groups/${group.id}/members`, json("POST", {
      email: " BEA@example.com ", role: "editor",
    }), owner.id);
    expect(add.response.status).toBe(201);
    expect(await db.select().from(groupMembers)).toHaveLength(2);
    expect((await db.select().from(groupMembers).where(eq(groupMembers.userId, memberUser.id)))[0].role).toBe("editor");

    const upsert = await request(`/api/groups/${group.id}/members`, json("POST", {
      email: "bea@example.com", role: "viewer",
    }), owner.id);
    expect(upsert.response.status).toBe(201);
    expect(await db.select().from(groupMembers)).toHaveLength(2);
    expect((await db.select().from(groupMembers).where(eq(groupMembers.userId, memberUser.id)))[0].role).toBe("viewer");

    const changed = await request(`/api/groups/${group.id}/members/${memberUser.id}`, json("PATCH", { role: "editor" }), owner.id);
    expect(changed.response.status).toBe(200);
    expect((await db.select().from(groupMembers).where(eq(groupMembers.userId, memberUser.id)))[0].role).toBe("editor");

    expect((await request(`/api/groups/${group.id}/members/${owner.id}`, json("PATCH", { role: "viewer" }), owner.id)).response.status).toBe(400);
    const removed = await request(`/api/groups/${group.id}/members/${memberUser.id}`, { method: "DELETE" }, owner.id);
    expect(removed.response.status).toBe(204);
    expect(await db.select().from(groupMembers).where(eq(groupMembers.userId, memberUser.id))).toEqual([]);
    expect((await request(`/api/groups/${group.id}/members/${owner.id}`, { method: "DELETE" }, owner.id)).response.status).toBe(400);
  });
});

describe("event persistence and access", () => {
  const validEvent = {
    type: "incident",
    title: " Outage ",
    description: "Details",
    startTime: "2026-01-02T03:04:05.000Z",
    endTime: "2026-01-02T04:04:05.000Z",
    tags: [" production "],
    groupId: 1,
  };

  it("creates events with normalized fields and rejects invalid input or insufficient roles", async () => {
    const owner = await seedUser();
    const viewer = await seedUser("bea@example.com", "Bea");
    const group = await seedGroup(owner.id);
    await db.insert(groupMembers).values({ groupId: group.id, userId: viewer.id, role: "viewer" });

    expect((await request("/api/events", json("POST", { ...validEvent, type: "other", groupId: group.id }), owner.id)).response.status).toBe(400);
    expect((await request("/api/events", json("POST", { ...validEvent, title: " ", groupId: group.id }), owner.id)).response.status).toBe(400);
    expect((await request("/api/events", json("POST", {
      ...validEvent,
      groupId: group.id,
      startTime: "2026-01-03T00:00:00Z",
      endTime: "2026-01-02T00:00:00Z",
    }), owner.id)).response.status).toBe(400);
    expect(await db.select().from(events)).toEqual([]);
    expect((await request("/api/events", json("POST", { ...validEvent, groupId: group.id }), viewer.id)).response.status).toBe(403);

    const created = await request("/api/events", json("POST", { ...validEvent, groupId: group.id }), owner.id);
    expect(created.response.status).toBe(201);
    expect(created.body.event).toMatchObject({
      type: "incident",
      title: "Outage",
      description: "Details",
      tags: ["production"],
      groupId: group.id,
      postedBy: owner.id,
      postedByName: owner.displayName,
    });
    const [saved] = await db.select().from(events);
    expect(saved).toMatchObject({
      id: created.body.event.id,
      title: "Outage",
      tags: ["production"],
      groupId: group.id,
      postedBy: owner.id,
    });
  });

  it("filters persisted events and restricts reads to group members", async () => {
    const owner = await seedUser();
    const stranger = await seedUser("stranger@example.com", "Sam");
    const group = await seedGroup(owner.id);
    const matching = await seedEvent(group.id, owner.id, "Production outage");
    await seedEvent(group.id, owner.id, "Release", ["internal"]);
    const noAccessGroup = await seedGroup(stranger.id, "Private");
    await seedEvent(noAccessGroup.id, stranger.id, "Private event");

    expect((await request("/api/events?from=invalid", {}, owner.id)).response.status).toBe(400);
    expect((await request("/api/events?from=2026-02-01&to=2026-01-01", {}, owner.id)).response.status).toBe(400);
    expect((await request("/api/events?type=other", {}, owner.id)).response.status).toBe(400);
    expect((await request("/api/events?tag=%20", {}, owner.id)).response.status).toBe(400);
    expect((await request("/api/events?groupId=0", {}, owner.id)).response.status).toBe(400);

    const result = await request(`/api/events?groupId=${group.id}&type=incident&tag=production`, {}, owner.id);
    expect(result.response.status).toBe(200);
    expect(result.body.events.map((event: { id: string }) => event.id)).toEqual([matching.id]);
    expect((await request(`/api/events?groupId=${noAccessGroup.id}`, {}, owner.id)).response.status).toBe(403);

    expect((await request(`/api/events/${matching.id}`, {}, stranger.id)).response.status).toBe(403);
    expect((await request("/api/events/00000000-0000-0000-0000-000000000000", {}, owner.id)).response.status).toBe(404);
    expect((await request(`/api/events/${matching.id}`, {}, owner.id)).body.event.id).toBe(matching.id);
  });

  it("updates and deletes persisted events; rejects unauthorized and invalid changes", async () => {
    const owner = await seedUser();
    const editor = await seedUser("bea@example.com", "Bea");
    const viewer = await seedUser("sam@example.com", "Sam");
    const group = await seedGroup(owner.id);
    await db.insert(groupMembers).values([
      { groupId: group.id, userId: editor.id, role: "editor" },
      { groupId: group.id, userId: viewer.id, role: "viewer" },
    ]);
    const event = await seedEvent(group.id, owner.id);

    expect((await request(`/api/events/${event.id}`, json("PATCH", { title: "New" }), viewer.id)).response.status).toBe(403);
    expect((await request(`/api/events/${event.id}`, json("PATCH", {}), editor.id)).response.status).toBe(400);
    expect((await request(`/api/events/${event.id}`, json("PATCH", { endTime: "2020-01-01T00:00:00Z" }), editor.id)).response.status).toBe(400);
    expect((await db.select().from(events).where(eq(events.id, event.id)))[0].title).toBe("Outage");

    const updated = await request(`/api/events/${event.id}`, json("PATCH", { title: " New title ", tags: [" changed "] }), editor.id);
    expect(updated.response.status).toBe(200);
    const [saved] = await db.select().from(events).where(eq(events.id, event.id));
    expect(saved.title).toBe("New title");
    expect(saved.tags).toEqual(["changed"]);
    expect(saved.updatedAt.getTime()).toBeGreaterThan(event.updatedAt.getTime());

    expect((await request(`/api/events/${event.id}`, { method: "DELETE" }, viewer.id)).response.status).toBe(403);
    expect(await db.select().from(events)).toHaveLength(1);
    expect((await request("/api/events/00000000-0000-0000-0000-000000000000", { method: "DELETE" }, editor.id)).response.status).toBe(404);

    const deleted = await request(`/api/events/${event.id}`, { method: "DELETE" }, editor.id);
    expect(deleted.response.status).toBe(204);
    expect(await db.select().from(events).where(eq(events.id, event.id))).toEqual([]);
  });
});

describe("role and id parsing", () => {
  it("accepts only defined roles and positive safe integer ids", async () => {
    const { parseId, parseRole } = await import("../src/services/roles.js");
    expect(parseRole("viewer")).toBe("viewer");
    expect(parseRole("editor")).toBe("editor");
    expect(parseRole("owner")).toBe("owner");
    expect(parseRole("admin")).toBeNull();
    expect(parseRole(null)).toBeNull();
    expect(parseId("1")).toBe(1);
    for (const value of ["0", "-1", "1.5", "nope", "9007199254740992"]) {
      expect(parseId(value)).toBeNull();
    }
  });
});
