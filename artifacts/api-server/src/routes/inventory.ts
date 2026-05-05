import { Router } from "express";
import { db } from "@workspace/db";
import { inventoryItems, characters, campaigns } from "@workspace/db";
import type { ItemProperties } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ListInventoryParams,
  AddInventoryItemParams,
  AddInventoryItemBody,
  UpdateInventoryItemParams,
  UpdateInventoryItemBody,
  DeleteInventoryItemParams,
} from "@workspace/api-zod";

const router = Router();

router.use(requireAuth);

function calcAC(
  dex: number,
  equippedItems: Array<{ itemProperties: ItemProperties | null | undefined }>,
  charClass?: string | null,
  subclass?: string | null,
  constitution?: number | null,
  wisdom?: number | null,
): number {
  const dexMod = Math.floor((dex - 10) / 2);
  let baseAC = 10 + dexMod; // unarmored default
  let shieldBonus = 0;
  let hasArmor = false;
  let hasShield = false;

  for (const item of equippedItems) {
    const props = item.itemProperties;
    if (!props?.armorType || props.acBase == null) continue;

    if (props.armorType === "shield") {
      shieldBonus = 2;
      hasShield = true;
    } else {
      hasArmor = true;
      if (props.armorType === "light") {
        baseAC = props.acBase + dexMod;
      } else if (props.armorType === "medium") {
        baseAC = props.acBase + Math.min(dexMod, 2);
      } else if (props.armorType === "heavy") {
        baseAC = props.acBase;
      }
    }
  }

  if (!hasArmor) {
    const conMod = Math.floor(((constitution ?? 10) - 10) / 2);
    const wisMod = Math.floor(((wisdom ?? 10) - 10) / 2);
    if (charClass === "Barbarian") {
      // Unarmored Defense: 10 + DEX + CON (shield is fine)
      baseAC = 10 + dexMod + conMod;
    } else if (charClass === "Monk" && !hasShield) {
      // Unarmored Defense: 10 + DEX + WIS (no armor OR shield)
      baseAC = 10 + dexMod + wisMod;
    } else if (charClass === "Sorcerer" && subclass === "Draconic Bloodline") {
      // Draconic Resilience: 13 + DEX
      baseAC = 13 + dexMod;
    }
  }

  return baseAC + shieldBonus;
}

router.get("/campaigns/:campaignId/inventory", async (req, res) => {
  const parsed = ListInventoryParams.safeParse({ campaignId: req.params.campaignId });
  if (!parsed.success) return void res.status(400).json({ error: parsed.error });

  try {
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, parsed.data.campaignId), eq(campaigns.userId, req.userId)));
    if (!campaign) return void res.status(404).json({ error: "Campaign not found" });

    const items = await db.select().from(inventoryItems).where(eq(inventoryItems.campaignId, parsed.data.campaignId));
    res.json(items);
  } catch (err) {
    req.log.error({ err }, "Failed to list inventory");
    res.status(500).json({ error: "Failed to list inventory" });
  }
});

router.post("/campaigns/:campaignId/inventory", async (req, res) => {
  const paramsParsed = AddInventoryItemParams.safeParse({ campaignId: req.params.campaignId });
  if (!paramsParsed.success) return void res.status(400).json({ error: paramsParsed.error });

  const bodyParsed = AddInventoryItemBody.safeParse(req.body);
  if (!bodyParsed.success) return void res.status(400).json({ error: bodyParsed.error });

  try {
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, paramsParsed.data.campaignId), eq(campaigns.userId, req.userId)));
    if (!campaign) return void res.status(404).json({ error: "Campaign not found" });

    const { itemProperties, ...rest } = bodyParsed.data;
    const [item] = await db.insert(inventoryItems).values({
      campaignId: paramsParsed.data.campaignId,
      ...rest,
      itemProperties: itemProperties as ItemProperties ?? null,
    }).returning();
    res.status(201).json(item);
  } catch (err) {
    req.log.error({ err }, "Failed to add inventory item");
    res.status(500).json({ error: "Failed to add inventory item" });
  }
});

router.put("/campaigns/:campaignId/inventory/:itemId", async (req, res) => {
  const paramsParsed = UpdateInventoryItemParams.safeParse({
    campaignId: req.params.campaignId,
    itemId: req.params.itemId,
  });
  if (!paramsParsed.success) return void res.status(400).json({ error: paramsParsed.error });

  const bodyParsed = UpdateInventoryItemBody.safeParse(req.body);
  if (!bodyParsed.success) return void res.status(400).json({ error: bodyParsed.error });

  try {
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, paramsParsed.data.campaignId), eq(campaigns.userId, req.userId)));
    if (!campaign) return void res.status(404).json({ error: "Campaign not found" });

    const { itemProperties, ...rest } = bodyParsed.data;

    const [updated] = await db.update(inventoryItems)
      .set({
        ...rest,
        ...(itemProperties !== undefined ? { itemProperties: itemProperties as ItemProperties } : {}),
      })
      .where(and(
        eq(inventoryItems.id, paramsParsed.data.itemId),
        eq(inventoryItems.campaignId, paramsParsed.data.campaignId),
      ))
      .returning();
    if (!updated) return void res.status(404).json({ error: "Item not found" });

    // If equip state changed on an armor/shield item, recalculate AC
    if (bodyParsed.data.isEquipped !== undefined) {
      const [character] = await db.select().from(characters)
        .where(eq(characters.campaignId, paramsParsed.data.campaignId));
      if (character) {
        const allItems = await db.select().from(inventoryItems)
          .where(eq(inventoryItems.campaignId, paramsParsed.data.campaignId));
        const equipped = allItems.filter(i => i.isEquipped);
        const hasArmorEquipped = equipped.some(i => {
          const props = i.itemProperties as ItemProperties | null;
          return props?.armorType != null;
        });
        if (hasArmorEquipped || bodyParsed.data.isEquipped === false) {
          const newAC = calcAC(character.dexterity, equipped as Array<{ itemProperties: ItemProperties | null | undefined }>, character.class, character.subclass, character.constitution, character.wisdom);
          await db.update(characters)
            .set({ ac: newAC, updatedAt: new Date() })
            .where(eq(characters.campaignId, paramsParsed.data.campaignId));
        }
      }
    }

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update inventory item");
    res.status(500).json({ error: "Failed to update inventory item" });
  }
});

router.delete("/campaigns/:campaignId/inventory/:itemId", async (req, res) => {
  const paramsParsed = DeleteInventoryItemParams.safeParse({
    campaignId: req.params.campaignId,
    itemId: req.params.itemId,
  });
  if (!paramsParsed.success) return void res.status(400).json({ error: paramsParsed.error });

  try {
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, paramsParsed.data.campaignId), eq(campaigns.userId, req.userId)));
    if (!campaign) return void res.status(404).json({ error: "Campaign not found" });

    await db.delete(inventoryItems).where(
      and(
        eq(inventoryItems.id, paramsParsed.data.itemId),
        eq(inventoryItems.campaignId, paramsParsed.data.campaignId),
      )
    );
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete inventory item");
    res.status(500).json({ error: "Failed to delete inventory item" });
  }
});

export default router;
