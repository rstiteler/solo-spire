import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateCampaign, useUpdateCharacter, useAddInventoryItem, getGetCampaignQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Dices, Check, Sword, Shield } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type ItemProps = {
  armorType?: "light" | "medium" | "heavy" | "shield";
  acBase?: number;
  stealthDisadvantage?: boolean;
  strengthRequirement?: number;
  damage?: string;
  damageType?: string;
  versatileDamage?: string;
  weaponProperties?: string[];
};

type GearItem = {
  name: string;
  itemType: "weapon" | "armor" | "consumable" | "tool" | "treasure" | "misc";
  quantity?: number;
  description?: string;
  isEquipped?: boolean;
  itemProperties?: ItemProps;
};

type GearPackage = { label: string; items: GearItem[] };

type ClassInfo = {
  name: string;
  icon: string;
  features: string[];
  hitDie: number;
  savingThrows: string[];
  skillChoices: { from: string[]; count: number };
  armorProficiencies: string;
  weaponProficiencies: string;
  spellcastingAbility?: string;
  cantripsKnown?: number;
  spellsKnown?: number;
  spellSlots?: Record<string, number>;
  cantrips?: string[];
  firstLevelSpells?: string[];
  startingGear: GearPackage[];
};

// ─── Data ──────────────────────────────────────────────────────────────────

const ALL_SKILLS = [
  "Acrobatics","Animal Handling","Arcana","Athletics","Deception","History",
  "Insight","Intimidation","Investigation","Medicine","Nature","Perception",
  "Performance","Persuasion","Religion","Sleight of Hand","Stealth","Survival",
];

const RACES = [
  { name: "Human", traits: ["Versatile: +1 to all ability scores", "Extra feat at 1st level", "Extra skill proficiency", "Extra language"] },
  { name: "Elf", traits: ["Darkvision 60ft", "Fey Ancestry: advantage vs charm", "Trance: 4 hours meditation = long rest", "Keen Senses: Perception proficiency"] },
  { name: "Dwarf", traits: ["Darkvision 60ft", "Dwarven Resilience: advantage vs poison", "Stonecunning", "Combat Training: axe & hammer proficiency"] },
  { name: "Halfling", traits: ["Lucky: reroll 1s on d20", "Brave: advantage vs frightened", "Halfling Nimbleness: move through larger creatures", "Naturally Stealthy"] },
  { name: "Half-Elf", traits: ["Darkvision 60ft", "Fey Ancestry", "+2 Charisma, +1 to two other scores", "Two skill proficiencies of choice"] },
  { name: "Tiefling", traits: ["Darkvision 60ft", "Hellish Resistance: fire resistance", "Infernal Legacy: thaumaturgy cantrip", "+2 Charisma, +1 Intelligence"] },
  { name: "Dragonborn", traits: ["Draconic Ancestry: choose dragon type", "Breath Weapon: area damage", "Damage Resistance: matching dragon type", "+2 Strength, +1 Charisma"] },
  { name: "Gnome", traits: ["Darkvision 60ft", "Gnome Cunning: advantage on mental saves vs magic", "Small size", "+2 Intelligence"] },
];

const CLASSES: ClassInfo[] = [
  {
    name: "Fighter", icon: "⚔", hitDie: 10,
    features: ["Second Wind: bonus action self-heal", "Action Surge: extra action 1/rest", "Fighting Style", "Martial weapons & all armor proficiency"],
    savingThrows: ["Strength", "Constitution"],
    skillChoices: { from: ["Acrobatics","Animal Handling","Athletics","History","Insight","Intimidation","Perception","Survival"], count: 2 },
    armorProficiencies: "All armor, shields", weaponProficiencies: "Simple, martial weapons",
    startingGear: [
      { label: "Chain mail & sword", items: [
        { name: "Chain Mail", itemType: "armor", isEquipped: true, itemProperties: { armorType: "heavy", acBase: 16, stealthDisadvantage: true } },
        { name: "Shield", itemType: "armor", isEquipped: true, itemProperties: { armorType: "shield", acBase: 0 } },
        { name: "Longsword", itemType: "weapon", itemProperties: { damage: "1d8", damageType: "slashing", versatileDamage: "1d10", weaponProperties: ["versatile"] } },
        { name: "Light Crossbow", itemType: "weapon", itemProperties: { damage: "1d8", damageType: "piercing", weaponProperties: ["ammunition", "loading"] } },
        { name: "Crossbow Bolts", itemType: "misc", quantity: 20 },
      ]},
      { label: "Leather & longbow", items: [
        { name: "Leather Armor", itemType: "armor", isEquipped: true, itemProperties: { armorType: "light", acBase: 11 } },
        { name: "Longbow", itemType: "weapon", itemProperties: { damage: "1d8", damageType: "piercing", weaponProperties: ["ammunition", "heavy", "two-handed"] } },
        { name: "Arrows", itemType: "misc", quantity: 20 },
        { name: "Handaxe", itemType: "weapon", quantity: 2, itemProperties: { damage: "1d6", damageType: "slashing", weaponProperties: ["light", "thrown"] } },
      ]},
    ],
  },
  {
    name: "Rogue", icon: "🗡", hitDie: 8,
    features: ["Sneak Attack: bonus damage with advantage", "Cunning Action: Dash/Disengage/Hide as bonus action", "Expertise: double proficiency bonus", "Thieves' Cant language"],
    savingThrows: ["Dexterity", "Intelligence"],
    skillChoices: { from: ["Acrobatics","Athletics","Deception","Insight","Intimidation","Investigation","Perception","Performance","Persuasion","Sleight of Hand","Stealth"], count: 4 },
    armorProficiencies: "Light armor", weaponProficiencies: "Simple, hand crossbows, longswords, rapiers, shortswords",
    startingGear: [
      { label: "Sword & thieves' tools", items: [
        { name: "Leather Armor", itemType: "armor", isEquipped: true, itemProperties: { armorType: "light", acBase: 11 } },
        { name: "Shortsword", itemType: "weapon", itemProperties: { damage: "1d6", damageType: "piercing", weaponProperties: ["finesse", "light"] } },
        { name: "Dagger", itemType: "weapon", quantity: 2, itemProperties: { damage: "1d4", damageType: "piercing", weaponProperties: ["finesse", "light", "thrown"] } },
        { name: "Thieves' Tools", itemType: "tool" },
        { name: "Burglar's Pack", itemType: "misc" },
      ]},
      { label: "Shortbow & thieves' tools", items: [
        { name: "Leather Armor", itemType: "armor", isEquipped: true, itemProperties: { armorType: "light", acBase: 11 } },
        { name: "Shortbow", itemType: "weapon", itemProperties: { damage: "1d6", damageType: "piercing", weaponProperties: ["ammunition"] } },
        { name: "Arrows", itemType: "misc", quantity: 20 },
        { name: "Dagger", itemType: "weapon", quantity: 2, itemProperties: { damage: "1d4", damageType: "piercing", weaponProperties: ["finesse", "light", "thrown"] } },
        { name: "Thieves' Tools", itemType: "tool" },
      ]},
    ],
  },
  {
    name: "Wizard", icon: "✦", hitDie: 6,
    features: ["Spellcasting (Intelligence)", "Arcane Recovery: recover spell slots on short rest", "Spellbook: learn new spells", "Cantrips at will"],
    savingThrows: ["Intelligence", "Wisdom"],
    skillChoices: { from: ["Arcana","History","Insight","Investigation","Medicine","Religion"], count: 2 },
    armorProficiencies: "None", weaponProficiencies: "Daggers, darts, slings, quarterstaffs, light crossbows",
    spellcastingAbility: "Intelligence", cantripsKnown: 3, spellsKnown: 6,
    spellSlots: { "1": 2 },
    cantrips: ["Fire Bolt","Mage Hand","Prestidigitation","Ray of Frost","Shocking Grasp","Acid Splash","Chill Touch","Minor Illusion","Poison Spray","Light","Blade Ward","True Strike","Mending","Message"],
    firstLevelSpells: ["Magic Missile","Shield","Sleep","Charm Person","Detect Magic","Mage Armor","Burning Hands","Thunderwave","Feather Fall","Fog Cloud","Grease","Jump","Longstrider","Silent Image","Witch Bolt","Identify","Find Familiar","Comprehend Languages","Absorb Elements","Alarm"],
    startingGear: [
      { label: "Quarterstaff & scholar's pack", items: [
        { name: "Quarterstaff", itemType: "weapon", itemProperties: { damage: "1d6", damageType: "bludgeoning", versatileDamage: "1d8", weaponProperties: ["versatile"] } },
        { name: "Spellbook", itemType: "tool" },
        { name: "Component Pouch", itemType: "tool" },
        { name: "Scholar's Pack", itemType: "misc" },
      ]},
      { label: "Dagger & arcane focus", items: [
        { name: "Dagger", itemType: "weapon", quantity: 2, itemProperties: { damage: "1d4", damageType: "piercing", weaponProperties: ["finesse", "light", "thrown"] } },
        { name: "Arcane Focus", itemType: "tool" },
        { name: "Spellbook", itemType: "tool" },
        { name: "Explorer's Pack", itemType: "misc" },
      ]},
    ],
  },
  {
    name: "Cleric", icon: "☩", hitDie: 8,
    features: ["Spellcasting (Wisdom)", "Divine Domain features", "Channel Divinity: powerful divine effects", "Turn Undead"],
    savingThrows: ["Wisdom", "Charisma"],
    skillChoices: { from: ["History","Insight","Medicine","Persuasion","Religion"], count: 2 },
    armorProficiencies: "Light, medium, shields", weaponProficiencies: "Simple weapons",
    spellcastingAbility: "Wisdom", cantripsKnown: 3, spellsKnown: 4,
    spellSlots: { "1": 2 },
    cantrips: ["Sacred Flame","Guidance","Thaumaturgy","Light","Spare the Dying","Resistance","Toll the Dead","Word of Radiance","Mending","Inflict Wounds"],
    firstLevelSpells: ["Cure Wounds","Healing Word","Guiding Bolt","Bless","Command","Shield of Faith","Inflict Wounds","Detect Magic","Detect Evil and Good","Sanctuary","Protection from Evil and Good","Thunderwave","Faerie Fire","Purify Food and Drink","Create or Destroy Water"],
    startingGear: [
      { label: "Chain mail & holy symbol", items: [
        { name: "Mace", itemType: "weapon", itemProperties: { damage: "1d6", damageType: "bludgeoning" } },
        { name: "Chain Mail", itemType: "armor", isEquipped: true, itemProperties: { armorType: "heavy", acBase: 16, stealthDisadvantage: true } },
        { name: "Shield", itemType: "armor", isEquipped: true, itemProperties: { armorType: "shield", acBase: 0 } },
        { name: "Holy Symbol", itemType: "tool" },
        { name: "Priest's Pack", itemType: "misc" },
      ]},
      { label: "Scale mail & explorer's pack", items: [
        { name: "Mace", itemType: "weapon", itemProperties: { damage: "1d6", damageType: "bludgeoning" } },
        { name: "Scale Mail", itemType: "armor", isEquipped: true, itemProperties: { armorType: "medium", acBase: 14, stealthDisadvantage: true } },
        { name: "Shield", itemType: "armor", isEquipped: true, itemProperties: { armorType: "shield", acBase: 0 } },
        { name: "Holy Symbol", itemType: "tool" },
        { name: "Explorer's Pack", itemType: "misc" },
      ]},
    ],
  },
  {
    name: "Ranger", icon: "◎", hitDie: 10,
    features: ["Spellcasting at level 2 (Wisdom)", "Favored Enemy: advantage vs creature type", "Natural Explorer: expertise in favored terrain", "Two-Weapon Fighting"],
    savingThrows: ["Strength", "Dexterity"],
    skillChoices: { from: ["Animal Handling","Athletics","Insight","Investigation","Nature","Perception","Stealth","Survival"], count: 3 },
    armorProficiencies: "Light, medium, shields", weaponProficiencies: "Simple, martial weapons",
    startingGear: [
      { label: "Scale mail & shortswords", items: [
        { name: "Scale Mail", itemType: "armor", isEquipped: true, itemProperties: { armorType: "medium", acBase: 14, stealthDisadvantage: true } },
        { name: "Shortsword", itemType: "weapon", quantity: 2, itemProperties: { damage: "1d6", damageType: "piercing", weaponProperties: ["finesse", "light"] } },
        { name: "Longbow", itemType: "weapon", itemProperties: { damage: "1d8", damageType: "piercing", weaponProperties: ["ammunition", "heavy", "two-handed"] } },
        { name: "Arrows", itemType: "misc", quantity: 20 },
        { name: "Dungeoneer's Pack", itemType: "misc" },
      ]},
      { label: "Leather & longbow", items: [
        { name: "Leather Armor", itemType: "armor", isEquipped: true, itemProperties: { armorType: "light", acBase: 11 } },
        { name: "Shortsword", itemType: "weapon", quantity: 2, itemProperties: { damage: "1d6", damageType: "piercing", weaponProperties: ["finesse", "light"] } },
        { name: "Longbow", itemType: "weapon", itemProperties: { damage: "1d8", damageType: "piercing", weaponProperties: ["ammunition", "heavy", "two-handed"] } },
        { name: "Arrows", itemType: "misc", quantity: 20 },
        { name: "Explorer's Pack", itemType: "misc" },
      ]},
    ],
  },
  {
    name: "Paladin", icon: "✦", hitDie: 10,
    features: ["Divine Smite at level 2", "Lay on Hands: healing pool", "Divine Sense: detect evil", "All armor & weapon proficiency"],
    savingThrows: ["Wisdom", "Charisma"],
    skillChoices: { from: ["Athletics","Insight","Intimidation","Medicine","Persuasion","Religion"], count: 2 },
    armorProficiencies: "All armor, shields", weaponProficiencies: "Simple, martial weapons",
    startingGear: [
      { label: "Chain mail, sword & shield", items: [
        { name: "Chain Mail", itemType: "armor", isEquipped: true, itemProperties: { armorType: "heavy", acBase: 16, stealthDisadvantage: true } },
        { name: "Longsword", itemType: "weapon", itemProperties: { damage: "1d8", damageType: "slashing", versatileDamage: "1d10", weaponProperties: ["versatile"] } },
        { name: "Shield", itemType: "armor", isEquipped: true, itemProperties: { armorType: "shield", acBase: 0 } },
        { name: "Holy Symbol", itemType: "tool" },
        { name: "Explorer's Pack", itemType: "misc" },
      ]},
      { label: "Chain mail, sword & javelins", items: [
        { name: "Chain Mail", itemType: "armor", isEquipped: true, itemProperties: { armorType: "heavy", acBase: 16, stealthDisadvantage: true } },
        { name: "Longsword", itemType: "weapon", itemProperties: { damage: "1d8", damageType: "slashing", versatileDamage: "1d10", weaponProperties: ["versatile"] } },
        { name: "Javelin", itemType: "weapon", quantity: 5, itemProperties: { damage: "1d6", damageType: "piercing", weaponProperties: ["thrown"] } },
        { name: "Holy Symbol", itemType: "tool" },
        { name: "Explorer's Pack", itemType: "misc" },
      ]},
    ],
  },
  {
    name: "Barbarian", icon: "⬡", hitDie: 12,
    features: ["Rage: bonus damage & resistance", "Unarmored Defense: AC = 10 + DEX + CON", "Reckless Attack", "Danger Sense: advantage on DEX saves"],
    savingThrows: ["Strength", "Constitution"],
    skillChoices: { from: ["Animal Handling","Athletics","Intimidation","Nature","Perception","Survival"], count: 2 },
    armorProficiencies: "Light, medium, shields", weaponProficiencies: "Simple, martial weapons",
    startingGear: [
      { label: "Greataxe & explorer's pack", items: [
        { name: "Greataxe", itemType: "weapon", itemProperties: { damage: "1d12", damageType: "slashing", weaponProperties: ["heavy", "two-handed"] } },
        { name: "Handaxe", itemType: "weapon", quantity: 2, itemProperties: { damage: "1d6", damageType: "slashing", weaponProperties: ["light", "thrown"] } },
        { name: "Explorer's Pack", itemType: "misc" },
        { name: "Javelin", itemType: "weapon", quantity: 4, itemProperties: { damage: "1d6", damageType: "piercing", weaponProperties: ["thrown"] } },
      ]},
      { label: "Longsword & handaxes", items: [
        { name: "Longsword", itemType: "weapon", itemProperties: { damage: "1d8", damageType: "slashing", versatileDamage: "1d10", weaponProperties: ["versatile"] } },
        { name: "Handaxe", itemType: "weapon", quantity: 2, itemProperties: { damage: "1d6", damageType: "slashing", weaponProperties: ["light", "thrown"] } },
        { name: "Explorer's Pack", itemType: "misc" },
        { name: "Javelin", itemType: "weapon", quantity: 4, itemProperties: { damage: "1d6", damageType: "piercing", weaponProperties: ["thrown"] } },
      ]},
    ],
  },
  {
    name: "Druid", icon: "✿", hitDie: 8,
    features: ["Spellcasting (Wisdom)", "Wild Shape: transform into beasts", "Druidic language", "Ritual Casting"],
    savingThrows: ["Intelligence", "Wisdom"],
    skillChoices: { from: ["Arcana","Animal Handling","Insight","Medicine","Nature","Perception","Religion","Survival"], count: 2 },
    armorProficiencies: "Light, medium (non-metal), shields (non-metal)", weaponProficiencies: "Clubs, daggers, darts, javelins, maces, quarterstaffs, scimitars, sickles, slings, spears",
    spellcastingAbility: "Wisdom", cantripsKnown: 2, spellsKnown: 4,
    spellSlots: { "1": 2 },
    cantrips: ["Druidcraft","Guidance","Mending","Poison Spray","Produce Flame","Resistance","Shillelagh","Thorn Whip"],
    firstLevelSpells: ["Cure Wounds","Entangle","Faerie Fire","Fog Cloud","Healing Word","Detect Magic","Detect Poison and Disease","Jump","Longstrider","Speak with Animals","Thunderwave","Animal Friendship","Charm Person","Create or Destroy Water","Goodberry"],
    startingGear: [
      { label: "Shield & scimitar", items: [
        { name: "Wooden Shield", itemType: "armor", isEquipped: true, itemProperties: { armorType: "shield", acBase: 0 } },
        { name: "Scimitar", itemType: "weapon", itemProperties: { damage: "1d6", damageType: "slashing", weaponProperties: ["finesse", "light"] } },
        { name: "Leather Armor", itemType: "armor", isEquipped: true, itemProperties: { armorType: "light", acBase: 11 } },
        { name: "Explorer's Pack", itemType: "misc" },
        { name: "Druidic Focus", itemType: "tool" },
      ]},
      { label: "Club & explorer's pack", items: [
        { name: "Club", itemType: "weapon", itemProperties: { damage: "1d4", damageType: "bludgeoning", weaponProperties: ["light"] } },
        { name: "Leather Armor", itemType: "armor", isEquipped: true, itemProperties: { armorType: "light", acBase: 11 } },
        { name: "Explorer's Pack", itemType: "misc" },
        { name: "Druidic Focus", itemType: "tool" },
      ]},
    ],
  },
  {
    name: "Bard", icon: "♪", hitDie: 8,
    features: ["Spellcasting (Charisma)", "Bardic Inspiration: bonus to ally rolls", "Jack of All Trades: half proficiency to all skills", "Song of Rest"],
    savingThrows: ["Dexterity", "Charisma"],
    skillChoices: { from: ALL_SKILLS, count: 3 },
    armorProficiencies: "Light armor", weaponProficiencies: "Simple, hand crossbows, longswords, rapiers, shortswords",
    spellcastingAbility: "Charisma", cantripsKnown: 2, spellsKnown: 4,
    spellSlots: { "1": 2 },
    cantrips: ["Vicious Mockery","Blade Ward","Dancing Lights","Friends","Light","Mage Hand","Mending","Message","Minor Illusion","Prestidigitation","True Strike"],
    firstLevelSpells: ["Charm Person","Cure Wounds","Detect Magic","Disguise Self","Faerie Fire","Feather Fall","Healing Word","Heroism","Longstrider","Silent Image","Sleep","Speak with Animals","Thunderwave","Tasha's Hideous Laughter","Comprehend Languages","Dissonant Whispers","Earth Tremor","Animal Friendship"],
    startingGear: [
      { label: "Rapier & diplomat's pack", items: [
        { name: "Rapier", itemType: "weapon", itemProperties: { damage: "1d8", damageType: "piercing", weaponProperties: ["finesse"] } },
        { name: "Leather Armor", itemType: "armor", isEquipped: true, itemProperties: { armorType: "light", acBase: 11 } },
        { name: "Diplomat's Pack", itemType: "misc" },
        { name: "Lute", itemType: "tool" },
      ]},
      { label: "Longsword & entertainer's pack", items: [
        { name: "Longsword", itemType: "weapon", itemProperties: { damage: "1d8", damageType: "slashing", versatileDamage: "1d10", weaponProperties: ["versatile"] } },
        { name: "Leather Armor", itemType: "armor", isEquipped: true, itemProperties: { armorType: "light", acBase: 11 } },
        { name: "Entertainer's Pack", itemType: "misc" },
        { name: "Lute", itemType: "tool" },
      ]},
    ],
  },
  {
    name: "Warlock", icon: "◈", hitDie: 8,
    features: ["Eldritch Blast cantrip", "Pact Magic: few but recovering spell slots", "Eldritch Invocations", "Patron: otherworldly benefactor"],
    savingThrows: ["Wisdom", "Charisma"],
    skillChoices: { from: ["Arcana","Deception","History","Intimidation","Investigation","Nature","Religion"], count: 2 },
    armorProficiencies: "Light armor", weaponProficiencies: "Simple weapons",
    spellcastingAbility: "Charisma", cantripsKnown: 2, spellsKnown: 2,
    spellSlots: { "1": 1 },
    cantrips: ["Eldritch Blast","Blade Ward","Chill Touch","Friends","Mage Hand","Minor Illusion","Poison Spray","Prestidigitation","True Strike","Booming Blade","Green-Flame Blade"],
    firstLevelSpells: ["Armor of Agathys","Arms of Hadar","Charm Person","Comprehend Languages","Expeditious Retreat","Hellish Rebuke","Hex","Protection from Evil and Good","Unseen Servant","Witch Bolt","Cause Fear","Wrathful Smite"],
    startingGear: [
      { label: "Crossbow & scholar's pack", items: [
        { name: "Light Crossbow", itemType: "weapon", itemProperties: { damage: "1d8", damageType: "piercing", weaponProperties: ["ammunition", "loading"] } },
        { name: "Crossbow Bolts", itemType: "misc", quantity: 20 },
        { name: "Leather Armor", itemType: "armor", isEquipped: true, itemProperties: { armorType: "light", acBase: 11 } },
        { name: "Component Pouch", itemType: "tool" },
        { name: "Scholar's Pack", itemType: "misc" },
        { name: "Dagger", itemType: "weapon", quantity: 2, itemProperties: { damage: "1d4", damageType: "piercing", weaponProperties: ["finesse", "light", "thrown"] } },
      ]},
      { label: "Dagger & dungeon's pack", items: [
        { name: "Dagger", itemType: "weapon", quantity: 2, itemProperties: { damage: "1d4", damageType: "piercing", weaponProperties: ["finesse", "light", "thrown"] } },
        { name: "Leather Armor", itemType: "armor", isEquipped: true, itemProperties: { armorType: "light", acBase: 11 } },
        { name: "Arcane Focus", itemType: "tool" },
        { name: "Dungeoneer's Pack", itemType: "misc" },
      ]},
    ],
  },
  {
    name: "Sorcerer", icon: "✧", hitDie: 6,
    features: ["Spellcasting (Charisma)", "Sorcery Points: flexible spell resource", "Metamagic: enhance spell casting", "Font of Magic"],
    savingThrows: ["Constitution", "Charisma"],
    skillChoices: { from: ["Arcana","Deception","Insight","Intimidation","Persuasion","Religion"], count: 2 },
    armorProficiencies: "None", weaponProficiencies: "Daggers, darts, slings, quarterstaffs, light crossbows",
    spellcastingAbility: "Charisma", cantripsKnown: 4, spellsKnown: 2,
    spellSlots: { "1": 2 },
    cantrips: ["Fire Bolt","Acid Splash","Blade Ward","Chill Touch","Dancing Lights","Friends","Light","Mage Hand","Mending","Message","Minor Illusion","Poison Spray","Prestidigitation","Ray of Frost","Shocking Grasp","True Strike","Thunderclap","Booming Blade"],
    firstLevelSpells: ["Burning Hands","Charm Person","Chromatic Orb","Color Spray","Comprehend Languages","Detect Magic","Disguise Self","Expeditious Retreat","False Life","Feather Fall","Fog Cloud","Jump","Mage Armor","Magic Missile","Shield","Silent Image","Sleep","Thunderwave","Witch Bolt","Absorb Elements"],
    startingGear: [
      { label: "Crossbow & dungeoneer's pack", items: [
        { name: "Light Crossbow", itemType: "weapon", itemProperties: { damage: "1d8", damageType: "piercing", weaponProperties: ["ammunition", "loading"] } },
        { name: "Crossbow Bolts", itemType: "misc", quantity: 20 },
        { name: "Component Pouch", itemType: "tool" },
        { name: "Dungeoneer's Pack", itemType: "misc" },
        { name: "Dagger", itemType: "weapon", quantity: 2, itemProperties: { damage: "1d4", damageType: "piercing", weaponProperties: ["finesse", "light", "thrown"] } },
      ]},
      { label: "Dagger & arcane focus", items: [
        { name: "Dagger", itemType: "weapon", quantity: 2, itemProperties: { damage: "1d4", damageType: "piercing", weaponProperties: ["finesse", "light", "thrown"] } },
        { name: "Arcane Focus", itemType: "tool" },
        { name: "Dungeoneer's Pack", itemType: "misc" },
      ]},
    ],
  },
  {
    name: "Monk", icon: "◯", hitDie: 8,
    features: ["Martial Arts: unarmed strike die", "Ki Points: fuel special abilities", "Unarmored Defense: AC = 10 + DEX + WIS", "Unarmored Movement: increased speed"],
    savingThrows: ["Strength", "Dexterity"],
    skillChoices: { from: ["Acrobatics","Athletics","History","Insight","Religion","Stealth"], count: 2 },
    armorProficiencies: "None (Unarmored Defense)", weaponProficiencies: "Simple weapons, shortswords",
    startingGear: [
      { label: "Shortsword & dungeoneer's pack", items: [
        { name: "Shortsword", itemType: "weapon", itemProperties: { damage: "1d6", damageType: "piercing", weaponProperties: ["finesse", "light"] } },
        { name: "Dungeoneer's Pack", itemType: "misc" },
        { name: "Dart", itemType: "weapon", quantity: 10, itemProperties: { damage: "1d4", damageType: "piercing", weaponProperties: ["finesse", "thrown"] } },
      ]},
      { label: "Quarterstaff & explorer's pack", items: [
        { name: "Quarterstaff", itemType: "weapon", itemProperties: { damage: "1d6", damageType: "bludgeoning", versatileDamage: "1d8", weaponProperties: ["versatile"] } },
        { name: "Explorer's Pack", itemType: "misc" },
        { name: "Dart", itemType: "weapon", quantity: 10, itemProperties: { damage: "1d4", damageType: "piercing", weaponProperties: ["finesse", "thrown"] } },
      ]},
    ],
  },
];

const BACKGROUNDS = ["Acolyte","Charlatan","Criminal","Entertainer","Folk Hero","Guild Artisan","Hermit","Noble","Outlander","Sage","Sailor","Soldier","Urchin"];
const ALIGNMENTS = ["Lawful Good","Neutral Good","Chaotic Good","Lawful Neutral","True Neutral","Chaotic Neutral","Lawful Evil","Neutral Evil","Chaotic Evil"];

const BASE_STATS = { strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8 };
const STAT_KEYS = ["strength","dexterity","constitution","intelligence","wisdom","charisma"] as const;
type StatKey = typeof STAT_KEYS[number];

// Standard D&D 5e racial ability score increases
const RACE_BONUSES: Record<string, Partial<Record<StatKey, number>>> = {
  Human:       { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1 },
  Elf:         { dexterity: 2, intelligence: 1 },
  Dwarf:       { constitution: 2, wisdom: 1 },
  Halfling:    { dexterity: 2 },
  "Half-Elf":  { charisma: 2, dexterity: 1, constitution: 1 },
  Tiefling:    { charisma: 2, intelligence: 1 },
  Dragonborn:  { strength: 2, charisma: 1 },
  Gnome:       { intelligence: 2 },
};

function rollAbilityScore(): number {
  const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
  rolls.sort((a, b) => a - b);
  return rolls.slice(1).reduce((a, b) => a + b, 0);
}
function mod(score: number): number { return Math.floor((score - 10) / 2); }
function modStr(score: number): string { const m = mod(score); return m >= 0 ? `+${m}` : String(m); }

const TOTAL_POINTS = 27;
const COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

function calcInitialAC(dex: number, gearItems: GearItem[]): number {
  const dexMod = mod(dex);
  let baseAC = 10 + dexMod;
  let shieldBonus = 0;
  let hasArmor = false;
  for (const item of gearItems.filter(i => i.isEquipped && i.itemProperties?.armorType)) {
    const props = item.itemProperties!;
    if (props.armorType === "shield") { shieldBonus = 2; continue; }
    hasArmor = true;
    if (props.armorType === "light") baseAC = (props.acBase ?? 11) + dexMod;
    else if (props.armorType === "medium") baseAC = (props.acBase ?? 13) + Math.min(dexMod, 2);
    else if (props.armorType === "heavy") baseAC = props.acBase ?? 16;
  }
  if (!hasArmor) { /* keep unarmored */ }
  return baseAC + shieldBonus;
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function CampaignNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createCampaign = useCreateCampaign();
  const updateCharacter = useUpdateCharacter();
  const addItem = useAddInventoryItem();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    campaignName: "",
    characterName: "",
    background: "Folk Hero",
    alignment: "True Neutral",
    backstory: "",
    race: "",
    class: "",
    usePointBuy: true,
    stats: { ...BASE_STATS },
    rolledStats: null as null | Record<StatKey, number>,
    selectedSkills: [] as string[],
    gearPackageIndex: 0,
    selectedCantrips: [] as string[],
    selectedSpells: [] as string[],
  });

  const classInfo = CLASSES.find(c => c.name === form.class);
  const isSpellcaster = !!classInfo?.spellcastingAbility;
  const pointsSpent = STAT_KEYS.reduce((acc, k) => acc + (COST[form.stats[k]] ?? 0), 0);
  const pointsRemaining = TOTAL_POINTS - pointsSpent;

  // Base stats + racial bonuses = final stats saved to DB
  const raceBonuses = RACE_BONUSES[form.race || "Human"] ?? {};
  const finalStats = STAT_KEYS.reduce((acc, k) => ({
    ...acc, [k]: form.stats[k] + (raceBonuses[k] ?? 0),
  }), {} as Record<StatKey, number>);

  function setField<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function setStat(k: StatKey, v: number) {
    const newStats = { ...form.stats, [k]: v };
    const newCost = STAT_KEYS.reduce((acc, key) => acc + (COST[newStats[key]] ?? 0), 0);
    if (newCost <= TOTAL_POINTS && v >= 8 && v <= 15) setForm(f => ({ ...f, stats: newStats }));
  }

  function rollAll() {
    const rolled = STAT_KEYS.reduce((acc, k) => ({ ...acc, [k]: rollAbilityScore() }), {} as Record<StatKey, number>);
    setForm(f => ({ ...f, rolledStats: rolled, stats: rolled, usePointBuy: false }));
  }

  function toggleSkill(skill: string) {
    const max = classInfo?.skillChoices.count ?? 2;
    setForm(f => {
      if (f.selectedSkills.includes(skill)) return { ...f, selectedSkills: f.selectedSkills.filter(s => s !== skill) };
      if (f.selectedSkills.length >= max) return f;
      return { ...f, selectedSkills: [...f.selectedSkills, skill] };
    });
  }

  function toggleSpell(spell: string, type: "cantrip" | "spell") {
    if (type === "cantrip") {
      const max = classInfo?.cantripsKnown ?? 2;
      setForm(f => {
        if (f.selectedCantrips.includes(spell)) return { ...f, selectedCantrips: f.selectedCantrips.filter(s => s !== spell) };
        if (f.selectedCantrips.length >= max) return f;
        return { ...f, selectedCantrips: [...f.selectedCantrips, spell] };
      });
    } else {
      const max = classInfo?.spellsKnown ?? 2;
      setForm(f => {
        if (f.selectedSpells.includes(spell)) return { ...f, selectedSpells: f.selectedSpells.filter(s => s !== spell) };
        if (f.selectedSpells.length >= max) return f;
        return { ...f, selectedSpells: [...f.selectedSpells, spell] };
      });
    }
  }

  function canAdvance(): boolean {
    if (step === 3 && form.class) {
      const max = classInfo?.skillChoices.count ?? 2;
      return form.selectedSkills.length === max;
    }
    return true;
  }

  async function handleFinish() {
    try {
      const selectedClass = classInfo;
      const gearItems = selectedClass?.startingGear[form.gearPackageIndex]?.items ?? [];
      const initialAC = calcInitialAC(finalStats.dexterity, gearItems);

      const campaign = await createCampaign.mutateAsync({ data: { name: form.campaignName || "The Unnamed Quest" } });

      const knownSpells = [...form.selectedCantrips, ...form.selectedSpells];

      await updateCharacter.mutateAsync({
        campaignId: campaign.id,
        data: {
          name: form.characterName || "The Nameless One",
          race: form.race || "Human",
          class: form.class || "Fighter",
          background: form.background,
          alignment: form.alignment,
          backstory: form.backstory || null,
          strength: finalStats.strength,
          dexterity: finalStats.dexterity,
          constitution: finalStats.constitution,
          intelligence: finalStats.intelligence,
          wisdom: finalStats.wisdom,
          charisma: finalStats.charisma,
          level: 1,
          xp: 0,
          hp: (selectedClass?.hitDie ?? 10) + mod(finalStats.constitution),
          maxHp: (selectedClass?.hitDie ?? 10) + mod(finalStats.constitution),
          ac: initialAC,
          speed: 30,
          proficiencyBonus: 2,
          tempHp: 0,
          skillProficiencies: form.selectedSkills,
          savingThrowProficiencies: selectedClass?.savingThrows ?? [],
          knownSpells,
          spellSlots: selectedClass?.spellSlots ?? undefined,
          spellSlotsUsed: selectedClass?.spellSlots ? Object.fromEntries(Object.keys(selectedClass.spellSlots).map(k => [k, 0])) : undefined,
        },
      });

      // Add all starting gear items
      for (const item of gearItems) {
        await addItem.mutateAsync({
          campaignId: campaign.id,
          data: {
            name: item.name,
            itemType: item.itemType,
            quantity: item.quantity ?? 1,
            isEquipped: item.isEquipped ?? false,
            description: item.description ?? null,
            itemProperties: item.itemProperties ?? null,
          },
        });
      }

      await queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaign.id) });
      setLocation(`/campaign/${campaign.id}`);
    } catch {
      toast({ title: "Failed to create campaign", variant: "destructive" });
    }
  }

  const STEPS = ["Basics", "Race", "Class & Skills", "Equipment & Spells", "Ability Scores", "Confirm"];
  const isLastStep = step === STEPS.length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto py-8 px-6">
        <button onClick={() => setLocation("/")} className="flex items-center gap-2 text-muted-foreground hover:text-primary mb-6 text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Campaigns
        </button>
        <h1 className="font-serif text-3xl font-bold text-primary mb-2">Begin a New Adventure</h1>
        <p className="text-muted-foreground mb-8">Forge your legend. Every hero's tale starts here.</p>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-10 overflow-x-auto pb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5 flex-shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${step > i + 1 ? "bg-primary border-primary text-primary-foreground" : step === i + 1 ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                {step > i + 1 ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span className={`text-xs hidden sm:block whitespace-nowrap ${step === i + 1 ? "text-primary" : "text-muted-foreground"}`}>{s}</span>
              {i < STEPS.length - 1 && <div className={`h-px w-4 flex-shrink-0 ${step > i + 1 ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Basics ── */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="font-serif text-xl text-foreground">Your Identity</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="campaignName" className="text-muted-foreground text-sm">Campaign Name</Label>
                <Input id="campaignName" data-testid="input-campaign-name" placeholder="The Curse of Strahd, Dungeon of the Mad Mage..." value={form.campaignName} onChange={e => setField("campaignName", e.target.value)} className="mt-1 bg-card border-border text-foreground placeholder:text-muted-foreground/50" />
              </div>
              <div>
                <Label htmlFor="charName" className="text-muted-foreground text-sm">Character Name</Label>
                <Input id="charName" data-testid="input-character-name" placeholder="What do they call you, wanderer?" value={form.characterName} onChange={e => setField("characterName", e.target.value)} className="mt-1 bg-card border-border text-foreground placeholder:text-muted-foreground/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-sm">Background</Label>
                  <select data-testid="select-background" value={form.background} onChange={e => setField("background", e.target.value)} className="mt-1 w-full bg-card border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                    {BACKGROUNDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Alignment</Label>
                  <select data-testid="select-alignment" value={form.alignment} onChange={e => setField("alignment", e.target.value)} className="mt-1 w-full bg-card border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                    {ALIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="backstory" className="text-muted-foreground text-sm">Backstory (optional)</Label>
                <Textarea id="backstory" data-testid="input-backstory" placeholder="A wandering mercenary, haunted by a past they cannot outrun..." value={form.backstory} onChange={e => setField("backstory", e.target.value)} rows={4} className="mt-1 bg-card border-border text-foreground placeholder:text-muted-foreground/50 resize-none" />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Race ── */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="font-serif text-xl text-foreground">Choose Your Race</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {RACES.map(r => (
                <button key={r.name} data-testid={`button-race-${r.name.toLowerCase()}`} onClick={() => setField("race", r.name)} className={`p-4 rounded border text-left transition-all ${form.race === r.name ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:border-primary/50"}`}>
                  <div className="font-serif font-semibold text-sm">{r.name}</div>
                </button>
              ))}
            </div>
            {form.race && (
              <div className="bg-card border border-border rounded p-4">
                <h3 className="font-serif text-primary mb-2">{form.race} Traits</h3>
                <ul className="space-y-1">
                  {RACES.find(r => r.name === form.race)?.traits.map(t => (
                    <li key={t} className="text-sm text-muted-foreground flex gap-2"><span className="text-primary mt-0.5">•</span> {t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Class & Skills ── */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="font-serif text-xl text-foreground">Choose Your Class</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CLASSES.map(c => (
                <button key={c.name} data-testid={`button-class-${c.name.toLowerCase()}`}
                  onClick={() => { setField("class", c.name); setField("selectedSkills", []); setField("selectedCantrips", []); setField("selectedSpells", []); }}
                  className={`p-4 rounded border text-left transition-all ${form.class === c.name ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:border-primary/50"}`}>
                  <div className="text-lg mb-1">{c.icon}</div>
                  <div className="font-serif font-semibold text-sm">{c.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">d{c.hitDie}</div>
                </button>
              ))}
            </div>

            {classInfo && (
              <>
                {/* Class features info */}
                <div className="bg-card border border-border rounded p-4 space-y-3">
                  <h3 className="font-serif text-primary">{classInfo.name} Features</h3>
                  <ul className="space-y-1">
                    {classInfo.features.map(f => <li key={f} className="text-sm text-muted-foreground flex gap-2"><span className="text-primary mt-0.5">•</span> {f}</li>)}
                  </ul>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                    <div><span className="text-foreground/70 font-medium">Saving Throws:</span> {classInfo.savingThrows.join(", ")}</div>
                    <div><span className="text-foreground/70 font-medium">Armor:</span> {classInfo.armorProficiencies}</div>
                    <div className="col-span-2"><span className="text-foreground/70 font-medium">Weapons:</span> {classInfo.weaponProficiencies}</div>
                  </div>
                </div>

                {/* Skill proficiency selection */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-serif text-foreground">Skill Proficiencies</h3>
                    <span className={`text-sm font-medium ${form.selectedSkills.length === classInfo.skillChoices.count ? "text-primary" : "text-muted-foreground"}`}>
                      {form.selectedSkills.length} / {classInfo.skillChoices.count} selected
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">Choose {classInfo.skillChoices.count} skill{classInfo.skillChoices.count > 1 ? "s" : ""} from your class list.</p>
                  <div className="flex flex-wrap gap-2">
                    {classInfo.skillChoices.from.map(skill => {
                      const selected = form.selectedSkills.includes(skill);
                      const maxed = form.selectedSkills.length >= classInfo.skillChoices.count;
                      return (
                        <button key={skill} onClick={() => toggleSkill(skill)}
                          disabled={!selected && maxed}
                          className={`px-3 py-1.5 rounded border text-xs font-medium transition-all ${selected ? "border-primary bg-primary/10 text-primary" : maxed ? "border-border/40 bg-card/40 text-muted-foreground/40 cursor-not-allowed" : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}>
                          {skill}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Step 4: Equipment & Spells ── */}
        {step === 4 && (
          <div className="space-y-8">
            {/* Starting Gear */}
            <div>
              <h2 className="font-serif text-xl text-foreground mb-1">Starting Equipment</h2>
              <p className="text-muted-foreground text-sm mb-4">Choose your starting gear package. Armor is equipped automatically and sets your AC.</p>
              <div className="space-y-3">
                {(classInfo?.startingGear ?? []).map((pkg, idx) => {
                  const selected = form.gearPackageIndex === idx;
                  return (
                    <button key={idx} onClick={() => setField("gearPackageIndex", idx)}
                      className={`w-full rounded border p-4 text-left transition-all ${selected ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50"}`}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selected ? "border-primary" : "border-border"}`}>
                          {selected && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <span className={`font-serif font-semibold text-sm capitalize ${selected ? "text-primary" : "text-foreground"}`}>Option {idx + 1}: {pkg.label}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {pkg.items.map((item, i) => {
                          const hasArmor = item.itemProperties?.armorType && item.itemProperties.armorType !== "shield";
                          const isShield = item.itemProperties?.armorType === "shield";
                          const hasDmg = item.itemProperties?.damage;
                          return (
                            <div key={i} className="flex items-center gap-1 bg-background/50 border border-border/50 rounded px-2 py-1">
                              {hasArmor ? <Shield className="w-3 h-3 text-primary/60" /> : hasDmg ? <Sword className="w-3 h-3 text-primary/60" /> : isShield ? <Shield className="w-3 h-3 text-primary/40" /> : null}
                              <span className="text-xs text-foreground">{item.quantity && item.quantity > 1 ? `${item.quantity}× ` : ""}{item.name}</span>
                              {hasArmor && <span className="text-xs text-primary/70">AC {item.itemProperties?.acBase}{item.itemProperties?.armorType === "light" ? "+DEX" : item.itemProperties?.armorType === "medium" ? "+DEX(max 2)" : ""}</span>}
                              {hasDmg && <span className="text-xs text-muted-foreground">{item.itemProperties?.damage} {item.itemProperties?.damageType}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
              {classInfo && (
                <p className="text-xs text-muted-foreground mt-3 bg-card border border-border/50 rounded p-2">
                  <strong className="text-foreground/70">Starting AC with this package:</strong>{" "}
                  <span className="text-primary font-bold">
                    {calcInitialAC(form.stats.dexterity, classInfo.startingGear[form.gearPackageIndex]?.items ?? [])}
                  </span>
                  <span className="text-muted-foreground/60"> (based on DEX {modStr(form.stats.dexterity)})</span>
                </p>
              )}
            </div>

            {/* Spells — only for spellcasters */}
            {isSpellcaster && classInfo && (
              <>
                {/* Cantrips */}
                {classInfo.cantrips && classInfo.cantripsKnown && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-serif text-foreground">Cantrips</h3>
                      <span className={`text-sm font-medium ${form.selectedCantrips.length === classInfo.cantripsKnown ? "text-primary" : "text-muted-foreground"}`}>
                        {form.selectedCantrips.length} / {classInfo.cantripsKnown}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">Cantrips are at-will spells — no spell slots required.</p>
                    <div className="flex flex-wrap gap-2">
                      {classInfo.cantrips.map(spell => {
                        const selected = form.selectedCantrips.includes(spell);
                        const maxed = form.selectedCantrips.length >= classInfo.cantripsKnown!;
                        return (
                          <button key={spell} onClick={() => toggleSpell(spell, "cantrip")}
                            disabled={!selected && maxed}
                            className={`px-3 py-1.5 rounded border text-xs font-medium transition-all ${selected ? "border-primary bg-primary/10 text-primary" : maxed ? "border-border/40 bg-card/40 text-muted-foreground/40 cursor-not-allowed" : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}>
                            {spell}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 1st level spells */}
                {classInfo.firstLevelSpells && classInfo.spellsKnown && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-serif text-foreground">1st Level Spells</h3>
                      <span className={`text-sm font-medium ${form.selectedSpells.length === classInfo.spellsKnown ? "text-primary" : "text-muted-foreground"}`}>
                        {form.selectedSpells.length} / {classInfo.spellsKnown} known
                        {classInfo.spellSlots && <span className="text-muted-foreground/60"> · {Object.values(classInfo.spellSlots)[0]} slot{Object.values(classInfo.spellSlots)[0] > 1 ? "s" : ""}</span>}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">These spells consume spell slots when cast. Choose wisely.</p>
                    <div className="flex flex-wrap gap-2">
                      {classInfo.firstLevelSpells.map(spell => {
                        const selected = form.selectedSpells.includes(spell);
                        const maxed = form.selectedSpells.length >= classInfo.spellsKnown!;
                        return (
                          <button key={spell} onClick={() => toggleSpell(spell, "spell")}
                            disabled={!selected && maxed}
                            className={`px-3 py-1.5 rounded border text-xs font-medium transition-all ${selected ? "border-primary bg-primary/10 text-primary" : maxed ? "border-border/40 bg-card/40 text-muted-foreground/40 cursor-not-allowed" : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}>
                            {spell}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Step 5: Ability Scores ── */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl text-foreground">Ability Scores</h2>
              <div className="flex gap-2">
                <Button size="sm" variant={form.usePointBuy ? "default" : "outline"}
                  onClick={() => setForm(f => ({ ...f, usePointBuy: true, stats: { ...BASE_STATS } }))}
                  data-testid="button-point-buy" className="text-xs">Point Buy</Button>
                <Button size="sm" variant={!form.usePointBuy ? "default" : "outline"}
                  onClick={rollAll} data-testid="button-roll-stats" className="text-xs gap-1">
                  <Dices className="w-3 h-3" /> Roll
                </Button>
              </div>
            </div>
            {form.usePointBuy && (
              <div className="bg-card border border-border rounded p-3 text-sm text-muted-foreground">
                Points remaining: <span className={`font-bold ${pointsRemaining < 0 ? "text-destructive" : "text-primary"}`}>{pointsRemaining}</span> / {TOTAL_POINTS}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {STAT_KEYS.map(k => {
                const bonus = raceBonuses[k] ?? 0;
                const final = finalStats[k];
                return (
                  <div key={k} className="bg-card border border-border rounded p-3 text-center">
                    <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">{k.slice(0, 3)}</div>
                    {bonus > 0 ? (
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        <span className="font-serif text-xl font-bold text-foreground/70">{form.stats[k]}</span>
                        <span className="text-xs text-primary/60">+{bonus}</span>
                        <span className="font-serif text-2xl font-bold text-primary">= {final}</span>
                      </div>
                    ) : (
                      <div className="font-serif text-2xl font-bold text-foreground mb-0.5">{final}</div>
                    )}
                    <div className="text-xs text-primary mb-2">{modStr(final)}</div>
                    {form.usePointBuy && (
                      <div className="flex justify-center gap-2">
                        <button data-testid={`button-stat-minus-${k}`} onClick={() => setStat(k, form.stats[k] - 1)} disabled={form.stats[k] <= 8}
                          className="w-6 h-6 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary disabled:opacity-30 text-sm">-</button>
                        <button data-testid={`button-stat-plus-${k}`} onClick={() => setStat(k, form.stats[k] + 1)} disabled={form.stats[k] >= 15 || pointsRemaining <= 0}
                          className="w-6 h-6 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary disabled:opacity-30 text-sm">+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {Object.keys(raceBonuses).length > 0 && (
              <p className="text-xs text-muted-foreground/70 text-center">
                <span className="text-primary/70">{form.race || "Human"} racial bonuses</span> are shown in blue — the highlighted totals are your final stats.
              </p>
            )}
          </div>
        )}

        {/* ── Step 6: Confirm ── */}
        {step === 6 && (
          <div className="space-y-6">
            <h2 className="font-serif text-xl text-foreground">Ready to Begin</h2>
            <div className="bg-card border border-primary/30 rounded-lg p-6 space-y-5">
              {/* Identity */}
              <div className="border-b border-border pb-4">
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Campaign</div>
                <div className="font-serif text-xl text-foreground">{form.campaignName || "The Unnamed Quest"}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Name", form.characterName || "The Nameless One"],
                  ["Race", form.race || "Human"],
                  ["Class", form.class || "Fighter"],
                  ["Background", form.background],
                  ["Alignment", form.alignment],
                  ["HP", String((classInfo?.hitDie ?? 10) + mod(finalStats.constitution))],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">{label}</div>
                    <div className="text-sm text-foreground">{value}</div>
                  </div>
                ))}
              </div>

              {/* Ability Scores */}
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Ability Scores (with racial bonuses)</div>
                <div className="grid grid-cols-6 gap-2">
                  {STAT_KEYS.map(k => {
                    const bonus = raceBonuses[k] ?? 0;
                    return (
                      <div key={k} className="text-center">
                        <div className="text-xs text-muted-foreground uppercase">{k.slice(0, 3)}</div>
                        <div className={`font-bold ${bonus > 0 ? "text-primary" : "text-foreground"}`}>{finalStats[k]}</div>
                        {bonus > 0 && <div className="text-xs text-primary/60">+{bonus}</div>}
                        <div className="text-xs text-primary">{modStr(finalStats[k])}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Skill Proficiencies */}
              {form.selectedSkills.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Skill Proficiencies</div>
                  <div className="flex flex-wrap gap-1.5">
                    {form.selectedSkills.map(s => <Badge key={s} variant="outline" className="text-xs border-primary/40 text-primary/80">{s}</Badge>)}
                  </div>
                </div>
              )}

              {/* Saving Throw Proficiencies */}
              {(classInfo?.savingThrows ?? []).length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Saving Throw Proficiencies</div>
                  <div className="flex flex-wrap gap-1.5">
                    {classInfo!.savingThrows.map(s => <Badge key={s} variant="outline" className="text-xs border-border text-muted-foreground">{s}</Badge>)}
                  </div>
                </div>
              )}

              {/* Starting Gear */}
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Starting Gear</div>
                <div className="text-sm text-muted-foreground">{classInfo?.startingGear[form.gearPackageIndex]?.label ?? "—"}</div>
                <div className="text-xs text-primary mt-1">Starting AC: {calcInitialAC(finalStats.dexterity, classInfo?.startingGear[form.gearPackageIndex]?.items ?? [])}</div>
              </div>

              {/* Spells */}
              {(form.selectedCantrips.length > 0 || form.selectedSpells.length > 0) && (
                <div>
                  {form.selectedCantrips.length > 0 && (
                    <div className="mb-2">
                      <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Cantrips</div>
                      <div className="flex flex-wrap gap-1.5">
                        {form.selectedCantrips.map(s => <Badge key={s} variant="outline" className="text-xs border-primary/40 text-primary/80">{s}</Badge>)}
                      </div>
                    </div>
                  )}
                  {form.selectedSpells.length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Spells Known</div>
                      <div className="flex flex-wrap gap-1.5">
                        {form.selectedSpells.map(s => <Badge key={s} variant="outline" className="text-xs border-border text-muted-foreground">{s}</Badge>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-10 pt-6 border-t border-border">
          <Button variant="outline" onClick={() => step > 1 ? setStep(s => s - 1) : setLocation("/")} data-testid="button-prev-step" className="border-border text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4 mr-1" />
            {step === 1 ? "Cancel" : "Back"}
          </Button>

          {!isLastStep ? (
            <Button onClick={() => setStep(s => s + 1)} data-testid="button-next-step"
              disabled={step === 3 && !canAdvance()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-serif disabled:opacity-50">
              Continue <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleFinish}
              disabled={createCampaign.isPending || updateCharacter.isPending || addItem.isPending}
              data-testid="button-begin-adventure"
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-serif gap-2">
              <Check className="w-4 h-4" />
              Begin the Adventure
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
