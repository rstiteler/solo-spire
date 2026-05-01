import { Router } from "express";
import { db } from "@workspace/db";
import { inventoryItems } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListInventoryParams,
  AddInventoryItemParams,
  AddInventoryItemBody,
  UpdateInventoryItemParams,
  UpdateInventoryItemBody,
  DeleteInventoryItemParams,
} from "@workspace/api-zod";

const router = Router();

// List inventory for a campaign
router.get("/campaigns/:campaignId/inventory", async (req, res) => {
  const parsed = ListInventoryParams.safeParse({ campaignId: req.params.campaignId });
  if (!parsed.success) return void res.status(400).json({ error: parsed.error });

  try {
    const items = await db.select().from(inventoryItems).where(eq(inventoryItems.campaignId, parsed.data.campaignId));
    res.json(items);
  } catch (err) {
    req.log.error({ err }, "Failed to list inventory");
    res.status(500).json({ error: "Failed to list inventory" });
  }
});

// Add inventory item
router.post("/campaigns/:campaignId/inventory", async (req, res) => {
  const paramsParsed = AddInventoryItemParams.safeParse({ campaignId: req.params.campaignId });
  if (!paramsParsed.success) return void res.status(400).json({ error: paramsParsed.error });

  const bodyParsed = AddInventoryItemBody.safeParse(req.body);
  if (!bodyParsed.success) return void res.status(400).json({ error: bodyParsed.error });

  try {
    const [item] = await db.insert(inventoryItems).values({
      campaignId: paramsParsed.data.campaignId,
      ...bodyParsed.data,
    }).returning();
    res.status(201).json(item);
  } catch (err) {
    req.log.error({ err }, "Failed to add inventory item");
    res.status(500).json({ error: "Failed to add inventory item" });
  }
});

// Update inventory item
router.put("/campaigns/:campaignId/inventory/:itemId", async (req, res) => {
  const paramsParsed = UpdateInventoryItemParams.safeParse({
    campaignId: req.params.campaignId,
    itemId: req.params.itemId,
  });
  if (!paramsParsed.success) return void res.status(400).json({ error: paramsParsed.error });

  const bodyParsed = UpdateInventoryItemBody.safeParse(req.body);
  if (!bodyParsed.success) return void res.status(400).json({ error: bodyParsed.error });

  try {
    const [updated] = await db.update(inventoryItems)
      .set(bodyParsed.data)
      .where(and(eq(inventoryItems.id, paramsParsed.data.itemId), eq(inventoryItems.campaignId, paramsParsed.data.campaignId)))
      .returning();
    if (!updated) return void res.status(404).json({ error: "Item not found" });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update inventory item");
    res.status(500).json({ error: "Failed to update inventory item" });
  }
});

// Delete inventory item
router.delete("/campaigns/:campaignId/inventory/:itemId", async (req, res) => {
  const paramsParsed = DeleteInventoryItemParams.safeParse({
    campaignId: req.params.campaignId,
    itemId: req.params.itemId,
  });
  if (!paramsParsed.success) return void res.status(400).json({ error: paramsParsed.error });

  try {
    await db.delete(inventoryItems).where(
      and(eq(inventoryItems.id, paramsParsed.data.itemId), eq(inventoryItems.campaignId, paramsParsed.data.campaignId))
    );
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete inventory item");
    res.status(500).json({ error: "Failed to delete inventory item" });
  }
});

export default router;
