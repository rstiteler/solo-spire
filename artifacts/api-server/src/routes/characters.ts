import { Router } from "express";
import { db } from "@workspace/db";
import { characters, campaigns } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { geminiClient } from "@workspace/integrations-anthropic-ai";
import { requireAuth } from "../middlewares/requireAuth";
import {
  GetCharacterParams,
  UpdateCharacterParams,
  UpdateCharacterBody,
  GeneratePortraitParams,
  GeneratePortraitBody,
} from "@workspace/api-zod";

const router = Router();

router.use(requireAuth);

router.get("/campaigns/:campaignId/character", async (req, res) => {
  const parsed = GetCharacterParams.safeParse({ campaignId: req.params.campaignId });
  if (!parsed.success) return void res.status(400).json({ error: parsed.error });

  try {
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, parsed.data.campaignId), eq(campaigns.userId, req.userId)));
    if (!campaign) return void res.status(404).json({ error: "Campaign not found" });

    const [character] = await db.select().from(characters).where(eq(characters.campaignId, parsed.data.campaignId));
    if (!character) return void res.status(404).json({ error: "Character not found" });
    res.json(character);
  } catch (err) {
    req.log.error({ err }, "Failed to get character");
    res.status(500).json({ error: "Failed to get character" });
  }
});

router.put("/campaigns/:campaignId/character", async (req, res) => {
  const paramsParsed = UpdateCharacterParams.safeParse({ campaignId: req.params.campaignId });
  if (!paramsParsed.success) return void res.status(400).json({ error: paramsParsed.error });

  const bodyParsed = UpdateCharacterBody.safeParse(req.body);
  if (!bodyParsed.success) return void res.status(400).json({ error: bodyParsed.error });

  try {
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, paramsParsed.data.campaignId), eq(campaigns.userId, req.userId)));
    if (!campaign) return void res.status(404).json({ error: "Campaign not found" });

    const [existing] = await db.select().from(characters).where(eq(characters.campaignId, paramsParsed.data.campaignId));

    if (existing) {
      type CompanionInsert = { mode: string; name: string; primalType?: string; hp: number; maxHp: number; ac: number; attackBonus: number; damage: string } | null;
      const castCompanion = (c: typeof bodyParsed.data.companion): CompanionInsert => {
        if (!c) return null;
        const { primalType, ...rest2 } = c;
        return { ...rest2, ...(primalType != null ? { primalType } : {}) };
      };

      const { spellSlots, spellSlotsUsed, deathSaves, familiar, companion, ...rest } = bodyParsed.data;
      const [updated] = await db.update(characters)
        .set({
          ...rest,
          spellSlots: spellSlots as Record<string, number> | undefined,
          spellSlotsUsed: spellSlotsUsed as Record<string, number> | undefined,
          deathSaves: deathSaves as { successes: number; failures: number } | undefined,
          ...(familiar !== undefined ? { familiar: familiar as { type: string; hp: number; maxHp: number; ac: number } | null } : {}),
          ...(companion !== undefined ? { companion: castCompanion(companion) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(characters.campaignId, paramsParsed.data.campaignId))
        .returning();
      res.json(updated);
    } else {
      const { companion: companionRaw, spellSlots: iSpellSlots, spellSlotsUsed: iSpellSlotsUsed, deathSaves: iDeathSaves, ...restData } = bodyParsed.data;
      type CompanionInsert = { mode: string; name: string; primalType?: string; hp: number; maxHp: number; ac: number; attackBonus: number; damage: string } | null;
      const castCompanion2 = (c: typeof companionRaw): CompanionInsert => {
        if (!c) return null;
        const { primalType, ...cr } = c;
        return { ...cr, ...(primalType != null ? { primalType } : {}) };
      };
      const [created] = await db.insert(characters).values({
        campaignId: paramsParsed.data.campaignId,
        name: restData.name ?? "Unknown Hero",
        race: restData.race ?? "Human",
        class: restData.class ?? "Fighter",
        background: restData.background ?? "Folk Hero",
        ...restData,
        spellSlots: iSpellSlots as Record<string, number> | undefined,
        spellSlotsUsed: iSpellSlotsUsed as Record<string, number> | undefined,
        deathSaves: iDeathSaves as { successes: number; failures: number } | undefined,
        ...(companionRaw !== undefined ? { companion: castCompanion2(companionRaw) } : {}),
      }).returning();
      res.json(created);
    }
  } catch (err) {
    req.log.error({ err }, "Failed to update character");
    res.status(500).json({ error: "Failed to update character" });
  }
});

router.post("/campaigns/:campaignId/character/portrait", async (req, res) => {
  const paramsParsed = GeneratePortraitParams.safeParse({ campaignId: req.params.campaignId });
  if (!paramsParsed.success) return void res.status(400).json({ error: paramsParsed.error });

  const bodyParsed = GeneratePortraitBody.safeParse(req.body);
  if (!bodyParsed.success) return void res.status(400).json({ error: bodyParsed.error });

  try {
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, paramsParsed.data.campaignId), eq(campaigns.userId, req.userId)));
    if (!campaign) return void res.status(404).json({ error: "Campaign not found" });

    const portraitModel = geminiClient.getGenerativeModel({ model: "gemini-1.5-flash" });
    const portraitResult = await portraitModel.generateContent(
      `Create a vivid, detailed character portrait description for a D&D 5e character. Write 3-4 paragraphs describing their appearance in rich, atmospheric prose. Include physical features, clothing, bearing, and something that hints at their adventuring life.\n\nCharacter details:\n- Race: ${bodyParsed.data.race}\n- Class: ${bodyParsed.data.class}\n- Description: ${bodyParsed.data.description}\n\nWrite only the portrait description, no preamble or commentary.`
    );
    const description = portraitResult.response.text() || "A weathered adventurer with determined eyes.";

    await db.update(characters)
      .set({ portraitDescription: description, updatedAt: new Date() })
      .where(eq(characters.campaignId, paramsParsed.data.campaignId));

    res.json({ type: "description", portraitUrl: null, portraitDescription: description });
  } catch (err) {
    req.log.error({ err }, "Failed to generate portrait");
    res.status(500).json({ error: "Failed to generate portrait" });
  }
});

export default router;
