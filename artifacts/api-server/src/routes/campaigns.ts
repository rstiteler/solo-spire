import { Router } from "express";
import { db } from "@workspace/db";
import { campaigns, characters, quests, inventoryItems } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  CreateCampaignBody,
  UpdateCampaignBody,
  SaveCampaignBody,
  UpdateCharacterBody,
  GetCampaignParams,
  UpdateCampaignParams,
  DeleteCampaignParams,
  SaveCampaignParams,
} from "@workspace/api-zod";

const router = Router();

router.use(requireAuth);

// List all campaigns for the current user
router.get("/campaigns", async (req, res) => {
  try {
    const all = await db.select().from(campaigns)
      .where(eq(campaigns.userId, req.userId))
      .orderBy(campaigns.updatedAt);
    const reversed = all.reverse();

    // Enrich each campaign with the character's actual level
    const enriched = await Promise.all(reversed.map(async (c) => {
      const [char] = await db.select({ level: characters.level })
        .from(characters)
        .where(eq(characters.campaignId, c.id));
      return { ...c, level: char?.level ?? c.level };
    }));

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Failed to list campaigns");
    res.status(500).json({ error: "Failed to list campaigns" });
  }
});

// Create a campaign
router.post("/campaigns", async (req, res) => {
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: parsed.error });

  try {
    const [campaign] = await db.insert(campaigns).values({
      userId: req.userId,
      name: parsed.data.name,
    }).returning();
    res.status(201).json(campaign);
  } catch (err) {
    req.log.error({ err }, "Failed to create campaign");
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

// Get a campaign by ID (must belong to current user)
router.get("/campaigns/:id", async (req, res) => {
  const parsed = GetCampaignParams.safeParse({ id: req.params.id });
  if (!parsed.success) return void res.status(400).json({ error: parsed.error });

  try {
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, parsed.data.id), eq(campaigns.userId, req.userId)));
    if (!campaign) return void res.status(404).json({ error: "Campaign not found" });

    const [character] = await db.select().from(characters).where(eq(characters.campaignId, parsed.data.id));
    const questList = await db.select().from(quests).where(eq(quests.campaignId, parsed.data.id));
    const inventory = await db.select().from(inventoryItems).where(eq(inventoryItems.campaignId, parsed.data.id));

    res.json({ ...campaign, character: character ?? null, quests: questList, inventory });
  } catch (err) {
    req.log.error({ err }, "Failed to get campaign");
    res.status(500).json({ error: "Failed to get campaign" });
  }
});

// Update a campaign
router.put("/campaigns/:id", async (req, res) => {
  const paramsParsed = UpdateCampaignParams.safeParse({ id: req.params.id });
  if (!paramsParsed.success) return void res.status(400).json({ error: paramsParsed.error });

  const bodyParsed = UpdateCampaignBody.safeParse(req.body);
  if (!bodyParsed.success) return void res.status(400).json({ error: bodyParsed.error });

  try {
    const [updated] = await db.update(campaigns)
      .set({ ...bodyParsed.data, updatedAt: new Date() })
      .where(and(eq(campaigns.id, paramsParsed.data.id), eq(campaigns.userId, req.userId)))
      .returning();
    if (!updated) return void res.status(404).json({ error: "Campaign not found" });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update campaign");
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

// Delete a campaign
router.delete("/campaigns/:id", async (req, res) => {
  const parsed = DeleteCampaignParams.safeParse({ id: req.params.id });
  if (!parsed.success) return void res.status(400).json({ error: parsed.error });

  try {
    await db.delete(campaigns)
      .where(and(eq(campaigns.id, parsed.data.id), eq(campaigns.userId, req.userId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete campaign");
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

// Manual save campaign
router.post("/campaigns/:id/save", async (req, res) => {
  const paramsParsed = SaveCampaignParams.safeParse({ id: req.params.id });
  if (!paramsParsed.success) return void res.status(400).json({ error: paramsParsed.error });

  const bodyParsed = SaveCampaignBody.safeParse(req.body);
  if (!bodyParsed.success) return void res.status(400).json({ error: bodyParsed.error });

  try {
    const { characterUpdates, ...campaignUpdates } = bodyParsed.data;

    const [updated] = await db.update(campaigns)
      .set({ ...campaignUpdates, updatedAt: new Date(), lastPlayedAt: new Date() })
      .where(and(eq(campaigns.id, paramsParsed.data.id), eq(campaigns.userId, req.userId)))
      .returning();
    if (!updated) return void res.status(404).json({ error: "Campaign not found" });

    if (characterUpdates && Object.keys(characterUpdates).length > 0) {
      const charBody = UpdateCharacterBody.safeParse(characterUpdates);
      if (charBody.success) {
        type CompanionSet = { mode: string; name: string; primalType?: string; hp: number; maxHp: number; ac: number; attackBonus: number; damage: string } | null;
        const castCompanion = (c: typeof charBody.data.companion): CompanionSet => {
          if (!c) return null;
          const { primalType, ...cr } = c;
          return { ...cr, ...(primalType != null ? { primalType } : {}) };
        };
        const { spellSlots, spellSlotsUsed, deathSaves, familiar, companion, ...charRest } = charBody.data;
        await db.update(characters)
          .set({
            ...charRest,
            spellSlots: spellSlots as Record<string, number> | undefined,
            spellSlotsUsed: spellSlotsUsed as Record<string, number> | undefined,
            deathSaves: deathSaves as { successes: number; failures: number } | undefined,
            ...(familiar !== undefined ? { familiar: familiar as { type: string; hp: number; maxHp: number; ac: number } | null } : {}),
            ...(companion !== undefined ? { companion: castCompanion(companion) } : {}),
            updatedAt: new Date(),
          })
          .where(eq(characters.campaignId, paramsParsed.data.id));
      }
    }

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to save campaign");
    res.status(500).json({ error: "Failed to save campaign" });
  }
});

export default router;
