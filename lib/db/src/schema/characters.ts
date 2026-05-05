import { pgTable, serial, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaigns } from "./campaigns";

export const characters = pgTable("characters", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  race: text("race").notNull(),
  class: text("class").notNull(),
  subclass: text("subclass"),
  background: text("background").notNull(),
  alignment: text("alignment"),
  backstory: text("backstory"),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  hp: integer("hp").notNull().default(10),
  maxHp: integer("max_hp").notNull().default(10),
  tempHp: integer("temp_hp").notNull().default(0),
  ac: integer("ac").notNull().default(10),
  speed: integer("speed").notNull().default(30),
  proficiencyBonus: integer("proficiency_bonus").notNull().default(2),
  strength: integer("strength").notNull().default(10),
  dexterity: integer("dexterity").notNull().default(10),
  constitution: integer("constitution").notNull().default(10),
  intelligence: integer("intelligence").notNull().default(10),
  wisdom: integer("wisdom").notNull().default(10),
  charisma: integer("charisma").notNull().default(10),
  skillProficiencies: jsonb("skill_proficiencies").$type<string[]>().notNull().default([]),
  savingThrowProficiencies: jsonb("saving_throw_proficiencies").$type<string[]>().notNull().default([]),
  spellSlots: jsonb("spell_slots").$type<Record<string, number>>(),
  spellSlotsUsed: jsonb("spell_slots_used").$type<Record<string, number>>(),
  knownSpells: jsonb("known_spells").$type<string[]>().notNull().default([]),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  pactBoon: text("pact_boon"),
  invocations: jsonb("invocations").$type<string[]>().notNull().default([]),
  familiar: jsonb("familiar").$type<{ type: string; hp: number; maxHp: number; ac: number } | null>(),
  companion: jsonb("companion").$type<{ mode: string; name: string; primalType?: string; hp: number; maxHp: number; ac: number; attackBonus: number; damage: string } | null>(),
  portraitUrl: text("portrait_url"),
  portraitDescription: text("portrait_description"),
  deathSaves: jsonb("death_saves").$type<{ successes: number; failures: number }>(),
  conditions: jsonb("conditions").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCharacterSchema = createInsertSchema(characters).omit({ id: true, createdAt: true, updatedAt: true });
export type Character = typeof characters.$inferSelect;
export type InsertCharacter = z.infer<typeof insertCharacterSchema>;
