import { Router } from "express";
import { db } from "@workspace/db";
import { chatMessages, characters, campaigns, quests, inventoryItems } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  ListMessagesParams,
  SendMessageParams,
  SendMessageBody,
} from "@workspace/api-zod";

const router = Router();

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

QUEST AND XP TRACKING:
- When new quests are discovered or completed, append a structured JSON block at the very end of your response (after all narrative text), starting on a new line:
  <STATE_UPDATE>{"quests": [{"action": "add"|"complete"|"fail", "title": "...", "description": "...", "isMain": true|false}], "xp": <number to award this turn>, "gold": <gold change>, "items": [{"action": "add"|"remove", "name": "...", "itemType": "weapon"|"armor"|"consumable"|"tool"|"treasure"|"misc", "quantity": 1}]}</STATE_UPDATE>
- Only include fields that changed. Omit the STATE_UPDATE block entirely if nothing changed.
- XP thresholds by level: L1→300, L2→600, L3→1800, L4→3800, L5→7500, L6→9000, L7→11000, L8→14000, L9→16000, L10→21000

HP TRACKING:
- When the player takes damage or heals, clearly state the new HP total.
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

LEVEL UP:
- When total XP reaches the threshold for the next level, end your response with: <LEVEL_UP>true</LEVEL_UP>

Remember: You have full creative freedom over the world, but the player's choices should always matter.`;

router.get("/campaigns/:campaignId/messages", async (req, res) => {
  const parsed = ListMessagesParams.safeParse({ campaignId: req.params.campaignId });
  if (!parsed.success) return void res.status(400).json({ error: parsed.error });

  try {
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
    // Fetch campaign context
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) return void res.status(404).json({ error: "Campaign not found" });

    const [character] = await db.select().from(characters).where(eq(characters.campaignId, campaignId));
    const questList = await db.select().from(quests).where(eq(quests.campaignId, campaignId));
    const inventory = await db.select().from(inventoryItems).where(eq(inventoryItems.campaignId, campaignId));

    // Build context string about current game state
    let contextBlock = `\n\n[CURRENT GAME STATE]`;
    if (campaign.currentScene) contextBlock += `\nScene: ${campaign.currentScene}`;
    if (campaign.currentLocation) contextBlock += `\nLocation: ${campaign.currentLocation}`;
    if (character) {
      contextBlock += `\nCharacter: ${character.name}, ${character.race} ${character.class}, Level ${character.level}`;
      contextBlock += `\nHP: ${character.hp}/${character.maxHp}${character.tempHp > 0 ? ` (+${character.tempHp} temp)` : ""}`;
      contextBlock += `\nAC: ${character.ac}, XP: ${character.xp}`;
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
    if (activeQuests.length > 0) {
      contextBlock += `\nActive Quests: ${activeQuests.map(q => q.title).join(", ")}`;
    }
    const equippedItems = inventory.filter(i => i.isEquipped);
    if (equippedItems.length > 0) {
      contextBlock += `\nEquipped: ${equippedItems.map(i => i.name).join(", ")}`;
    }
    contextBlock += `\nGold: ${campaign.gold} gp`;

    // Get chat history
    const history = await db.select()
      .from(chatMessages)
      .where(eq(chatMessages.campaignId, campaignId))
      .orderBy(asc(chatMessages.createdAt));

    // Build message content including dice rolls if present
    let userContent = bodyParsed.data.content;
    if (bodyParsed.data.diceRolls && bodyParsed.data.diceRolls.length > 0) {
      const rollsText = bodyParsed.data.diceRolls.map(r =>
        `[Player rolled ${r.expression}${r.label ? ` (${r.label})` : ""}: ${r.details} = **${r.total}**]`
      ).join("\n");
      userContent = `${rollsText}\n\n${userContent}`;
    }

    // Save the user message
    await db.insert(chatMessages).values({
      campaignId,
      role: "user",
      content: bodyParsed.data.content,
      diceRolls: bodyParsed.data.diceRolls ?? null,
    });

    // Build messages for Claude
    const claudeMessages: Array<{ role: "user" | "assistant"; content: string }> = history.map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    // Add current user message
    claudeMessages.push({ role: "user", content: userContent + contextBlock });

    // Set up SSE
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

    // Parse out STATE_UPDATE and LEVEL_UP from response
    let cleanResponse = fullResponse;
    let stateUpdate: {
      quests?: Array<{ action: string; title: string; description?: string; isMain?: boolean }>;
      xp?: number;
      gold?: number;
      items?: Array<{ action: string; name: string; itemType?: string; quantity?: number }>;
    } | null = null;
    let levelUp = false;

    const stateMatch = fullResponse.match(/<STATE_UPDATE>([\s\S]*?)<\/STATE_UPDATE>/);
    if (stateMatch) {
      try {
        stateUpdate = JSON.parse(stateMatch[1]);
        cleanResponse = cleanResponse.replace(stateMatch[0], "").trim();
      } catch {
        // ignore parse errors
      }
    }

    const levelUpMatch = fullResponse.match(/<LEVEL_UP>true<\/LEVEL_UP>/);
    if (levelUpMatch) {
      levelUp = true;
      cleanResponse = cleanResponse.replace(levelUpMatch[0], "").trim();
    }

    // Save AI response
    await db.insert(chatMessages).values({
      campaignId,
      role: "assistant",
      content: cleanResponse,
    });

    // Apply state updates
    if (stateUpdate) {
      try {
        // XP and gold updates
        if (stateUpdate.xp || stateUpdate.gold !== undefined) {
          const campaignUpdate: Partial<typeof campaign> = {};
          if (stateUpdate.xp) {
            campaignUpdate.xp = (campaign.xp ?? 0) + stateUpdate.xp;
          }
          if (stateUpdate.gold !== undefined) {
            campaignUpdate.gold = Math.max(0, (campaign.gold ?? 0) + stateUpdate.gold);
          }
          await db.update(campaigns).set({ ...campaignUpdate, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));

          // Also sync XP to character
          if (stateUpdate.xp && character) {
            await db.update(characters).set({ xp: (character.xp ?? 0) + stateUpdate.xp, updatedAt: new Date() }).where(eq(characters.campaignId, campaignId));
          }
        }

        // Quest updates
        if (stateUpdate.quests) {
          for (const q of stateUpdate.quests) {
            if (q.action === "add") {
              await db.insert(quests).values({
                campaignId,
                title: q.title,
                description: q.description ?? null,
                status: "active",
                isMain: q.isMain ?? false,
              });
            } else if (q.action === "complete" || q.action === "fail") {
              const [existing] = await db.select().from(quests)
                .where(eq(quests.campaignId, campaignId));
              if (existing) {
                await db.update(quests)
                  .set({ status: q.action === "complete" ? "completed" : "failed", updatedAt: new Date() })
                  .where(eq(quests.campaignId, campaignId));
              }
            }
          }
        }

        // Inventory updates
        if (stateUpdate.items) {
          for (const item of stateUpdate.items) {
            if (item.action === "add") {
              await db.insert(inventoryItems).values({
                campaignId,
                name: item.name,
                itemType: (item.itemType as "weapon" | "armor" | "consumable" | "tool" | "treasure" | "misc") ?? "misc",
                quantity: item.quantity ?? 1,
                isEquipped: false,
              });
            } else if (item.action === "remove") {
              const [existing] = await db.select().from(inventoryItems)
                .where(eq(inventoryItems.campaignId, campaignId));
              if (existing) {
                await db.delete(inventoryItems).where(eq(inventoryItems.id, existing.id));
              }
            }
          }
        }
      } catch (stateErr) {
        req.log.error({ stateErr }, "Failed to apply state update");
      }
    }

    // Auto-save: update lastPlayedAt
    await db.update(campaigns).set({ lastPlayedAt: new Date(), updatedAt: new Date() }).where(eq(campaigns.id, campaignId));

    res.write(`data: ${JSON.stringify({ done: true, levelUp })}\n\n`);
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
