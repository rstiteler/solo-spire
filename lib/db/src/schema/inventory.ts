import { pgTable, serial, text, integer, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaigns } from "./campaigns";

export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull().default(1),
  weight: real("weight"),
  isEquipped: boolean("is_equipped").notNull().default(false),
  itemType: text("item_type", { enum: ["weapon", "armor", "consumable", "tool", "treasure", "misc"] }).notNull().default("misc"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({ id: true, createdAt: true });
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
