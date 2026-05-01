import { Router } from "express";
import { db } from "@workspace/db";
import { quests } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListQuestsParams,
  CreateQuestParams,
  CreateQuestBody,
  UpdateQuestParams,
  UpdateQuestBody,
} from "@workspace/api-zod";

const router = Router();

// List quests for a campaign
router.get("/campaigns/:campaignId/quests", async (req, res) => {
  const parsed = ListQuestsParams.safeParse({ campaignId: req.params.campaignId });
  if (!parsed.success) return void res.status(400).json({ error: parsed.error });

  try {
    const list = await db.select().from(quests).where(eq(quests.campaignId, parsed.data.campaignId));
    res.json(list);
  } catch (err) {
    req.log.error({ err }, "Failed to list quests");
    res.status(500).json({ error: "Failed to list quests" });
  }
});

// Create a quest
router.post("/campaigns/:campaignId/quests", async (req, res) => {
  const paramsParsed = CreateQuestParams.safeParse({ campaignId: req.params.campaignId });
  if (!paramsParsed.success) return void res.status(400).json({ error: paramsParsed.error });

  const bodyParsed = CreateQuestBody.safeParse(req.body);
  if (!bodyParsed.success) return void res.status(400).json({ error: bodyParsed.error });

  try {
    const [quest] = await db.insert(quests).values({
      campaignId: paramsParsed.data.campaignId,
      ...bodyParsed.data,
    }).returning();
    res.status(201).json(quest);
  } catch (err) {
    req.log.error({ err }, "Failed to create quest");
    res.status(500).json({ error: "Failed to create quest" });
  }
});

// Update a quest
router.put("/campaigns/:campaignId/quests/:questId", async (req, res) => {
  const paramsParsed = UpdateQuestParams.safeParse({
    campaignId: req.params.campaignId,
    questId: req.params.questId,
  });
  if (!paramsParsed.success) return void res.status(400).json({ error: paramsParsed.error });

  const bodyParsed = UpdateQuestBody.safeParse(req.body);
  if (!bodyParsed.success) return void res.status(400).json({ error: bodyParsed.error });

  try {
    const [updated] = await db.update(quests)
      .set({ ...bodyParsed.data, updatedAt: new Date() })
      .where(and(eq(quests.id, paramsParsed.data.questId), eq(quests.campaignId, paramsParsed.data.campaignId)))
      .returning();
    if (!updated) return void res.status(404).json({ error: "Quest not found" });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update quest");
    res.status(500).json({ error: "Failed to update quest" });
  }
});

export default router;
