import { relations, sql } from "drizzle-orm";
import * as p from "drizzle-orm/pg-core";

export const eventTypeEnum = p.pgEnum("event_type", ["incident", "release"]);
export const TYPE_INCIDENT = eventTypeEnum.enumValues[0];
export const TYPE_RELEASE = eventTypeEnum.enumValues[1];
export const groupRoleEnum = p.pgEnum("group_role", ["viewer", "editor", "owner"]);
export const ROLE_VIEWER = groupRoleEnum.enumValues[0];
export const ROLE_EDITOR = groupRoleEnum.enumValues[1];
export const ROLE_OWNER = groupRoleEnum.enumValues[2];

export const users = p.pgTable("users", {
    id: p.integer().primaryKey().generatedAlwaysAsIdentity(),
    email: p.text("email").notNull(),
    passwordHash: p.text("password_hash").notNull(),
    displayName: p.text("display_name").notNull(),
    createdAt: p.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [p.uniqueIndex("users_email_unique").on(table.email)],
);

export const groups = p.pgTable("groups", {
  id: p.integer().primaryKey().generatedAlwaysAsIdentity(),
  name: p.text("name").notNull(),
  createdAt: p.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupMembers = p.pgTable("group_members", {
  groupId: p.integer("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  userId: p.integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: groupRoleEnum("role").notNull().default(ROLE_VIEWER),
    createdAt: p.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    p.primaryKey({ columns: [table.groupId, table.userId] }),
    p.index("group_members_user_id_idx").on(table.userId),
  ],
);

export const events = p.pgTable("events", {
    id: p.uuid("id").defaultRandom().primaryKey(),
    type: eventTypeEnum("type").notNull(),
    title: p.text("title").notNull(),
    description: p.text("description"),
    startTime: p.timestamp("start_time", { withTimezone: true }).notNull(),
    // Nullable so point-in-time events (such as releases) don't need an end time.
    endTime: p.timestamp("end_time", { withTimezone: true }),
    tags: p.text("tags").array().notNull().default(sql`'{}'::text[]`),
    createdAt: p.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: p.timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    postedBy: p.integer("posted_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    groupId: p.integer("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => [
    p.index("events_group_start_time_idx").on(table.groupId, table.startTime),
    p.index("events_group_type_start_time_idx").on(table.groupId, table.type, table.startTime),
    p.check(
      "events_end_time_after_start_time_check",
      sql`${table.endTime} IS NULL OR ${table.endTime} >= ${table.startTime}`,
    ),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  groupMemberships: many(groupMembers),
  postedEvents: many(events),
}));

export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(groupMembers),
  events: many(events),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembers.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [groupMembers.userId],
    references: [users.id],
  }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  group: one(groups, {
    fields: [events.groupId],
    references: [groups.id],
  }),
  author: one(users, {
    fields: [events.postedBy],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type NewGroupMember = typeof groupMembers.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
