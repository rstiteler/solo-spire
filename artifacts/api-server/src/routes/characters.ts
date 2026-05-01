import { Router } from "express";
import { db } from "@workspace/db";
import { characters, campaigns } from "@workspace/db";
import { eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  GetCharacterParams,
  UpdateCharacterParams,
  UpdateCharacterBody,
  GeneratePortraitParams,
  GeneratePortraitBody,
} from "@workspace/api-zod";

const router = Router();

// Get character for a campaign
router.get("/campaigns/:campaignId/character", async (req, res) => {
  const parsed = GetCharacterParams.safeParse({ campaignId: req.params.campaignId });
  if (!parsed.success) return void res.status(400).json({ error: parsed.error });

  try {
    const [character] = await db.select().from(characters).where(eq(characters.campaignId, parsed.data.campaignId));
    if (!character) return void res.status(404).json({ error: "Character not found" });
    res.json(character);
  } catch (err) {
    req.log.error({ err }, "Failed to get character");
    res.status(500).json({ error: "Failed to get character" });
  }
});

// Update character
router.put("/campaigns/:campaignId/character", async (req, res) => {
  const paramsParsed = UpdateCharacterParams.safeParse({ campaignId: req.params.campaignId });
  if (!paramsParsed.success) return void res.status(400).json({ error: paramsParsed.error });

  const bodyParsed = UpdateCharacterBody.safeParse(req.body);
  if (!bodyParsed.success) return void res.status(400).json({ error: bodyParsed.error });

  try {
    const [existing] = await db.select().from(characters).where(eq(characters.campaignId, paramsParsed.data.campaignId));

    if (existing) {
      const { spellSlots, spellSlotsUsed, deathSaves, ...rest } = bodyParsed.data;
      const [updated] = await db.update(characters)
        .set({
          ...rest,
          spellSlots: spellSlots as Record<string, number> | undefined,
          spellSlotsUsed: spellSlotsUsed as Record<string, number> | undefined,
          deathSaves: deathSaves as { successes: number; failures: number } | undefined,
          updatedAt: new Date(),
        })
        .where(eq(characters.campaignId, paramsParsed.data.campaignId))
        .returning();
      res.json(updated);
    } else {
      // Create character if it doesn't exist
      const data = bodyParsed.data;
      const [created] = await db.insert(characters).values({
        campaignId: paramsParsed.data.campaignId,
        name: data.name ?? "Unknown Hero",
        race: data.race ?? "Human",
        class: data.class ?? "Fighter",
        background: data.background ?? "Folk Hero",
        ...data,
        spellSlots: data.spellSlots as Record<string, number> | undefined,
        spellSlotsUsed: data.spellSlotsUsed as Record<string, number> | undefined,
        deathSaves: data.deathSaves as { successes: number; failures: number } | undefined,
      }).returning();
      res.json(created);
    }
  } catch (err) {
    req.log.error({ err }, "Failed to update character");
    res.status(500).json({ error: "Failed to update character" });
  }
});

// Generate character portrait
router.post("/campaigns/:campaignId/character/portrait", async (req, res) => {
  const paramsParsed = GeneratePortraitParams.safeParse({ campaignId: req.params.campaignId });
  if (!paramsParsed.success) return void res.status(400).json({ error: paramsParsed.error });

  const bodyParsed = GeneratePortraitBody.safeParse(req.body);
  if (!bodyParsed.success) return void res.status(400).json({ error: bodyParsed.error });

  try {
    // Generate a rich written description using Claude as fallback
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{
        role: "user",
        content: `Create a vivid, detailed character portrait description for a D&D 5e character. Write 3-4 paragraphs describing their appearance in rich, atmospheric prose. Include physical features, clothing, bearing, and something that hints at their adventuring life.

Character details:
- Name (if known): implied by description
- Race: ${bodyParsed.data.race}
- Class: ${bodyParsed.data.class}
- Description: ${bodyParsed.data.description}

Write only the portrait description, no preamble or commentary.`
      }]
    });

    const block = message.content[0];
    const description = block.type === "text" ? block.text : "A weathered adventurer with determined eyes.";

    // Update the character's portrait description
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
