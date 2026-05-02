import { Router } from "express";
import { db } from "@workspace/db";
import { chatMessages, characters, campaigns, quests, inventoryItems } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListMessagesParams,
  SendMessageParams,
  SendMessageBody,
} from "@workspace/api-zod";

const router = Router();

router.use(requireAuth);

// ─── Level/Spell Slot Tables ────────────────────────────────────────────────

const CLASS_HIT_DICE: Record<string, number> = {
  Fighter: 10, Paladin: 10, Ranger: 10, Barbarian: 12,
  Rogue: 8, Cleric: 8, Druid: 8, Bard: 8, Monk: 8, Warlock: 8,
  Wizard: 6, Sorcerer: 6,
};

// Full casters: Wizard, Cleric, Druid, Bard, Sorcerer
const FULL_CASTER_SLOTS: Record<number, Record<string, number>> = {
  1: { "1": 2 }, 2: { "1": 3 }, 3: { "1": 4, "2": 2 }, 4: { "1": 4, "2": 3 },
  5: { "1": 4, "2": 3, "3": 2 }, 6: { "1": 4, "2": 3, "3": 3 },
  7: { "1": 4, "2": 3, "3": 3, "4": 1 }, 8: { "1": 4, "2": 3, "3": 3, "4": 2 },
  9: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 1 }, 10: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 2 },
};

// Warlock pact magic (short rest recovery)
const WARLOCK_SLOTS: Record<number, Record<string, number>> = {
  1: { "1": 1 }, 2: { "1": 2 }, 3: { "2": 2 }, 4: { "2": 2 }, 5: { "3": 2 },
  6: { "3": 2 }, 7: { "4": 2 }, 8: { "4": 2 }, 9: { "5": 2 }, 10: { "5": 2 },
};

// Half casters (Paladin, Ranger) — gain spells at level 2
const HALF_CASTER_SLOTS: Record<number, Record<string, number>> = {
  2: { "1": 2 }, 3: { "1": 3 }, 4: { "1": 3 }, 5: { "1": 4, "2": 2 },
  6: { "1": 4, "2": 2 }, 7: { "1": 4, "2": 3 }, 8: { "1": 4, "2": 3 },
  9: { "1": 4, "2": 3, "3": 2 }, 10: { "1": 4, "2": 3, "3": 2 },
};

function getProficiencyBonus(level: number): number {
  return Math.floor((level - 1) / 4) + 2;
}

// ─── System Prompt ──────────────────────────────────────────────────────────

const DM_SYSTEM_PROMPT = `You are a skilled, creative Dungeon Master for a solo D&D 5e campaign. The player is adventuring alone — you control all NPCs, enemies, and the world.

CORE RESPONSIBILITIES:
- Narrate the world vividly and atmospherically. Describe scenes with sensory detail.
- Present meaningful choices but never railroad the player.
- Maintain complete consistency with the established world and story across all previous messages.
- Track all D&D 5e rules precisely: spell slots, conditions, concentration, death saving throws, exhaustion, etc.
- Award XP for combat encounters (by challenge rating), clever roleplay, and milestone achievements.

DICE ROLLING:
- When you need to make rolls (enemy attacks, saving throws, skill checks, random encounters), explicitly state what you're rolling and why.
- Format dice roll results as: **[ROLL: {expression} = {result}]**
- For enemy attacks: roll to hit, compare to player's AC, then roll damage if it hits.
- Example: "The orc swings his greataxe. **[ROLL: 1d20+5 = 14]** That's 14 — it hits your AC of 13! **[ROLL: 2d12+3 = 11]** You take 11 slashing damage."
- Always narrate the result naturally in the story, don't just state numbers.

STATE TRACKING:
When the game state changes (HP, gold, XP, quests, inventory), append a structured JSON block at the very end of your response (after all narrative text), on a new line:
  <STATE_UPDATE>{"hp": <new absolute HP>, "tempHp": <new temp HP>, "quests": [{"action": "add"|"complete"|"fail", "title": "...", "description": "...", "isMain": true|false}], "xp": <xp to award this turn>, "gold": <gold change, can be negative>, "items": [{"action": "add"|"remove", "name": "...", "itemType": "weapon"|"armor"|"consumable"|"tool"|"treasure"|"misc", "quantity": 1}]}</STATE_UPDATE>

CRITICAL STATE RULES:
- Include ONLY the fields that changed this turn. Omit any field that didn't change.
- Omit the STATE_UPDATE block entirely if absolutely nothing changed.
- NEVER re-emit rewards, items, XP, or gold that were already granted in a previous response, even if you reference those things in later narration. Each STATE_UPDATE is for NEW changes only.
- Always include "hp" in the STATE_UPDATE whenever the player takes damage OR heals (even partial). Use the exact new HP value (never go below 0 or above maxHp). The [CURRENT GAME STATE] block shows the current HP so you know the starting value.
- Include "tempHp" whenever temporary HP is granted or removed.

HP TRACKING:
- When the player takes damage or heals, clearly state the new HP total in the narrative.
- Watch for death saving throw triggers when HP reaches 0.
- Track conditions (Poisoned, Blinded, Restrained, etc.) and their mechanical effects.

SPELLCASTING:
- Track spell slot usage. When the player casts a spell, remind them which slot level was used.
- Note when spell concentration is required and broken.
- Short rest: Warlocks recover all spell slots. Other classes: Hit Die recovery.
- Long rest: All spell slots and HP fully recovered.

TONE:
- Rich, atmospheric prose for descriptions.
- NPCs have distinct personalities and speak in character.
- Combat is tense and visceral but not gratuitously violent.
- Maintain a sense of wonder, danger, and consequence.
- The world reacts to the player's choices in meaningful ways.

XP THRESHOLDS: L1→300, L2→900, L3→2700, L4→6500, L5→14000, L6→23000, L7→34000, L8→48000, L9→64000, L10→85000

LEVEL UP:
- When total XP reaches the threshold for the next level, end your response with: <LEVEL_UP>true</LEVEL_UP>
- Do NOT increase HP yourself when leveling up — the player will choose their HP increase in the UI.

Remember: You have full creative freedom over the world, but the player's choices should always matter.`;

// ─── Routes ─────────────────────────────────────────────────────────────────

router.get("/campaigns/:campaignId/messages", async (req, res) => {
  const parsed = ListMessagesParams.safeParse({ campaignId: req.params.campaignId });
  if (!parsed.success) return void res.status(400).json({ error: parsed.error });

  try {
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, parsed.data.campaignId), eq(campaigns.userId, req.userId)));
    if (!campaign) return void res.status(404).json({ error: "Campaign not found" });

    const messages = await db.select()
      .from(chatMessages)
      .where(eq(chatMessages.campaignId, parsed.data.campaignId))
      .orderBy(asc(chatMessages.createdAt));
    res.json(messages);
  } catch (err) {
    req.log.error({ err }, "Failed to list messages");
    res.status(500).json({ error: "Failed to list messages" });
  }
});

router.post("/campaigns/:campaignId/chat", async (req, res) => {
  const paramsParsed = SendMessageParams.safeParse({ campaignId: req.params.campaignId });
  if (!paramsParsed.success) return void res.status(400).json({ error: paramsParsed.error });

  const bodyParsed = SendMessageBody.safeParse(req.body);
  if (!bodyParsed.success) return void res.status(400).json({ error: bodyParsed.error });

  const campaignId = paramsParsed.data.campaignId;

  try {
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, req.userId)));
    if (!campaign) return void res.status(404).json({ error: "Campaign not found" });

    const [character] = await db.select().from(characters).where(eq(characters.campaignId, campaignId));
    const questList = await db.select().from(quests).where(eq(quests.campaignId, campaignId));
    const inventory = await db.select().from(inventoryItems).where(eq(inventoryItems.campaignId, campaignId));

    let contextBlock = `\n\n[CURRENT GAME STATE]`;
    if (campaign.currentScene) contextBlock += `\nScene: ${campaign.currentScene}`;
    if (campaign.currentLocation) contextBlock += `\nLocation: ${campaign.currentLocation}`;
    if (character) {
      const features = character.features as string[] | null;
      const subclass = features && features.length > 0 ? features[0] : null;
      contextBlock += `\nCharacter: ${character.name}, ${character.race} ${character.class}${subclass ? ` (${subclass})` : ""}, Level ${character.level}`;
      contextBlock += `\nHP: ${character.hp}/${character.maxHp}${character.tempHp > 0 ? ` (+${character.tempHp} temp)` : ""}`;
      contextBlock += `\nAC: ${character.ac}, Speed: ${character.speed}, XP: ${character.xp}`;
      if (character.conditions && (character.conditions as string[]).length > 0) {
        contextBlock += `\nConditions: ${(character.conditions as string[]).join(", ")}`;
      }
      if (character.spellSlots && character.spellSlotsUsed) {
        const slots = character.spellSlots as Record<string, number>;
        const used = character.spellSlotsUsed as Record<string, number>;
        const remaining = Object.entries(slots)
          .map(([lvl, max]) => `L${lvl}: ${max - (used[lvl] ?? 0)}/${max}`)
          .filter(s => !s.startsWith("L0"))
          .join(", ");
        if (remaining) contextBlock += `\nSpell Slots: ${remaining}`;
      }
      if (character.deathSaves) {
        const ds = character.deathSaves as { successes: number; failures: number };
        if (ds.successes > 0 || ds.failures > 0) {
          contextBlock += `\nDeath Saves: ${ds.successes} successes, ${ds.failures} failures`;
        }
      }
    }
    const activeQuests = questList.filter(q => q.status === "active");
    if (activeQuests.length > 0) contextBlock += `\nActive Quests: ${activeQuests.map(q => q.title).join(", ")}`;
    const equippedItems = inventory.filter(i => i.isEquipped);
    if (equippedItems.length > 0) contextBlock += `\nEquipped: ${equippedItems.map(i => i.name).join(", ")}`;
    contextBlock += `\nGold: ${campaign.gold} gp`;

    const history = await db.select()
      .from(chatMessages)
      .where(eq(chatMessages.campaignId, campaignId))
      .orderBy(asc(chatMessages.createdAt));

    let userContent = bodyParsed.data.content;
    if (bodyParsed.data.diceRolls && bodyParsed.data.diceRolls.length > 0) {
      const rollsText = bodyParsed.data.diceRolls.map(r =>
        `[Player rolled ${r.expression}${r.label ? ` (${r.label})` : ""}: ${r.details} = **${r.total}**]`
      ).join("\n");
      userContent = `${rollsText}\n\n${userContent}`;
    }

    await db.insert(chatMessages).values({
      campaignId,
      role: "user",
      content: bodyParsed.data.content,
      diceRolls: bodyParsed.data.diceRolls ?? null,
    });

    const claudeMessages: Array<{ role: "user" | "assistant"; content: string }> = history.map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
    claudeMessages.push({ role: "user", content: userContent + contextBlock });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let fullResponse = "";

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: DM_SYSTEM_PROMPT,
      messages: claudeMessages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullResponse += event.delta.text;
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    let cleanResponse = fullResponse;
    let stateUpdate: {
      hp?: number;
      tempHp?: number;
      quests?: Array<{ action: string; title: string; description?: string; isMain?: boolean }>;
      xp?: number;
      gold?: number;
      items?: Array<{ action: string; name: string; itemType?: string; quantity?: number }>;
    } | null = null;
    let levelUp = false;
    let newLevelInfo: { newLevel: number; hitDie: number } | null = null;

    const stateMatch = fullResponse.match(/<STATE_UPDATE>([\s\S]*?)<\/STATE_UPDATE>/);
    if (stateMatch) {
      try {
        stateUpdate = JSON.parse(stateMatch[1]);
        cleanResponse = cleanResponse.replace(stateMatch[0], "").trim();
      } catch { /* ignore */ }
    }

    const levelUpMatch = fullResponse.match(/<LEVEL_UP>true<\/LEVEL_UP>/);
    if (levelUpMatch) {
      levelUp = true;
      cleanResponse = cleanResponse.replace(levelUpMatch[0], "").trim();
    }

    await db.insert(chatMessages).values({ campaignId, role: "assistant", content: cleanResponse });

    if (stateUpdate) {
      try {
        // XP + Gold
        if (stateUpdate.xp || stateUpdate.gold !== undefined) {
          const campaignUpdate: { xp?: number; gold?: number } = {};
          if (stateUpdate.xp) campaignUpdate.xp = (campaign.xp ?? 0) + stateUpdate.xp;
          if (stateUpdate.gold !== undefined) {
            campaignUpdate.gold = Math.max(0, (campaign.gold ?? 0) + stateUpdate.gold);
          }
          await db.update(campaigns).set({ ...campaignUpdate, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
          if (stateUpdate.xp && character) {
            await db.update(characters).set({ xp: (character.xp ?? 0) + stateUpdate.xp, updatedAt: new Date() }).where(eq(characters.campaignId, campaignId));
          }
        }

        // HP update from combat/healing
        if (stateUpdate.hp !== undefined && character) {
          const clampedHp = Math.max(0, Math.min(stateUpdate.hp, character.maxHp));
          await db.update(characters)
            .set({ hp: clampedHp, updatedAt: new Date() })
            .where(eq(characters.campaignId, campaignId));
        }

        // Temp HP
        if (stateUpdate.tempHp !== undefined && character) {
          await db.update(characters)
            .set({ tempHp: Math.max(0, stateUpdate.tempHp), updatedAt: new Date() })
            .where(eq(characters.campaignId, campaignId));
        }

        // Quests
        if (stateUpdate.quests) {
          for (const q of stateUpdate.quests) {
            if (q.action === "add") {
              await db.insert(quests).values({
                campaignId, title: q.title, description: q.description ?? null,
                status: "active", isMain: q.isMain ?? false,
              });
            } else if (q.action === "complete" || q.action === "fail") {
              const [existing] = await db.select().from(quests)
                .where(and(eq(quests.campaignId, campaignId), eq(quests.title, q.title)));
              if (existing) {
                await db.update(quests)
                  .set({ status: q.action === "complete" ? "completed" : "failed" })
                  .where(eq(quests.id, existing.id));
              }
            }
          }
        }

        // Items (with deduplication)
        if (stateUpdate.items) {
          const currentInventory = await db.select().from(inventoryItems).where(eq(inventoryItems.campaignId, campaignId));
          for (const item of stateUpdate.items) {
            const normalizedName = item.name.trim().toLowerCase();
            const existing = currentInventory.find(i => i.name.trim().toLowerCase() === normalizedName);
            if (item.action === "add") {
              if (existing) {
                await db.update(inventoryItems)
                  .set({ quantity: existing.quantity + (item.quantity ?? 1) })
                  .where(eq(inventoryItems.id, existing.id));
                existing.quantity += (item.quantity ?? 1);
              } else {
                const newItem = await db.insert(inventoryItems).values({
                  campaignId, name: item.name.trim(),
                  itemType: (item.itemType as "weapon" | "armor" | "consumable" | "tool" | "treasure" | "misc") ?? "misc",
                  quantity: item.quantity ?? 1, isEquipped: false,
                }).returning();
                if (newItem[0]) currentInventory.push(newItem[0]);
              }
            } else if (item.action === "remove" && existing) {
              const removeQty = item.quantity ?? 1;
              if (existing.quantity <= removeQty) {
                await db.delete(inventoryItems).where(eq(inventoryItems.id, existing.id));
              } else {
                await db.update(inventoryItems)
                  .set({ quantity: existing.quantity - removeQty })
                  .where(eq(inventoryItems.id, existing.id));
              }
            }
          }
        }
      } catch (stateErr) {
        req.log.error({ stateErr }, "Failed to apply state update");
      }
    }

    // Level-up: increment level, proficiency bonus, spell slots server-side
    if (levelUp && character) {
      try {
        const newLevel = character.level + 1;
        const newProfBonus = getProficiencyBonus(newLevel);
        const hitDie = CLASS_HIT_DICE[character.class] ?? 8;

        const fullCasters = ["Wizard", "Cleric", "Druid", "Bard", "Sorcerer"];
        const warlocks = ["Warlock"];
        const halfCasters = ["Ranger", "Paladin"];

        let newSpellSlots: Record<string, number> | undefined;
        if (fullCasters.includes(character.class)) {
          newSpellSlots = FULL_CASTER_SLOTS[newLevel];
        } else if (warlocks.includes(character.class)) {
          newSpellSlots = WARLOCK_SLOTS[newLevel];
        } else if (halfCasters.includes(character.class)) {
          newSpellSlots = HALF_CASTER_SLOTS[newLevel];
        }

        // Preserve current spell slot usage, only init new levels to 0
        let newSpellSlotsUsed: Record<string, number> | undefined;
        if (newSpellSlots) {
          const currentUsed = (character.spellSlotsUsed as Record<string, number>) ?? {};
          newSpellSlotsUsed = Object.fromEntries(
            Object.keys(newSpellSlots).map(k => [k, currentUsed[k] ?? 0])
          );
        }

        await db.update(characters).set({
          level: newLevel,
          proficiencyBonus: newProfBonus,
          ...(newSpellSlots ? { spellSlots: newSpellSlots, spellSlotsUsed: newSpellSlotsUsed } : {}),
          updatedAt: new Date(),
        }).where(eq(characters.campaignId, campaignId));

        newLevelInfo = { newLevel, hitDie };
      } catch (lvlErr) {
        req.log.error({ lvlErr }, "Failed to apply level up");
      }
    }

    await db.update(campaigns).set({ lastPlayedAt: new Date(), updatedAt: new Date() }).where(eq(campaigns.id, campaignId));

    res.write(`data: ${JSON.stringify({ done: true, levelUp, ...newLevelInfo })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to process chat message");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process message" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`);
      res.end();
    }
  }
});

export default router;
