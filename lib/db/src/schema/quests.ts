import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaigns } from "./campaigns";

export const quests = pgTable("quests", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: ["active", "completed", "failed"] }).notNull().default("active"),
  isMain: boolean("is_main").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertQuestSchema = createInsertSchema(quests).omit({ id: true, createdAt: true, updatedAt: true });
export type Quest = typeof quests.$inferSelect;
export type InsertQuest = z.infer<typeof insertQuestSchema>;
