import { and, arrayContains, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { Router, Response } from "express";
import { db } from "../db/client";
import { events, eventTypeEnum, groupMembers, ROLE_EDITOR, TYPE_INCIDENT, TYPE_RELEASE, users } from "../db/schema";
import { authenticate, AuthRequest } from "../middleware/auth";
import { hasPermission, parseId } from "../services/roles";

const router = Router();
router.use(authenticate);

type EventType = typeof eventTypeEnum.enumValues[number];

const eventSelection = {
  id: events.id,
  type: events.type,
  title: events.title,
  description: events.description,
  startTime: events.startTime,
  endTime: events.endTime,
  tags: events.tags,
  createdAt: events.createdAt,
  updatedAt: events.updatedAt,
  postedBy: events.postedBy,
  groupId: events.groupId,
  postedByName: users.displayName,
};

function validDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseEventFields(value: unknown, partial = false): Record<string, unknown> | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Invalid event body";
  const body = value as Record<string, unknown>;
  const parsed: Record<string, unknown> = {};

  if (!partial || "type" in body) {
    if (body.type !== TYPE_INCIDENT && body.type !== TYPE_RELEASE) return "Invalid event type";
    parsed.type = body.type;
  }
  if (!partial || "title" in body) {
    if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 200) {
      return "Title must be between 1 and 200 characters";
    }
    parsed.title = body.title.trim();
  }
  if (!partial || "description" in body) {
    if (!partial && body.description === undefined) {
      parsed.description = null;
    } else if (body.description !== null && (typeof body.description !== "string" || body.description.length > 20000)) {
      return "Description must be a string of at most 20000 characters or null";
    } else {
      parsed.description = body.description;
    }
  }
  if (!partial || "startTime" in body) {
    const startTime = validDate(body.startTime);
    if (!startTime) return "Invalid startTime";
    parsed.startTime = startTime;
  }
  if (!partial || "endTime" in body) {
    const endTime = body.endTime === null ? null : validDate(body.endTime);
    if (endTime === null && body.endTime !== null && body.endTime !== undefined) return "Invalid endTime";
    if (endTime === null && !partial && body.endTime === undefined) parsed.endTime = null;
    else if (body.endTime !== undefined) parsed.endTime = endTime;
  }
  if (!partial || "tags" in body) {
    const tags = body.tags === undefined && !partial ? [] : body.tags;
    if (!Array.isArray(tags) || tags.length > 10 || tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.trim().length > 50)) {
      return "Tags must contain at most 10 non-empty strings of at most 50 characters";
    }
    parsed.tags = tags.map((tag: string) => tag.trim());
  }
  if (!partial) {
    if (typeof body.groupId !== "number" || !Number.isSafeInteger(body.groupId) || body.groupId <= 0) {
      return "Invalid groupId";
    }
    parsed.groupId = body.groupId;
  }

  return parsed;
}

// Get all events meeting the query
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const from = req.query.from === undefined ? null : validDate(req.query.from);
    const to = req.query.to === undefined ? null : validDate(req.query.to);
    if ((req.query.from !== undefined && !from) || (req.query.to !== undefined && !to)) {
      return res.status(400).json({ error: "Invalid date filter" });
    }
    if (from && to && to < from) {
      return res.status(400).json({ error: "to must be greater than or equal to from" });
    }

    const type = req.query.type;
    if (type !== undefined && !eventTypeEnum.enumValues.includes(type as EventType)) {
      return res.status(400).json({ error: "Invalid event type" });
    }
    const tag = typeof req.query.tag === "string" ? req.query.tag.trim() : null;
    if (req.query.tag !== undefined && !tag) return res.status(400).json({ error: "Invalid tag" });

    const groupId = req.query.groupId === undefined ? null : parseId(req.query.groupId.toString());
    if (req.query.groupId !== undefined && groupId === null) {
      return res.status(400).json({ error: "Invalid group id" });
    }
    if (groupId !== null && !(await hasPermission(req.userId!, groupId))) {
      return res.status(403).json({ error: "You do not have access to this group" });
    }

    const filters = [
      groupId !== null ? eq(events.groupId, groupId) : undefined,
      from ? or(isNull(events.endTime), gte(events.endTime, from)) : undefined,
      to ? lte(events.startTime, to) : undefined,
      type ? eq(events.type, type as EventType) : undefined,
      tag ? arrayContains(events.tags, [tag]) : undefined,
    ];
    const result = await db
      .select(eventSelection)
      .from(events)
      .innerJoin(groupMembers, and(eq(groupMembers.groupId, events.groupId), eq(groupMembers.userId, req.userId!)))
      .leftJoin(users, eq(users.id, events.postedBy))
      .where(and(...filters))
      .orderBy(desc(events.startTime));

    res.json({ events: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// Get a specific event by id
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;

    const [event] = await db
      .select(eventSelection)
      .from(events)
      .leftJoin(users, eq(users.id, events.postedBy))
      .where(eq(events.id, id))
      .limit(1);
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (!(await hasPermission(req.userId!, event.groupId))) {
      return res.status(403).json({ error: "You do not have access to this event" });
    }
    res.json({ event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

// Create a new event
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = parseEventFields(req.body);
    if (typeof parsed === "string") return res.status(400).json({ error: parsed });
    const data = parsed as {
      type: EventType;
      title: string;
      description: string | null;
      startTime: Date;
      endTime: Date | null;
      tags: string[];
      groupId: number;
    };
    if (data.endTime && data.endTime < data.startTime) {
      return res.status(400).json({ error: "endTime must be greater than or equal to startTime" });
    }
    if (!(await hasPermission(req.userId!, data.groupId, ROLE_EDITOR))) {
      return res.status(403).json({ error: "You do not have permission to create events in this group" });
    }

    const [created] = await db.insert(events).values({
      ...data,
      postedBy: req.userId!,
    }).returning({ id: events.id });
    const [event] = await db
      .select(eventSelection)
      .from(events)
      .leftJoin(users, eq(users.id, events.postedBy))
      .where(eq(events.id, created.id))
      .limit(1);
    res.status(201).json({ event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create event" });
  }
});

// Edit an existing event
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;

    const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Event not found" });
    if (!(await hasPermission(req.userId!, existing.groupId, ROLE_EDITOR))) {
      return res.status(403).json({ error: "You do not have permission to update this event" });
    }

    const parsed = parseEventFields(req.body, true);
    if (typeof parsed === "string") return res.status(400).json({ error: parsed });
    if (Object.keys(parsed).length === 0) return res.status(400).json({ error: "No fields to update" });

    const merged = { ...existing, ...parsed };
    if (merged.endTime && merged.endTime < merged.startTime) {
      return res.status(400).json({ error: "endTime must be greater than or equal to startTime" });
    }

    await db.update(events).set({ ...parsed, updatedAt: new Date() }).where(eq(events.id, id));
    const [event] = await db
      .select(eventSelection)
      .from(events)
      .leftJoin(users, eq(users.id, events.postedBy))
      .where(eq(events.id, id))
      .limit(1);
    res.json({ event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update event" });
  }
});

// Remove an event
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;

    const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Event not found" });
    if (!(await hasPermission(req.userId!, existing.groupId, ROLE_EDITOR))) {
      return res.status(403).json({ error: "You do not have permission to delete this event" });
    }

    await db.delete(events).where(eq(events.id, id));
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete event" });
  }
});

export default router;
