import { and, asc, count, eq } from "drizzle-orm";
import { Response, Router } from "express";
import { db } from "../db/client";
import { groupMembers, groups, ROLE_OWNER, ROLE_VIEWER, users } from "../db/schema";
import { authenticate, AuthRequest } from "../middleware/auth";
import { hasPermission, parseId, parseRole } from "../services/roles";

const router = Router();
router.use(authenticate);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Get all the groups in which the user is a member
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const result = await db
      .select({ id: groups.id, name: groups.name, createdAt: groups.createdAt, role: groupMembers.role })
      .from(groups)
      .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
      .where(eq(groupMembers.userId, req.userId!))
      .orderBy(asc(groups.name));
    res.json({ groups: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

// Creates a group with the user as a member
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (name < 1 || name.length > 32) {
      return res.status(400).json({ error: "Name must be between 1 and 32 characters" });
    }

    const group = await db.transaction(async (tx) => {
      const [createdGroup] = await tx
        .insert(groups)
        .values({ name: name })
        .returning({ id: groups.id, name: groups.name, createdAt: groups.createdAt });
      await tx.insert(groupMembers).values({ groupId: createdGroup.id, userId: req.userId!, role: "owner" });
      return createdGroup;
    });

    res.status(201).json({ group });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create group" });
  }
});

// Rename a group (owners only)
router.patch("/:groupId", async (req: AuthRequest, res: Response) => {
  try {
    const groupId = parseId(req.params.groupId);
    if (groupId === null) return res.status(400).json({ error: "Invalid group id" });
    if (!(await hasPermission(req.userId!, groupId, ROLE_OWNER))) {
      return res.status(403).json({ error: "Only owners can rename a group" });
    }
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (name.length < 1 || name.length > 32) {
      return res.status(400).json({ error: "Name must be between 1 and 32 characters" });
    }
    const [group] = await db
      .update(groups)
      .set({ name })
      .where(eq(groups.id, groupId))
      .returning({ id: groups.id, name: groups.name, createdAt: groups.createdAt });
    res.json({ group });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to rename group" });
  }
});

// Delete a group (owners only). Members and events go with it (ON DELETE CASCADE).
router.delete("/:groupId", async (req: AuthRequest, res: Response) => {
  try {
    const groupId = parseId(req.params.groupId);
    if (groupId === null) return res.status(400).json({ error: "Invalid group id" });
    if (!(await hasPermission(req.userId!, groupId, ROLE_OWNER))) {
      return res.status(403).json({ error: "Only owners can delete a group" });
    }
    await db.delete(groups).where(eq(groups.id, groupId));
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete group" });
  }
});

// Get members of a group
router.get("/:groupId/members", async (req: AuthRequest, res: Response) => {
  try {
    const groupId = parseId(req.params.groupId);
    if (groupId === null) return res.status(400).json({ error: "Invalid group id" });
    if (!(await hasPermission(req.userId!, groupId, ROLE_VIEWER))) {
      return res.status(403).json({ error: "You do not have permission to access this group" });
    }

    const result = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.displayName,
        role: groupMembers.role,
        createdAt: groupMembers.createdAt,
      })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(eq(groupMembers.groupId, groupId))
      .orderBy(asc(users.displayName));
    res.json({ members: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch group members" });
  }
});

// Add a member to a group
router.post("/:groupId/members", async (req: AuthRequest, res: Response) => {
  try {
    const groupId = parseId(req.params.groupId);
    if (groupId === null) return res.status(400).json({ error: "Invalid group id" });
    if (!(await hasPermission(req.userId!, groupId, ROLE_OWNER))) {
      return res.status(403).json({ error: "You do not have permission to access this group" });
    }

    const email = typeof req.body?.email === "string" ? req.body?.email.trim().toLowerCase() : "";
    const role = parseRole(req.body?.role);
    if (!emailRegex.test(email) || !role) {
      return res.status(400).json({ error: "A valid email and member role are required" });
    }

    const [memberUser] = await db
      .select({ id: users.id, email: users.email, name: users.displayName })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!memberUser) return res.status(404).json({ error: "User not found" });

    const [membership] = await db
      .insert(groupMembers)
      .values({ groupId, userId: memberUser.id, role })
      .onConflictDoUpdate({
        target: [groupMembers.groupId, groupMembers.userId],
        set: { role },
      })
      .returning({
        groupId: groupMembers.groupId,
        userId: groupMembers.userId,
        role: groupMembers.role,
        createdAt: groupMembers.createdAt,
      });

    res.status(201).json({ member: { ...membership, user: memberUser } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add group member" });
  }
});

// Edit access level of a group member
router.patch("/:groupId/members/:userId", async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.userId!;
    const groupId = parseId(req.params.groupId);
    const userId = parseId(req.params.userId);
    if (groupId === null || userId === null) {
      return res.status(400).json({ error: "Invalid group or user id" });
    }
    const role = parseRole(req.body?.role);
    if (!role) return res.status(400).json({ error: "Invalid member role" });
    if (!(await hasPermission(currentUserId, groupId, ROLE_OWNER))) {
      return res.status(403).json({ error: "You do not have permission to access this group" });
    }

    if (userId === currentUserId && role !== ROLE_OWNER) {
      const [ownerCount] = await db
        .select({ count: count() })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.role, ROLE_OWNER)));
      if (ownerCount.count <= 1) {
        return res.status(400).json({ error: "The last owner cannot demote themselves" });
      }
    }

    const [membership] = await db
      .update(groupMembers)
      .set({ role })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .returning({ groupId: groupMembers.groupId, userId: groupMembers.userId, role: groupMembers.role });
    if (!membership) return res.status(404).json({ error: "Member not found" });
    res.json({ member: membership });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update group member" });
  }
});

// Remove a member from a group
router.delete("/:groupId/members/:userId", async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.userId!;
    const groupId = parseId(req.params.groupId);
    const userId = parseId(req.params.userId);
    if (groupId === null || userId === null) {
      return res.status(400).json({ error: "Invalid group or user id" });
    }
    if (!(await hasPermission(currentUserId, groupId, ROLE_OWNER))) {
      return res.status(403).json({ error: "You do not have permission to access this group" });
    }
    if (userId === currentUserId) {
      return res.status(400).json({ error: "An owner cannot remove themselves" });
    }

    const [membership] = await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .returning({ userId: groupMembers.userId });
    if (!membership) return res.status(404).json({ error: "Member not found" });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to remove group member" });
  }
});

export default router;
