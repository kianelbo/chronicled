import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { groupMembers, groupRoleEnum, ROLE_VIEWER } from "../db/schema";

const roles = groupRoleEnum.enumValues;
type Role = (typeof roles)[number];
const roleRank: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export async function hasPermission(userId: number, groupId: number, minimumRole: Role = ROLE_VIEWER): Promise<boolean> {
  const [membership] = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, userId), eq(groupMembers.groupId, groupId)))
    .limit(1);

  return !!membership && roleRank[membership.role] >= roleRank[minimumRole];
}

export function parseRole(value: unknown): Role | null {
  return typeof value === "string" && roles.includes(value as Role) ? (value as Role) : null;
}

export function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
