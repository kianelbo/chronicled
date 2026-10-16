export type EventType = "incident" | "release";
export type GroupRole = "viewer" | "editor" | "owner";

export const EVENT_TYPES: EventType[] = ["incident", "release"];
export const GROUP_ROLES: GroupRole[] = ["viewer", "editor", "owner"];

export interface User {
  id: number;
  email: string;
  displayName: string;
}

export interface Group {
  id: number;
  name: string;
  createdAt: string;
  role: GroupRole;
}

export interface Member {
  id: number;
  email: string;
  name: string;
  role: GroupRole;
  createdAt: string;
}

export interface LogEvent {
  id: string;
  type: EventType;
  title: string;
  description: string | null;
  startTime: string; // ISO
  endTime: string | null; // ISO, null = point in time
  tags: string[];
  createdAt: string;
  updatedAt: string;
  postedBy: number;
  groupId: number;
  postedByName: string | null;
}

export interface EventInput {
  type: EventType;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string | null;
  tags: string[];
}

/** An event with its times parsed once, so views never re-parse strings. */
export interface TimedEvent extends LogEvent {
  start: number; // ms
  end: number | null; // ms
}
