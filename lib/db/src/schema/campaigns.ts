import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  currentScene: text("current_scene"),
  currentLocation: text("current_location"),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  gold: integer("gold").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({ id: true, createdAt: true, updatedAt: true });
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
