import type { EventInput, Group, GroupRole, LogEvent, Member, User } from "@/types";
import { request } from "./http";

interface AuthResponse {
  user: User;
  token: string;
}

export const authApi = {
  register: (body: { email: string; displayName: string; password: string }) =>
    request<AuthResponse>("/auth/register", { method: "POST", body, public: true }),
  login: (body: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", { method: "POST", body, public: true }),
  me: () => request<User & { username: string }>("/auth/me"),
};

export const groupsApi = {
  list: () => request<{ groups: Group[] }>("/groups").then((r) => r.groups),
  create: (name: string) =>
    request<{ group: Omit<Group, "role"> }>("/groups", { method: "POST", body: { name } }).then((r) => r.group),
  rename: (id: number, name: string) =>
    request<{ group: Omit<Group, "role"> }>(`/groups/${id}`, { method: "PATCH", body: { name } }).then((r) => r.group),
  remove: (id: number) => request<void>(`/groups/${id}`, { method: "DELETE" }),

  members: (id: number) => request<{ members: Member[] }>(`/groups/${id}/members`).then((r) => r.members),
  addMember: (id: number, email: string, role: GroupRole) =>
    request<{ member: { role: GroupRole; userId: number; user: { id: number; email: string; name: string } } }>(
      `/groups/${id}/members`,
      { method: "POST", body: { email, role } },
    ).then((r) => r.member),
  setRole: (id: number, userId: number, role: GroupRole) =>
    request<{ member: { role: GroupRole } }>(`/groups/${id}/members/${userId}`, { method: "PATCH", body: { role } }),
  removeMember: (id: number, userId: number) => request<void>(`/groups/${id}/members/${userId}`, { method: "DELETE" }),
};

export const eventsApi = {
  /** One call for everything the user can see; all filtering happens client-side. */
  list: () => request<{ events: LogEvent[] }>("/events").then((r) => r.events),
  create: (input: EventInput & { groupId: number }) =>
    request<{ event: LogEvent }>("/events", { method: "POST", body: input }).then((r) => r.event),
  update: (id: string, input: Partial<EventInput>) =>
    request<{ event: LogEvent }>(`/events/${id}`, { method: "PATCH", body: input }).then((r) => r.event),
  remove: (id: string) => request<void>(`/events/${id}`, { method: "DELETE" }),
};
