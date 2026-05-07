import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetCampaign, getGetCampaignQueryKey,
  useGetCharacter, getGetCharacterQueryKey,
  useListMessages, getListMessagesQueryKey,
  useListQuests, getListQuestsQueryKey,
  useListInventory, getListInventoryQueryKey,
  useSaveCampaign,
  useRollDice,
  useUpdateCharacter,
  useUpdateInventoryItem,
  useAddInventoryItem,
  useDeleteInventoryItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft, Save, Send, Dices, Sword, Shield, Heart, Zap, BookOpen, Package,
  ChevronDown, ChevronUp, User, Star, CheckCircle, XCircle, Minus, Plus,
  Trash2, PlusCircle, Info, Pencil, Sparkles, X, Gift
} from "lucide-react";

type ItemProps = {
  armorType?: "light" | "medium" | "heavy" | "shield";
  acBase?: number;
  stealthDisadvantage?: boolean;
  damage?: string;
  damageType?: string;
  versatileDamage?: string;
  weaponProperties?: string[];
};
type DiceRoll = { expression: string; label?: string | null; total: number; rolls: number[]; modifier: number; details: string };
type Message = { id: number; role: string; content: string; diceRolls?: DiceRoll[] | null; createdAt: string };

function abilityMod(score: number): number { return Math.floor((score - 10) / 2); }
function modStr(score: number): string { const m = abilityMod(score); return m >= 0 ? `+${m}` : String(m); }

const ABILITY_LABELS: Record<string, string> = {
  strength: "STR", dexterity: "DEX", constitution: "CON",
  intelligence: "INT", wisdom: "WIS", charisma: "CHA",
};
const ABILITY_KEYS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
const DICE_FACES = [4, 6, 8, 10, 12, 20, 100] as const;

const SKILL_ABILITY_MAP: Record<string, string> = {
  Acrobatics: "dexterity", "Animal Handling": "wisdom", Arcana: "intelligence",
  Athletics: "strength", Deception: "charisma", History: "intelligence",
  Insight: "wisdom", Intimidation: "charisma", Investigation: "intelligence",
  Medicine: "wisdom", Nature: "intelligence", Perception: "wisdom",
  Performance: "charisma", Persuasion: "charisma", Religion: "intelligence",
  "Sleight of Hand": "dexterity", Stealth: "dexterity", Survival: "wisdom",
};
const ABILITY_TO_STAT: Record<string, string> = {
  Strength: "strength", Dexterity: "dexterity", Constitution: "constitution",
  Intelligence: "intelligence", Wisdom: "wisdom", Charisma: "charisma",
};

function getCheckModifier(
  skill: string | undefined,
  char: { strength?: number | null; dexterity?: number | null; constitution?: number | null; intelligence?: number | null; wisdom?: number | null; charisma?: number | null; proficiencyBonus?: number | null; skillProficiencies?: unknown; savingThrowProficiencies?: unknown },
): { totalMod: number; label: string; isProficient: boolean } {
  if (!skill) return { totalMod: 0, label: "", isProficient: false };
  const profBonus = char.proficiencyBonus ?? 2;
  const skillProfs = (char.skillProficiencies as string[] | null) ?? [];
  const saveProfs = (char.savingThrowProficiencies as string[] | null) ?? [];

  const getRawMod = (key: string) => abilityMod((char as Record<string, number>)[key] ?? 10);

  // 18 D&D skills
  if (SKILL_ABILITY_MAP[skill]) {
    const statKey = SKILL_ABILITY_MAP[skill];
    const isProficient = skillProfs.includes(skill);
    const totalMod = getRawMod(statKey) + (isProficient ? profBonus : 0);
    return { totalMod, label: skill, isProficient };
  }
  // Saving throw (e.g. "Dexterity saving throw", "Wisdom saving throw")
  for (const [abilityName, statKey] of Object.entries(ABILITY_TO_STAT)) {
    if (skill.toLowerCase().includes(abilityName.toLowerCase()) && skill.toLowerCase().includes("saving")) {
      const isProficient = saveProfs.includes(abilityName);
      const totalMod = getRawMod(statKey) + (isProficient ? profBonus : 0);
      return { totalMod, label: skill, isProficient };
    }
  }
  // Raw ability check (e.g. "Strength", "Charisma")
  if (ABILITY_TO_STAT[skill]) {
    const totalMod = getRawMod(ABILITY_TO_STAT[skill]);
    return { totalMod, label: `${skill} check`, isProficient: false };
  }
  return { totalMod: 0, label: skill, isProficient: false };
}

// ─── Class Resource Definitions ─────────────────────────────────────────────

type ClassResource = { id: string; name: string; current: number; max: number; rechargeOn: "short" | "long" };

function getClassResources(
  charClass: string,
  level: number,
  subclass: string | null,
  charData: { charisma?: number | null },
  existing: ClassResource[] = [],
): ClassResource[] {
  const chaMod = abilityMod(charData.charisma ?? 10);
  const keep = (id: string, newMax: number): number => {
    const r = existing.find(x => x.id === id);
    return r !== undefined ? Math.min(r.current, newMax) : newMax;
  };
  const sub = (subclass ?? "").toLowerCase();
  const res: ClassResource[] = [];

  switch (charClass) {
    case "Barbarian": {
      const rageMax = level >= 20 ? 99 : level >= 17 ? 6 : level >= 12 ? 5 : level >= 6 ? 4 : level >= 3 ? 3 : 2;
      res.push({ id: "rage", name: "Rage", current: keep("rage", rageMax), max: rageMax, rechargeOn: "long" });
      if (level >= 3 && sub.includes("berserker"))
        res.push({ id: "frenzy", name: "Frenzy", current: keep("frenzy", 1), max: 1, rechargeOn: "long" });
      break;
    }
    case "Bard": {
      const biMax = Math.max(1, chaMod);
      res.push({ id: "bardic_inspiration", name: "Bardic Inspiration", current: keep("bardic_inspiration", biMax), max: biMax, rechargeOn: level >= 5 ? "short" : "long" });
      break;
    }
    case "Cleric": {
      const cdMax = level >= 18 ? 3 : level >= 6 ? 2 : 1;
      res.push({ id: "channel_divinity", name: "Channel Divinity", current: keep("channel_divinity", cdMax), max: cdMax, rechargeOn: "short" });
      if (level >= 10)
        res.push({ id: "divine_intervention", name: "Divine Intervention", current: keep("divine_intervention", 1), max: 1, rechargeOn: "long" });
      break;
    }
    case "Druid":
      res.push({ id: "wild_shape", name: "Wild Shape", current: keep("wild_shape", 2), max: 2, rechargeOn: "short" });
      break;
    case "Fighter": {
      res.push({ id: "second_wind", name: "Second Wind", current: keep("second_wind", 1), max: 1, rechargeOn: "short" });
      const asMax = level >= 17 ? 2 : 1;
      res.push({ id: "action_surge", name: "Action Surge", current: keep("action_surge", asMax), max: asMax, rechargeOn: "short" });
      if (level >= 9) {
        const indMax = level >= 17 ? 3 : level >= 13 ? 2 : 1;
        res.push({ id: "indomitable", name: "Indomitable", current: keep("indomitable", indMax), max: indMax, rechargeOn: "long" });
      }
      if (level >= 3 && sub.includes("battle master")) {
        const sdMax = level >= 15 ? 6 : level >= 7 ? 5 : 4;
        res.push({ id: "superiority_dice", name: "Superiority Dice", current: keep("superiority_dice", sdMax), max: sdMax, rechargeOn: "short" });
      }
      break;
    }
    case "Monk":
      res.push({ id: "ki_points", name: "Ki Points", current: keep("ki_points", level), max: level, rechargeOn: "short" });
      break;
    case "Paladin": {
      const lohMax = level * 5;
      res.push({ id: "lay_on_hands", name: "Lay on Hands", current: keep("lay_on_hands", lohMax), max: lohMax, rechargeOn: "long" });
      const dsMax = Math.max(1, 1 + chaMod);
      res.push({ id: "divine_sense", name: "Divine Sense", current: keep("divine_sense", dsMax), max: dsMax, rechargeOn: "long" });
      if (level >= 3) {
        const cdMax = level >= 6 ? 2 : 1;
        res.push({ id: "channel_divinity", name: "Channel Divinity", current: keep("channel_divinity", cdMax), max: cdMax, rechargeOn: "short" });
      }
      break;
    }
    case "Sorcerer":
      if (level >= 2)
        res.push({ id: "sorcery_points", name: "Sorcery Points", current: keep("sorcery_points", level), max: level, rechargeOn: "long" });
      if (sub.includes("wild magic"))
        res.push({ id: "tides_of_chaos", name: "Tides of Chaos", current: keep("tides_of_chaos", 1), max: 1, rechargeOn: "long" });
      break;
    case "Wizard":
      res.push({ id: "arcane_recovery", name: "Arcane Recovery", current: keep("arcane_recovery", 1), max: 1, rechargeOn: "long" });
      break;
    // Warlock: short-rest slots tracked via spellSlots already; Ranger/Rogue have no distinct pools
  }
  return res;
}

const CLASS_LEVEL_FEATURES: Record<string, Record<number, string[]>> = {
  Fighter: {
    1: ["Fighting Style — choose a combat specialty (Archery, Defense, Dueling, etc.)", "Second Wind — use a bonus action to regain 1d10+level HP once per short rest", "Proficiency with all armor, shields, simple and martial weapons"],
    2: ["Action Surge (1/rest) — take an extra action on your turn"],
    3: ["Martial Archetype — choose Battle Master, Champion, or Eldritch Knight"],
    4: ["Ability Score Improvement — +2 to one score, or +1/+1 to two"],
    5: ["Extra Attack — attack twice when you take the Attack action"],
  },
  Rogue: {
    1: ["Expertise — double proficiency bonus on two chosen skills", "Sneak Attack (1d6) — deal extra damage when you have advantage or an ally is adjacent", "Thieves' Cant — secret language of rogues and thieves"],
    2: ["Cunning Action — Dash, Disengage, or Hide as a bonus action"],
    3: ["Roguish Archetype — Thief, Assassin, or Arcane Trickster", "Sneak Attack increases to 2d6"],
    4: ["Ability Score Improvement"],
    5: ["Uncanny Dodge — use your reaction to halve an attack's damage", "Sneak Attack increases to 3d6"],
  },
  Wizard: {
    1: ["Spellcasting (Intelligence) — arcane magic through study and spellbook", "Arcane Recovery (1/day) — recover spell slots worth half your level on a short rest", "Spellbook — start with 6 spells; copy new spells from scrolls and books"],
    2: ["Arcane Tradition subclass — choose your specialization (Evocation, Divination, etc.)", "New spell slots: 3×L1"],
    3: ["New spell slots: 4×L1, 2×L2 — add 2 new spells to your spellbook"],
    4: ["Ability Score Improvement", "New spell slots: 4×L1, 3×L2"],
    5: ["New spell slots: 4×L1, 3×L2, 2×L3 — add 2 new spells to your spellbook"],
  },
  Cleric: {
    1: ["Spellcasting (Wisdom) — divine magic from your deity", "Divine Domain — subclass that grants domain spells and special Channel Divinity options", "Proficiency with medium armor, shields, and simple weapons"],
    2: ["Channel Divinity (1/rest) — Turn Undead or your Domain ability", "New spell slots: 3×L1"],
    3: ["New spell slots: 4×L1, 2×L2"],
    4: ["Ability Score Improvement", "New spell slots: 4×L1, 3×L2"],
    5: ["Destroy Undead (CR ½)", "New spell slots: 4×L1, 3×L2, 2×L3"],
  },
  Druid: {
    1: ["Spellcasting (Wisdom) — nature magic drawn from the world around you", "Druidic — secret language spoken only among druids", "Proficiency with light/medium armor (non-metal) and simple weapons"],
    2: ["Wild Shape (2/rest) — transform into a beast up to CR ¼", "Druid Circle subclass"],
    3: ["New spell slots: 4×L1, 2×L2"],
    4: ["Wild Shape improves — CR ½, swim speed allowed", "Ability Score Improvement"],
    5: ["New spell slots: 4×L1, 3×L2, 2×L3"],
  },
  Bard: {
    1: ["Spellcasting (Charisma) — magic through music, words, and performance", "Bardic Inspiration (d6) — grant an ally a bonus die to add to a roll (uses = CHA mod)", "Proficiency with three musical instruments and three skills of your choice"],
    2: ["Jack of All Trades — add half proficiency to any check you aren't proficient in", "Song of Rest — allies heal extra d6 on short rest", "New spell slots: 3×L1 — learn 1 new spell"],
    3: ["Bard College subclass", "Expertise in 2 more skills", "New spell slots: 4×L1, 2×L2 — learn 1 new spell"],
    4: ["Ability Score Improvement", "New spell slots: 4×L1, 3×L2 — learn 1 new spell"],
    5: ["Font of Inspiration — recover Bardic Inspiration on short rest", "New spell slots: 4×L1, 3×L2, 2×L3 — learn 1 new spell"],
  },
  Ranger: {
    1: ["Favored Enemy — advantage on checks to track or recall lore about a chosen creature type", "Natural Explorer — double proficiency in INT/WIS checks in your favored terrain"],
    2: ["Spellcasting (Wisdom) — 2 L1 spell slots, choose 2 spells from Ranger list", "Fighting Style"],
    3: ["Ranger Archetype subclass (Hunter, Beast Master, etc.)", "Primeval Awareness"],
    4: ["Ability Score Improvement"],
    5: ["Extra Attack — attack twice when you take the Attack action", "New spell slots: 4×L1, 2×L2"],
  },
  Paladin: {
    1: ["Divine Sense — detect celestials, fiends, undead, and consecrated/desecrated objects within 60 ft", "Lay on Hands — pool of HP equal to 5×level to heal or cure disease/poison"],
    2: ["Spellcasting (Charisma) — 2 L1 spell slots, choose 2 spells from Paladin list", "Divine Smite — spend a spell slot for extra radiant damage on a hit", "Fighting Style"],
    3: ["Sacred Oath subclass", "Channel Divinity options"],
    4: ["Ability Score Improvement"],
    5: ["Extra Attack — attack twice when you take the Attack action", "New spell slots: 4×L1, 2×L2"],
  },
  Barbarian: {
    1: ["Rage (2/day) — enter a fury: +2 damage, resistance to physical damage, advantage on STR checks/saves", "Unarmored Defense — AC = 10 + DEX mod + CON mod when not wearing armor"],
    2: ["Reckless Attack — advantage on attacks (but enemies also have advantage vs you)", "Danger Sense — advantage on DEX saves vs traps and spells you can see"],
    3: ["Primal Path subclass — choose your Barbarian archetype"],
    4: ["Ability Score Improvement"],
    5: ["Extra Attack — attack twice when you take the Attack action", "Fast Movement — +10 ft speed (not in heavy armor)"],
  },
  Monk: {
    1: ["Unarmored Defense — AC = 10 + DEX mod + WIS mod when not wearing armor", "Martial Arts — use DEX for unarmed/monk weapon attacks; unarmed strikes deal 1d4"],
    2: ["Ki Points (2/rest) — Flurry of Blows, Patient Defense, Step of the Wind", "Unarmored Movement — +10 ft speed"],
    3: ["Monastic Tradition subclass", "Deflect Missiles — reduce ranged weapon damage with reaction"],
    4: ["Ability Score Improvement", "Slow Fall — reduce falling damage with reaction"],
    5: ["Extra Attack — attack twice when you take the Attack action", "Stunning Strike — spend 1 Ki point to stun a creature on a hit"],
  },
  Warlock: {
    1: ["Otherworldly Patron — power granted by a patron entity (Fiend, Archfey, Great Old One, etc.)", "Pact Magic (1 slot/rest) — recover spell slot on short rest; learn 2 spells + Eldritch Blast cantrip"],
    2: ["Eldritch Invocations — choose 2 (Agonizing Blast, Devil's Sight, etc.)", "2 Pact Magic L1 slots (recover on short rest) — learn 1 new spell"],
    3: ["Pact Boon — Pact of the Chain, Blade, or Tome", "Pact Magic upgrades to L2 slots — learn 1 new spell"],
    4: ["Ability Score Improvement — learn 1 new spell"],
    5: ["Pact Magic upgrades to L3 slots — learn 1 new spell"],
  },
  Sorcerer: {
    1: ["Sorcerous Origin — innate magic source (Draconic Bloodline, Wild Magic, etc.)", "Spellcasting (Charisma) — 4 cantrips, 2 spells known, 2×L1 spell slots"],
    2: ["Font of Magic — 2 Sorcery Points (Flexible Casting, Quicken, Twin, Subtle, Distant)", "Learn 1 new spell"],
    3: ["Metamagic — choose 2 options", "3 Sorcery Points — learn 1 new spell"],
    4: ["Ability Score Improvement", "4 Sorcery Points — learn 1 new spell"],
    5: ["5 Sorcery Points — learn 1 new spell"],
  },
};

// ─── Edit Character Constants ───────────────────────────────────────────────

const SUBCLASS_OPTIONS: Record<string, { label: string; options: string[] }> = {
  Warlock: { label: "Otherworldly Patron", options: ["The Fiend", "The Great Old One", "The Archfey", "The Hexblade"] },
  Sorcerer: { label: "Sorcerous Origin", options: ["Draconic Bloodline", "Wild Magic", "Divine Soul", "Shadow Magic"] },
  Cleric: { label: "Divine Domain", options: ["Life Domain", "Light Domain", "Trickery Domain", "Knowledge Domain", "War Domain", "Nature Domain", "Tempest Domain"] },
};
const EDIT_RACES = ["Human", "Elf", "Dwarf", "Halfling", "Half-Elf", "Tiefling", "Dragonborn", "Gnome"];
const EDIT_CLASSES = ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"];
const EDIT_BACKGROUNDS = ["Acolyte", "Charlatan", "Criminal", "Entertainer", "Folk Hero", "Guild Artisan", "Hermit", "Noble", "Outlander", "Sage", "Sailor", "Soldier", "Urchin"];
const EDIT_ALIGNMENTS = ["Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil"];
const EDIT_ALL_SKILLS = [
  "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History",
  "Insight", "Intimidation", "Investigation", "Medicine", "Nature", "Perception",
  "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival",
];
const EDIT_SAVING_THROWS = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];

const BACKGROUND_PROFICIENCIES: Record<string, [string, string]> = {
  "Acolyte": ["Insight", "Religion"],
  "Charlatan": ["Deception", "Sleight of Hand"],
  "Criminal": ["Deception", "Stealth"],
  "Entertainer": ["Acrobatics", "Performance"],
  "Folk Hero": ["Animal Handling", "Survival"],
  "Guild Artisan": ["Insight", "Persuasion"],
  "Hermit": ["Medicine", "Religion"],
  "Noble": ["History", "Persuasion"],
  "Outlander": ["Athletics", "Survival"],
  "Sage": ["Arcana", "History"],
  "Sailor": ["Athletics", "Perception"],
  "Soldier": ["Athletics", "Intimidation"],
  "Urchin": ["Sleight of Hand", "Stealth"],
};

const CLASS_HIT_DICE: Record<string, number> = {
  Barbarian: 12, Fighter: 10, Paladin: 10, Ranger: 10,
  Monk: 8, Rogue: 8, Cleric: 8, Druid: 8, Warlock: 8, Bard: 8,
  Sorcerer: 6, Wizard: 6,
};

const ASI_LEVELS = new Set([4, 8, 12, 16, 19]);
const ASI_STAT_KEYS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;

// ─── Warlock Mechanics ───────────────────────────────────────────────────────

type Invocation = {
  name: string;
  description: string;
  prereqPact?: "Chain" | "Blade" | "Tome";
  prereqLevel?: number;
  chainApplies?: boolean;
};

const ELDRITCH_INVOCATIONS: Invocation[] = [
  // Core — no prerequisites
  { name: "Agonizing Blast", description: "Add CHA modifier to Eldritch Blast damage rolls" },
  { name: "Armor of Shadows", description: "Cast Mage Armor on yourself at will, no spell slot required" },
  { name: "Devil's Sight", description: "See normally in both magical and nonmagical darkness to 120 ft" },
  { name: "Eldritch Mind", description: "Advantage on Constitution saving throws to maintain concentration" },
  { name: "Eldritch Sight", description: "Cast Detect Magic at will, no spell slot required" },
  { name: "Eldritch Spear", description: "Eldritch Blast range extends to 300 ft" },
  { name: "Eyes of the Rune Keeper", description: "Read all writing, regardless of language" },
  { name: "Fiendish Vigor", description: "Cast False Life on yourself at will (1st-level effect, no material components)" },
  { name: "Gaze of Two Minds", description: "Use your action to perceive through a willing humanoid's senses until start of your next turn" },
  { name: "Mask of Many Faces", description: "Cast Disguise Self at will, no spell slot required" },
  { name: "Misty Visions", description: "Cast Silent Image at will, no spell slot required" },
  { name: "Repelling Blast", description: "Creatures hit by Eldritch Blast are pushed 10 ft away from you" },
  { name: "Beast Speech", description: "Cast Speak with Animals at will, no spell slot required" },
  { name: "Beguiling Influence", description: "Proficiency in Deception and Persuasion skills" },
  { name: "Grasp of Hadar", description: "Pull a creature hit by Eldritch Blast 10 ft toward you" },
  { name: "Lance of Lethargy", description: "Eldritch Blast reduces one target's speed by 10 ft until your next turn" },
  // Pact of the Chain — enhances the familiar
  { name: "Gift of the Ever-Living Ones", description: "When your familiar is within 100 ft, maximize all healing you roll", prereqPact: "Chain", chainApplies: true },
  { name: "Investment of the Chain Master", description: "Familiar gains fly/swim speed, resistance to damage, and can attack as your bonus action", prereqPact: "Chain", chainApplies: true },
  { name: "Voice of the Chain Master", description: "Perceive through and speak through your familiar; telepathic range unlimited", prereqPact: "Chain", chainApplies: true },
  { name: "Chains of Carceri", description: "Cast Hold Monster at will, targeting celestials, fiends, or elementals", prereqPact: "Chain", prereqLevel: 15, chainApplies: true },
  // Pact of the Blade
  { name: "Eldritch Smite", description: "Spend a pact magic slot when you hit: deal 1d8 force damage per slot level + knock prone if Large or smaller", prereqPact: "Blade" },
  { name: "Thirsting Blade", description: "Attack twice when you take the Attack action with your pact weapon", prereqPact: "Blade", prereqLevel: 5 },
  { name: "Lifedrinker", description: "Pact weapon deals extra necrotic damage equal to your Charisma modifier", prereqPact: "Blade", prereqLevel: 12 },
  // Pact of the Tome
  { name: "Book of Ancient Secrets", description: "Inscribe ritual spells in your Book of Shadows and cast them as rituals", prereqPact: "Tome" },
  // Level-gated general
  { name: "Mire the Mind", description: "Cast Slow once per long rest using a pact magic spell slot", prereqLevel: 5 },
  { name: "One with Shadows", description: "When in dim light or darkness, use action to become invisible until you move or act", prereqLevel: 5 },
  { name: "Sign of Ill Omen", description: "Cast Bestow Curse once per long rest using a pact magic spell slot", prereqLevel: 5 },
  { name: "Gift of the Depths", description: "Breathe underwater; gain swim speed equal to walking speed", prereqLevel: 5 },
  { name: "Dreadful Word", description: "Cast Confusion once per long rest using a pact magic spell slot", prereqLevel: 7 },
  { name: "Sculptor of Flesh", description: "Cast Polymorph once per long rest using a pact magic spell slot", prereqLevel: 7 },
  { name: "Trickster's Escape", description: "Cast Freedom of Movement on yourself once per long rest without a spell slot", prereqLevel: 7 },
  { name: "Bewitching Whispers", description: "Cast Compulsion once per long rest using a pact magic spell slot", prereqLevel: 7 },
  { name: "Ascendant Step", description: "Cast Levitate on yourself at will, no spell slot required", prereqLevel: 9 },
  { name: "Otherworldly Leap", description: "Cast Jump on yourself at will, no spell slot required", prereqLevel: 9 },
  { name: "Whispers of the Grave", description: "Cast Speak with Dead at will, no spell slot required", prereqLevel: 9 },
  { name: "Minions of Chaos", description: "Cast Conjure Elemental once per long rest using a pact magic spell slot", prereqLevel: 9 },
  { name: "Master of Myriad Forms", description: "Cast Alter Self at will, no spell slot required", prereqLevel: 15 },
  { name: "Visions of Distant Realms", description: "Cast Arcane Eye at will, no spell slot required", prereqLevel: 15 },
  { name: "Witch Sight", description: "See the true forms of shapechangers and illusion-concealed creatures within 30 ft", prereqLevel: 15 },
];

// New invocations granted at each Warlock level (total kept for reference; this is the delta)
const WARLOCK_NEW_INVOCATIONS: Record<number, number> = { 2: 2, 5: 1, 7: 1, 9: 1, 12: 1, 15: 1, 18: 1 };

// ─── Sorcerer Metamagic ───────────────────────────────────────────────────

// New Metamagic options gained at each Sorcerer level
const SORCERER_NEW_METAMAGIC: Record<number, number> = { 3: 2, 10: 1, 17: 1 };

type MetamagicOption = { name: string; cost: string; description: string };
const METAMAGIC_OPTIONS: MetamagicOption[] = [
  { name: "Careful Spell", cost: "1 SP", description: "Choose up to CHA mod creatures — they automatically succeed on saving throws against the spell." },
  { name: "Distant Spell", cost: "1 SP", description: "Double the range of a spell, or change its range from touch to 30 ft." },
  { name: "Empowered Spell", cost: "1 SP", description: "Reroll up to CHA mod damage dice for the spell, keeping the new results. Can combine with other metamagic." },
  { name: "Extended Spell", cost: "1 SP", description: "Double the duration of a concentration spell, up to a maximum of 24 hours." },
  { name: "Heightened Spell", cost: "3 SP", description: "One creature targeted by the spell has disadvantage on their first saving throw against it." },
  { name: "Quickened Spell", cost: "2 SP", description: "Change a spell with a casting time of 1 action into a bonus action." },
  { name: "Subtle Spell", cost: "1 SP", description: "Cast a spell without any verbal or somatic components — undetectable even under scrutiny." },
  { name: "Twinned Spell", cost: "1 SP per spell level (min 1)", description: "Target a second creature with a single-target spell that can't already target multiple creatures." },
];

// ─── Subclass Feature Selection Data ─────────────────────────────────────

type SubclassFeatureOption = { name: string; description: string };

// Barbarian — Path of the Totem Warrior
const TOTEM_SPIRIT_OPTIONS: SubclassFeatureOption[] = [
  { name: "Bear Totem Spirit", description: "While raging, you have resistance to all damage except psychic. Beasts sense your spiritual kinship." },
  { name: "Eagle Totem Spirit", description: "While raging, Dash and Disengage as bonus actions; opportunity attacks against you have disadvantage unless you are incapacitated." },
  { name: "Wolf Totem Spirit", description: "While raging, your allies have advantage on melee attack rolls against creatures within 5 ft. of you." },
];
const ASPECT_BEAST_OPTIONS: SubclassFeatureOption[] = [
  { name: "Bear Aspect", description: "Your carrying capacity doubles and you have advantage on Strength checks and Strength saving throws." },
  { name: "Eagle Aspect", description: "You can see up to 1 mile clearly, and dim light doesn't impose disadvantage on your Perception checks." },
  { name: "Wolf Aspect", description: "You can track other creatures while traveling at fast pace, and move stealthily at a normal pace." },
];
const TOTEMIC_ATTUNEMENT_OPTIONS: SubclassFeatureOption[] = [
  { name: "Bear Totemic Attunement", description: "While raging, any creature within 5 ft. that is hostile to you has disadvantage on attacks against targets other than you." },
  { name: "Eagle Totemic Attunement", description: "While raging, you have a flying speed equal to your walking speed. You fall if you end your turn in the air." },
  { name: "Wolf Totemic Attunement", description: "While raging, bonus action: knock a Large or smaller creature prone when you hit it with a melee weapon attack." },
];

// Fighter — Battle Master
const BATTLE_MASTER_MANEUVERS: SubclassFeatureOption[] = [
  { name: "Commander's Strike", description: "Forgo one attack to let an ally use their reaction to make a weapon attack; add your Superiority Die to their damage." },
  { name: "Disarming Attack", description: "Add Superiority Die to damage; target makes a STR save or drops one item of your choice." },
  { name: "Distracting Strike", description: "Add Superiority Die to damage; next attack roll against the target before your next turn has advantage." },
  { name: "Evasive Footwork", description: "Move up to your speed; add the Superiority Die to your AC until you stop moving." },
  { name: "Feinting Attack", description: "Bonus action: gain advantage on your next attack against an adjacent creature and add Superiority Die to damage on a hit." },
  { name: "Goading Attack", description: "Add Superiority Die to damage; target makes a WIS save or has disadvantage on all attacks against targets other than you until your next turn." },
  { name: "Lunging Attack", description: "Spend Superiority Die to extend your melee reach by 5 ft. for one attack; add the die to damage on a hit." },
  { name: "Maneuvering Attack", description: "Add Superiority Die to damage; one friendly creature can use its reaction to move half its speed without provoking opportunity attacks." },
  { name: "Menacing Attack", description: "Add Superiority Die to damage; target makes a WIS save or is frightened of you until your next turn." },
  { name: "Parry", description: "Reaction when hit by a melee attack: reduce the damage by Superiority Die + your DEX modifier." },
  { name: "Precision Attack", description: "Add the Superiority Die to one attack roll before knowing whether it hits or misses." },
  { name: "Pushing Attack", description: "Add Superiority Die to damage; target makes a STR save or is pushed up to 15 ft. away from you." },
  { name: "Rally", description: "Bonus action: give a friendly creature temporary HP equal to Superiority Die + your CHA modifier." },
  { name: "Riposte", description: "Reaction when missed by a melee attack: make one melee weapon attack against that creature; add Superiority Die to damage." },
  { name: "Sweeping Attack", description: "On a hit, deal damage equal to the Superiority Die to a second creature adjacent to the first that is also within your reach." },
  { name: "Trip Attack", description: "Add Superiority Die to damage; target makes a STR save or is knocked prone." },
];
const BATTLE_MASTER_MANEUVERS_GAINED: Record<number, number> = { 3: 3, 7: 2, 10: 2, 15: 2 };

// Monk — Way of the Four Elements
const FOUR_ELEMENTS_DISCIPLINES: SubclassFeatureOption[] = [
  { name: "Breath of Winter", description: "6 ki: Cast Cone of Cold." },
  { name: "Clench of the North Wind", description: "3 ki: Cast Hold Person." },
  { name: "Elemental Attunement", description: "0 ki: Minor elemental effect — extinguish flame, create a breeze, shake earth, or ripple water." },
  { name: "Eternal Mountain Defense", description: "5 ki: Cast Stoneskin on yourself." },
  { name: "Fangs of the Fire Snake", description: "1 ki on attack: reach extends 10 ft. and attack deals fire damage. Spend 1 more ki to deal an extra 1d10 fire." },
  { name: "Fist of Four Thunders", description: "2 ki: Cast Thunderwave." },
  { name: "Fist of Unbroken Air", description: "2 ki: One creature makes a STR save or takes 3d10 bludgeoning, is pushed 20 ft., and knocked prone (half damage, no push on success)." },
  { name: "Flames of the Phoenix", description: "4 ki: Cast Fireball." },
  { name: "Gong of the Summit", description: "3 ki: Cast Shatter." },
  { name: "Mist Stance", description: "4 ki: Cast Gaseous Form on yourself." },
  { name: "Ride the Wind", description: "4 ki: Cast Fly on yourself." },
  { name: "River of Hungry Flame", description: "5 ki: Cast Wall of Fire." },
  { name: "Rush of the Gale Spirits", description: "2 ki: Cast Gust of Wind." },
  { name: "Shape the Flowing River", description: "1 ki: Control up to a 30-ft. cube of water — shape it, freeze it, or move it." },
  { name: "Sweeping Cinder Strike", description: "2 ki: Each creature in a 5-ft. radius around a point within 30 ft. makes a DEX save or takes 2d6 fire damage." },
  { name: "Water Whip", description: "2 ki: Ranged spell attack (30 ft.): 3d10 bludgeoning + either knock prone or pull 25 ft. toward you." },
  { name: "Wave of Rolling Earth", description: "6 ki: Cast Wall of Stone." },
];
const FOUR_ELEMENTS_DISCIPLINES_GAINED: Record<number, number> = { 3: 2, 6: 1, 11: 1, 17: 1 };

// Ranger — Hunter
const HUNTER_PREY_OPTIONS: SubclassFeatureOption[] = [
  { name: "Colossus Slayer", description: "Once per turn, deal +1d8 damage to a creature that is below its hit point maximum." },
  { name: "Giant Killer", description: "Reaction: when a Large or larger creature within 5 ft. misses you, make one weapon attack against it." },
  { name: "Horde Breaker", description: "Once per turn, make one additional attack against a second creature within 5 ft. of the first that is also within range." },
];
const HUNTER_DEFENSIVE_TACTICS: SubclassFeatureOption[] = [
  { name: "Escape the Horde", description: "Opportunity attacks against you have disadvantage." },
  { name: "Multiattack Defense", description: "When a creature hits you, gain +4 AC against all subsequent attacks from that creature for the rest of the turn." },
  { name: "Steel Will", description: "Advantage on saving throws against being frightened." },
];
const HUNTER_MULTIATTACK: SubclassFeatureOption[] = [
  { name: "Volley", description: "Make a ranged attack against any number of creatures within 10 ft. of a point you can see, using one piece of ammunition per target." },
  { name: "Whirlwind Attack", description: "Make a melee attack against any number of creatures within 5 ft. of you, making a separate attack roll for each." },
];

// Bard — College of Swords
const SWORDS_FIGHTING_STYLES: SubclassFeatureOption[] = [
  { name: "Dueling", description: "When you are wielding a melee weapon in one hand and no other weapons, gain +2 bonus to damage rolls with that weapon." },
  { name: "Two-Weapon Fighting", description: "When fighting with two weapons, add your ability modifier to the damage of the off-hand attack." },
];

// Determine which subclass features to prompt at a given level
type SubclassFeatureGain = {
  label: string;
  options: SubclassFeatureOption[];
  count: number;
  key: string;
};

function getSubclassFeatureGains(charClass: string, subclass: string | null, level: number, knownFeatures: string[]): SubclassFeatureGain[] {
  const gains: SubclassFeatureGain[] = [];
  const sub = (subclass ?? "").toLowerCase();

  if (charClass === "Barbarian" && sub.includes("totem")) {
    if (level === 3)  gains.push({ label: "Totem Spirit", options: TOTEM_SPIRIT_OPTIONS.filter(o => !knownFeatures.includes(o.name)), count: 1, key: "totem-spirit" });
    if (level === 6)  gains.push({ label: "Aspect of the Beast", options: ASPECT_BEAST_OPTIONS.filter(o => !knownFeatures.includes(o.name)), count: 1, key: "aspect-beast" });
    if (level === 14) gains.push({ label: "Totemic Attunement", options: TOTEMIC_ATTUNEMENT_OPTIONS.filter(o => !knownFeatures.includes(o.name)), count: 1, key: "totemic-attunement" });
  }

  if (charClass === "Fighter" && sub.includes("battle master")) {
    const needed = BATTLE_MASTER_MANEUVERS_GAINED[level] ?? 0;
    if (needed > 0) gains.push({ label: "Combat Maneuvers", options: BATTLE_MASTER_MANEUVERS.filter(o => !knownFeatures.includes(o.name)), count: needed, key: "maneuver" });
  }

  if (charClass === "Monk" && sub.includes("four elements")) {
    const needed = FOUR_ELEMENTS_DISCIPLINES_GAINED[level] ?? 0;
    if (needed > 0) gains.push({ label: "Elemental Disciplines", options: FOUR_ELEMENTS_DISCIPLINES.filter(o => !knownFeatures.includes(o.name)), count: needed, key: "discipline" });
  }

  if (charClass === "Ranger" && sub.includes("hunter")) {
    if (level === 3)  gains.push({ label: "Hunter's Prey", options: HUNTER_PREY_OPTIONS.filter(o => !knownFeatures.includes(o.name)), count: 1, key: "hunters-prey" });
    if (level === 7)  gains.push({ label: "Defensive Tactics", options: HUNTER_DEFENSIVE_TACTICS.filter(o => !knownFeatures.includes(o.name)), count: 1, key: "defensive-tactics" });
    if (level === 11) gains.push({ label: "Multi-attack Style", options: HUNTER_MULTIATTACK.filter(o => !knownFeatures.includes(o.name)), count: 1, key: "multiattack" });
  }

  if (charClass === "Bard" && sub.includes("swords") && level === 3) {
    const filtered = SWORDS_FIGHTING_STYLES.filter(o => !knownFeatures.includes(o.name));
    if (filtered.length > 0) gains.push({ label: "Fighting Style", options: filtered, count: 1, key: "fighting-style" });
  }

  return gains;
}

// ─── Spell Slot Progression Tables ────────────────────────────────────────

const FULL_CASTER_SLOTS: Record<number, Record<string, number>> = {
  1:  { "1": 2 },
  2:  { "1": 3 },
  3:  { "1": 4, "2": 2 },
  4:  { "1": 4, "2": 3 },
  5:  { "1": 4, "2": 3, "3": 2 },
  6:  { "1": 4, "2": 3, "3": 3 },
  7:  { "1": 4, "2": 3, "3": 3, "4": 1 },
  8:  { "1": 4, "2": 3, "3": 3, "4": 2 },
  9:  { "1": 4, "2": 3, "3": 3, "4": 3, "5": 1 },
  10: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 2 },
  11: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 2, "6": 1 },
  12: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 2, "6": 1 },
  13: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 2, "6": 1, "7": 1 },
  14: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 2, "6": 1, "7": 1 },
  15: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 2, "6": 1, "7": 1, "8": 1 },
  16: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 2, "6": 1, "7": 1, "8": 1 },
  17: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 2, "6": 1, "7": 1, "8": 1, "9": 1 },
  18: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 3, "6": 1, "7": 1, "8": 1, "9": 1 },
  19: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 3, "6": 2, "7": 1, "8": 1, "9": 1 },
  20: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 3, "6": 2, "7": 2, "8": 1, "9": 1 },
};

const HALF_CASTER_SLOTS: Record<number, Record<string, number>> = {
  1:  {},
  2:  { "1": 2 },
  3:  { "1": 3 },
  4:  { "1": 3 },
  5:  { "1": 4, "2": 2 },
  6:  { "1": 4, "2": 2 },
  7:  { "1": 4, "2": 3 },
  8:  { "1": 4, "2": 3 },
  9:  { "1": 4, "2": 3, "3": 2 },
  10: { "1": 4, "2": 3, "3": 2 },
  11: { "1": 4, "2": 3, "3": 3 },
  12: { "1": 4, "2": 3, "3": 3 },
  13: { "1": 4, "2": 3, "3": 3, "4": 1 },
  14: { "1": 4, "2": 3, "3": 3, "4": 1 },
  15: { "1": 4, "2": 3, "3": 3, "4": 2 },
  16: { "1": 4, "2": 3, "3": 3, "4": 2 },
  17: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 1 },
  18: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 1 },
  19: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 2 },
  20: { "1": 4, "2": 3, "3": 3, "4": 3, "5": 2 },
};

const WARLOCK_PACT_SLOTS: Record<number, Record<string, number>> = {
  1:  { "1": 1 },
  2:  { "1": 2 },
  3:  { "2": 2 },
  4:  { "2": 2 },
  5:  { "3": 2 },
  6:  { "3": 2 },
  7:  { "4": 2 },
  8:  { "4": 2 },
  9:  { "5": 2 },
  10: { "5": 2 },
  11: { "5": 3 },
  12: { "5": 3 },
  13: { "5": 3 },
  14: { "5": 3 },
  15: { "5": 3 },
  16: { "5": 3 },
  17: { "5": 4 },
  18: { "5": 4 },
  19: { "5": 4 },
  20: { "5": 4 },
};

function getSpellSlotsForLevel(charClass: string, level: number): Record<string, number> | null {
  if (["Bard", "Cleric", "Druid", "Sorcerer", "Wizard"].includes(charClass))
    return FULL_CASTER_SLOTS[level] ?? null;
  if (["Paladin", "Ranger"].includes(charClass))
    return HALF_CASTER_SLOTS[level] ?? null;
  if (charClass === "Warlock")
    return WARLOCK_PACT_SLOTS[level] ?? null;
  return null;
}

// ─── Spell Descriptions ───────────────────────────────────────────────────

const SPELL_DESCRIPTIONS: Record<string, string> = {
  // Cantrips
  "Acid Splash": "Hurl a bubble of acid; DEX save or 1d6 acid damage (can hit two adjacent creatures).",
  "Blade Ward": "Until your next turn, you have resistance to bludgeoning, piercing, and slashing damage from weapons.",
  "Booming Blade": "Melee weapon attack; if target moves before your next turn, it takes 1d8 thunder damage.",
  "Chill Touch": "Ranged spell attack; 1d8 necrotic damage, target can't regain HP until your next turn.",
  "Dancing Lights": "Create up to 4 floating torch-lights you can move up to 60 ft per turn.",
  "Druidcraft": "Minor natural effects: predict weather, bloom a flower, snuff a flame, or create a harmless sensory effect.",
  "Eldritch Blast": "Beam of crackling energy; ranged spell attack for 1d10 force damage (gains beams at higher levels).",
  "Fire Bolt": "Ranged spell attack; 1d10 fire damage. Can ignite unattended flammable objects.",
  "Friends": "Advantage on CHA checks against one non-hostile creature for 1 minute; it may become hostile afterward.",
  "Green-Flame Blade": "Melee weapon attack; on hit, green fire leaps to a nearby creature dealing CHA mod fire damage.",
  "Guidance": "Touch a creature; it adds 1d4 to one ability check before the spell ends.",
  "Light": "An object sheds bright light in a 20 ft radius for 1 hour.",
  "Mage Hand": "Spectral hand manipulates objects, opens containers, or retrieves items within 30 ft.",
  "Mending": "Repair a single break or tear in an object without a trace.",
  "Message": "Whisper a message to a creature within 120 ft; only they hear it and may whisper a reply.",
  "Minor Illusion": "Create a sound or still image within 30 ft for 1 minute; Investigation check to disbelieve.",
  "Poison Spray": "Puff of noxious gas; CON save or 1d12 poison damage.",
  "Prestidigitation": "Minor magical tricks: clean/soil items, light/snuff flames, chill/warm food, make small sensory effects.",
  "Produce Flame": "A flame appears in your hand (light); hurl it as a ranged spell attack for 1d8 fire damage.",
  "Ray of Frost": "Ranged spell attack; 1d8 cold damage and target's speed reduced by 10 ft until your next turn.",
  "Resistance": "Touch a creature; it adds 1d4 to one saving throw before the spell ends.",
  "Sacred Flame": "Radiance descends on a creature; DEX save or 1d8 radiant damage (ignores cover).",
  "Shillelagh": "Your club or quarterstaff becomes magical (1d8, uses WIS for attack/damage) for 1 minute.",
  "Shocking Grasp": "Melee spell attack; 1d8 lightning damage, target can't take reactions until their next turn.",
  "Spare the Dying": "Touch a creature at 0 HP to stabilize it instantly.",
  "Thaumaturgy": "Manifest minor wonders: amplify voice, make eyes glow, cause flames to flicker.",
  "Thorn Whip": "Melee spell attack; 1d6 piercing damage and pull target 10 ft toward you.",
  "Thunderclap": "All creatures within 5 ft make a CON save or take 1d6 thunder damage.",
  "Toll the Dead": "WIS save or 1d8 necrotic (1d12 if the target is missing HP).",
  "True Strike": "Advantage on your next attack roll against the target before your next turn.",
  "Vicious Mockery": "WIS save or 1d4 psychic damage and disadvantage on their next attack roll.",
  "Word of Radiance": "Creatures of your choice within 5 ft make a CON save or take 1d6 radiant.",
  // Level 1
  "Absorb Elements": "Reaction: halve incoming elemental damage and deal 1d6 of that type extra on your next melee hit.",
  "Alarm": "Set an alarm at a point; you are alerted mentally or by a bell when a Tiny or larger creature passes through.",
  "Animal Friendship": "Beast WIS save or it can't attack you for 24 hours.",
  "Armor of Agathys": "Gain 5 temp HP; while you have them, melee attackers take 5 cold damage.",
  "Arms of Hadar": "Tendrils erupt; creatures within 10 ft make STR save or take 2d6 necrotic and lose reactions.",
  "Bane": "Up to 3 creatures CHA save or subtract 1d4 from attacks and saves for 1 minute.",
  "Bless": "Up to 3 creatures add 1d4 to attack rolls and saving throws for 1 minute.",
  "Burning Hands": "15 ft cone; DEX save or 3d6 fire damage (half on success).",
  "Cause Fear": "WIS save or one creature is frightened of you for 1 minute (re-saves each turn).",
  "Charm Person": "WIS save or a humanoid is charmed as a friendly acquaintance for 1 hour.",
  "Chromatic Orb": "Ranged spell attack; 3d8 damage of your chosen energy type.",
  "Color Spray": "Blinding burst hits 6d10 HP worth of creatures in a 15 ft cone — blinded until your next turn.",
  "Command": "WIS save or a creature obeys a one-word command (drop, flee, grovel, halt, kneel) on its next turn.",
  "Compelled Duel": "WIS save or creature must attack only you and can't willingly move away for 1 minute.",
  "Comprehend Languages": "Understand any spoken language you hear or written language you see for 1 hour.",
  "Create or Destroy Water": "Create 10 gallons of water in a container, or destroy that much in an open container.",
  "Cure Wounds": "Touch a creature to restore 1d8 + spellcasting mod HP.",
  "Detect Evil and Good": "For 10 minutes, sense the presence and type of aberrations, celestials, elementals, fey, fiends, or undead within 30 ft.",
  "Detect Magic": "For 10 minutes, sense magic within 30 ft and learn the school of any aura you can see.",
  "Detect Poison and Disease": "For 10 minutes, sense poisonous creatures, poisons, and diseases within 30 ft.",
  "Disguise Self": "Change your appearance (features, clothing, height) for 1 hour — doesn't withstand touch.",
  "Dissonant Whispers": "WIS save or 3d6 psychic damage and flee in terror (half/no movement on success).",
  "Divine Favor": "Your weapon attacks deal +1d4 radiant damage for 1 minute.",
  "Earth Tremor": "Creatures in 10 ft radius DEX save or 1d6 bludgeoning and knocked prone (on loose ground).",
  "Ensnaring Strike": "On your next weapon hit, target STR save or restrained by vines until the spell ends.",
  "Expeditious Retreat": "Your speed increases by 30 ft; you can Dash as a bonus action for 10 minutes.",
  "Faerie Fire": "Creatures in a 20 ft cube are outlined in light — attacks against them have advantage, no invisibility.",
  "False Life": "Gain 1d4+4 temporary HP for 1 hour.",
  "Feather Fall": "Reaction; up to 5 falling creatures slow to 60 ft/round and take no fall damage.",
  "Fog Cloud": "20 ft radius of thick fog, heavily obscured, lasts up to 1 hour (concentration).",
  "Goodberry": "Up to 10 berries appear, each restoring 1 HP; 10 berries sustain a creature for a day.",
  "Grease": "10 ft square becomes slick; DEX save to avoid falling prone when entering or starting a turn there.",
  "Guiding Bolt": "Ranged spell attack; 4d6 radiant damage, and next attack roll against the target has advantage.",
  "Hail of Thorns": "On your next ranged hit, a burst of thorns; target and nearby creatures DEX save or 1d10 piercing.",
  "Healing Word": "Bonus action; a creature within 60 ft regains 1d4 + spellcasting mod HP.",
  "Hellish Rebuke": "Reaction when damaged; attacker makes DEX save or takes 2d10 fire damage (half on success).",
  "Heroism": "Creature immune to fright and gains temp HP equal to your spellcasting mod each turn for 1 minute.",
  "Hex": "Curse a creature: +1d6 necrotic on each of your attacks; disadvantage on one chosen ability check.",
  "Hunter's Mark": "Mark a target: +1d6 weapon damage against it; advantage on Perception/Survival to find it.",
  "Identify": "Learn the properties, attunement requirements, and command words of a magic item or spell.",
  "Inflict Wounds": "Melee spell attack; 3d10 necrotic damage.",
  "Jump": "Triple a creature's long jump distance for 1 minute.",
  "Longstrider": "Increase a creature's speed by 10 ft for 1 hour.",
  "Mage Armor": "Unarmored creature's AC becomes 13 + DEX mod for 8 hours.",
  "Magic Missile": "Three darts each deal 1d4+1 force damage and automatically hit (no attack roll).",
  "Protection from Evil and Good": "Protected creature has advantage on saves and attackers have disadvantage vs. aberrations, celestials, elementals, fey, fiends, and undead.",
  "Purify Food and Drink": "Purify up to 5 ft of food and drink, neutralizing all poison and disease.",
  "Ray of Sickness": "Ranged spell attack; 2d8 poison damage; on hit, CON save or poisoned until end of their next turn.",
  "Sanctuary": "Creatures must WIS save to attack the warded creature; ward ends if it attacks or casts on a foe.",
  "Searing Smite": "Next weapon hit: +1d6 fire damage, then 1d6 fire at start of each turn (CON save to end).",
  "Shield": "Reaction: +5 AC until your next turn and no damage from Magic Missile.",
  "Shield of Faith": "A creature gains +2 AC for up to 10 minutes.",
  "Silent Image": "Visual illusion up to 15 ft cube; you can move it 20 ft as a bonus action each turn.",
  "Sleep": "Send 5d8 HP worth of creatures to sleep, starting with the lowest current HP.",
  "Speak with Animals": "For 10 minutes, understand and speak with beasts (limited by their intelligence).",
  "Tasha's Hideous Laughter": "WIS save or fall prone laughing, incapacitated, can't stand (re-saves each turn).",
  "Thunderous Smite": "Next weapon hit: +2d6 thunder damage; STR save or pushed 10 ft and knocked prone.",
  "Thunderwave": "15 ft cube; CON save or 2d8 thunder and pushed 10 ft (half/no push on success).",
  "Unseen Servant": "Invisible mindless force performs simple tasks within 60 ft for 1 hour.",
  "Witch Bolt": "Ranged spell attack; 1d12 lightning on hit; action on later turns to deal 1d12 automatically.",
  "Wrathful Smite": "Next weapon hit: +1d6 psychic; WIS save or frightened of you (re-saves each turn).",
  // Level 2
  "Aid": "Up to 3 creatures gain +5 HP max and current HP for 8 hours.",
  "Alter Self": "Transform: Aquatic Adaptation, Change Appearance, or Natural Weapons (+1d6) for 1 hour.",
  "Animal Messenger": "Send a Tiny beast as a messenger with a 25-word message to a specific location.",
  "Augury": "Receive a one-word omen (Weal/Woe/Both/Nothing) about a course of action.",
  "Barkskin": "Creature's AC can't be lower than 16 for 1 hour.",
  "Blindness/Deafness": "CON save or a creature is blinded or deafened for 1 minute (re-saves each turn).",
  "Blur": "Attacks against you have disadvantage for 1 minute unless the attacker doesn't rely on sight.",
  "Branding Smite": "Next weapon hit: +2d6 radiant and creature sheds light, can't turn invisible; takes 2d6 radiant each turn.",
  "Calm Emotions": "Humanoids in 20 ft CHA save or lose charm/fright effects, or become indifferent to non-threats.",
  "Cloud of Daggers": "5 ft cube of whirling daggers for 1 minute; creatures entering or starting there take 4d4 slashing.",
  "Cordon of Arrows": "Up to 4 arrows animate and shoot nearby intruders; DEX save or 1d6 piercing.",
  "Crown of Madness": "WIS save or charmed humanoid attacks the nearest creature (not you) each turn.",
  "Darkness": "Magical darkness, 15 ft radius, blocks darkvision unless magical; lasts 10 minutes.",
  "Darkvision": "Touch a creature; it gains darkvision 60 ft for 8 hours.",
  "Detect Thoughts": "Read surface thoughts of nearby creatures; probe deeper with a WIS save.",
  "Enhance Ability": "Touch a creature: advantage on all checks of one chosen ability score for 1 hour.",
  "Enlarge/Reduce": "CON save or creature doubles in size (+1d4 weapon damage, advantage on STR) or halves (-1d4, disadvantage).",
  "Enthrall": "WIS save or creature has disadvantage on Perception checks not targeting you for 1 minute.",
  "Find Steed": "Summon a loyal steed (warhorse, pony, camel, elk, or mastiff) bonded to you.",
  "Find Traps": "Sense the presence of any trap within line of sight.",
  "Flame Blade": "Fiery sword appears in your hand; melee spell attack for 3d6 fire; sheds bright light.",
  "Flaming Sphere": "5 ft fire sphere; bonus action to move 30 ft; 2d6 fire on DEX save to adjacent creatures.",
  "Gentle Repose": "Preserve a corpse for 10 days and extend the time limit for raising the dead.",
  "Gust of Wind": "60 ft line of wind; moving against it halves speed; sustained with bonus action.",
  "Heat Metal": "Searing hot metal object; 2d8 fire damage (CON save or drop it); bonus action to reapply.",
  "Hold Person": "WIS save or a humanoid is paralyzed for 1 minute (re-saves each turn).",
  "Invisibility": "Touch a creature; it becomes invisible until it attacks, casts, or 1 hour passes.",
  "Knock": "Touch a locked object to open it; or end one effect preventing passage.",
  "Lesser Restoration": "Touch a creature to end one disease or one of: blinded, deafened, paralyzed, or poisoned.",
  "Levitate": "CON save (unwilling); creature or object rises up to 20 ft and can be moved 20 ft/turn for 10 minutes.",
  "Locate Animals or Plants": "Learn direction and distance of the nearest named beast or plant within 5 miles.",
  "Locate Object": "Sense direction of a specific object within 1000 ft for 10 minutes.",
  "Magic Weapon": "A nonmagical weapon gains +1 to attack and damage for 1 hour.",
  "Melf's Acid Arrow": "Ranged spell attack; 4d4 acid on hit + 2d4 at end of target's next turn.",
  "Mirror Image": "3 illusory duplicates; attackers must hit the right one; duplicates destroyed on successful hit.",
  "Misty Step": "Bonus action; teleport up to 30 ft to an unoccupied space you can see.",
  "Moonbeam": "Pale beam in a 5 ft cylinder; CON save or 2d10 radiant on entry or start of turn there.",
  "Pass Without Trace": "Up to 10 creatures gain +10 to Stealth and can't be tracked nonmagically for 1 hour.",
  "Phantasmal Force": "INT save or creature believes an illusion is real and takes 1d6 psychic at start of each turn.",
  "Prayer of Healing": "Up to 6 creatures regain 2d8 + spellcasting mod HP (10-minute cast).",
  "Protection from Poison": "Neutralize one poison on touch, then advantage on poison saves and resistance for 1 hour.",
  "Ray of Enfeeblement": "Ranged spell attack; target's weapon attacks deal half damage (CON save each turn to end).",
  "Scorching Ray": "Create 3 rays; ranged spell attack per ray for 2d6 fire each.",
  "See Invisibility": "For 1 hour, see invisible creatures/objects and into the Ethereal Plane.",
  "Shatter": "10 ft sphere; CON save or 3d8 thunder damage (half on success); disadvantage for inorganic creatures.",
  "Silence": "20 ft sphere of silence for 10 minutes; no verbal spell components possible inside.",
  "Spike Growth": "20 ft radius becomes difficult terrain; creatures moving through take 2d4 piercing per 5 ft.",
  "Spider Climb": "Creature gains climb speed equal to movement and can walk on ceilings for 1 hour.",
  "Spiritual Weapon": "Floating weapon attacks for 1d8 + spellcasting mod force as a bonus action each turn.",
  "Suggestion": "WIS save or creature follows a reasonable magical suggestion for up to 8 hours.",
  "Web": "20 ft cube of webs; STR save or restrained (can attempt to break free with another check).",
  "Zone of Truth": "20 ft sphere; CHA save or creature can't tell deliberate lies while inside.",
  // Level 3
  "Animate Dead": "Animate a corpse or bones as a skeleton or zombie servant under your control for 24 hours.",
  "Beacon of Hope": "Targets have advantage on WIS saves and death saves; healing maximized.",
  "Bestow Curse": "Touch attack; choose: disadvantage on checks/saves, vulnerability to damage type, waste actions, or +1d8 necrotic from your attacks.",
  "Blink": "Roll d20 at end of each turn; 11+ vanishes to Ethereal Plane until start of your next turn.",
  "Call Lightning": "Storm cloud overhead; bonus action to call a bolt each round for 3d10 lightning (DEX save).",
  "Clairvoyance": "Create invisible sensor within 1 mile; see or hear through it for 10 minutes.",
  "Conjure Animals": "Summon fey spirits as beasts with combined CR ≤ 2; they obey your verbal commands.",
  "Counterspell": "Reaction: automatically counter a spell level 3 or lower; ability check for higher levels.",
  "Create Food and Water": "Conjure 45 lbs of food and 30 gallons of water for 15 humanoids or 5 steeds.",
  "Daylight": "60 ft sphere of bright light; disperses magical darkness of 3rd level or lower.",
  "Dispel Magic": "End one spell of 3rd level or lower on a target; ability check for higher levels.",
  "Fear": "30 ft cone; WIS save or drop held objects and flee for 1 minute.",
  "Fireball": "20 ft radius explosion; DEX save or 8d6 fire damage (half on success).",
  "Fly": "Touch a willing creature; it gains a flying speed of 60 ft for 10 minutes.",
  "Gaseous Form": "Transform into a misty cloud for 1 hour; immune to nonmagical damage, fly 10 ft, can't attack.",
  "Glyph of Warding": "Inscribe a magical glyph that triggers a spell or deals 5d8 damage when disturbed.",
  "Haste": "Double speed, +2 AC, advantage on DEX saves, and an extra action (move/melee/hide/dash/use object).",
  "Hunger of Hadar": "20 ft void sphere; creatures take 2d6 cold at start and 2d6 acid at end of each turn.",
  "Hypnotic Pattern": "Creatures that see the pattern WIS save or are charmed and incapacitated for 1 minute.",
  "Lightning Bolt": "100 ft line; DEX save or 8d8 lightning damage (half on success).",
  "Magic Circle": "10 ft cylinder protects against one creature type; they can't enter or exit willingly.",
  "Major Image": "Illusion with sound, smell, and temperature up to 20 ft cube that lasts until dispelled.",
  "Mass Healing Word": "Bonus action; up to 6 creatures regain 1d4 + spellcasting mod HP.",
  "Meld into Stone": "Step into a Large or larger stone; remain hidden up to 8 hours, aware of surroundings.",
  "Nondetection": "Hide a creature or object from all divination magic for 8 hours.",
  "Plant Growth": "Enrich plants in 100 ft for a year, or entangle 100 ft radius in thick overgrowth.",
  "Protection from Energy": "Touch a creature; resistance to one energy type (acid, cold, fire, lightning, or thunder) for 1 hour.",
  "Remove Curse": "All curses on a creature or object end; also breaks attunement to a cursed item.",
  "Sending": "Send a 25-word message to any creature you've met; they can reply.",
  "Slow": "Up to 6 creatures WIS save or halve speed, -2 AC/DEX saves, lose reactions, one action or bonus action per turn.",
  "Speak with Dead": "Corpse answers up to 5 questions based on its knowledge in life.",
  "Speak with Plants": "Plants in 30 ft gain limited senses; can report recent events and help or hinder movement.",
  "Spirit Guardians": "Spirits swirl in 15 ft; creatures have halved speed; WIS save or 3d8 radiant/necrotic.",
  "Stinking Cloud": "20 ft cloud of nauseating gas; CON save or waste turn retching, can't take actions.",
  "Tongues": "Target can understand and speak any language for 1 hour.",
  "Vampiric Touch": "Melee spell attack; 3d6 necrotic damage and regain HP equal to half damage dealt.",
  "Water Breathing": "Up to 10 willing creatures can breathe underwater for 24 hours.",
  "Water Walk": "Up to 10 willing creatures walk on liquid surfaces for 1 hour.",
  "Wind Wall": "Wall of wind deflects ranged attacks and deals 3d8 bludgeoning to creatures passing through.",
};

const PACT_BOON_OPTIONS = [
  { key: "Chain", name: "Pact of the Chain", icon: "🐾", description: "Gain Find Familiar. Your familiar can be an Imp, Pseudodragon, Quasit, or Sprite. It can attack via your bonus action." },
  { key: "Blade", name: "Pact of the Blade", icon: "⚔️", description: "Summon a pact weapon as a bonus action. Proficient with it, use CHA for attacks, and it counts as magical." },
  { key: "Tome", name: "Pact of the Tome", icon: "📖", description: "Your patron grants a Book of Shadows containing 3 cantrips from any class list." },
];

type FamiliarOption = { name: string; hp: number; maxHp: number; ac: number; description: string; special?: boolean };
const STANDARD_FAMILIAR_TYPES: FamiliarOption[] = [
  { name: "Bat", hp: 1, maxHp: 1, ac: 12, description: "Blindsight 60 ft (blind beyond). Echolocation lets it detect in total darkness." },
  { name: "Cat", hp: 2, maxHp: 2, ac: 12, description: "Keen Smell; advantage on Perception checks. Stealthy and silent scout." },
  { name: "Crab", hp: 2, maxHp: 2, ac: 11, description: "Amphibious. Claw can grapple a creature (escape DC 9)." },
  { name: "Frog", hp: 1, maxHp: 1, ac: 11, description: "Amphibious. Tremorsense 30 ft detects movement on the ground." },
  { name: "Hawk", hp: 1, maxHp: 1, ac: 13, description: "Keen Sight; advantage on Perception. Excellent aerial scout." },
  { name: "Lizard", hp: 2, maxHp: 2, ac: 10, description: "Climbs sheer surfaces with ease. Squeezes through very tight spaces." },
  { name: "Octopus", hp: 3, maxHp: 3, ac: 12, description: "Ink Cloud for escape. Can grapple a creature in water (DC 10)." },
  { name: "Owl", hp: 1, maxHp: 1, ac: 11, description: "Flyby (no opportunity attacks). Darkvision 120 ft. Keen Hearing & Sight." },
  { name: "Poisonous Snake", hp: 2, maxHp: 2, ac: 13, description: "Bite: DC 10 CON save or 2d4 poison damage. Good for delivering poison." },
  { name: "Quipper", hp: 1, maxHp: 1, ac: 13, description: "Aquatic only. Blood Frenzy: advantage on melee attacks vs a damaged creature." },
  { name: "Rat", hp: 1, maxHp: 1, ac: 10, description: "Pack Tactics. Tiny and easy to conceal. Keen Smell." },
  { name: "Raven", hp: 1, maxHp: 1, ac: 12, description: "Mimicry: mimics sounds and voices (DC 10 Insight to detect). Can relay messages." },
  { name: "Sea Horse", hp: 1, maxHp: 1, ac: 11, description: "Aquatic only. Useful in underwater exploration campaigns." },
  { name: "Spider", hp: 1, maxHp: 1, ac: 12, description: "Web Sense detects creatures in contact with web. Climbs ceilings." },
  { name: "Weasel", hp: 1, maxHp: 1, ac: 13, description: "Keen Hearing & Smell. Advantage on Perception using smell." },
];

const CHAIN_FAMILIAR_TYPES: FamiliarOption[] = [
  { name: "Imp", hp: 10, maxHp: 10, ac: 13, description: "Devil from the Nine Hells. Immune to fire/poison, resistant to cold/lightning/bludgeoning.", special: true },
  { name: "Pseudodragon", hp: 7, maxHp: 7, ac: 13, description: "Tiny dragon with telepathy. Can share its magical senses with you.", special: true },
  { name: "Quasit", hp: 7, maxHp: 7, ac: 13, description: "Chaotic demon that can turn invisible at will. Immune to poison.", special: true },
  { name: "Sprite", hp: 2, maxHp: 2, ac: 15, description: "Fey archer with a heart-seeking bow. Can detect alignment and current emotional state.", special: true },
  ...STANDARD_FAMILIAR_TYPES,
];

type BeastOption = { name: string; cr: string; hp: number; ac: number; speed: string; attack: string; attackBonus: number; damage: string; notes: string };
const BEASTMASTER_PHB_BEASTS: BeastOption[] = [
  { name: "Wolf", cr: "1/4", hp: 11, ac: 13, speed: "40 ft", attack: "Bite", attackBonus: 4, damage: "2d4+2 piercing", notes: "Pack Tactics. Bite: DC 11 STR save or knocked prone." },
  { name: "Panther", cr: "1/4", hp: 13, ac: 12, speed: "50 ft, climb 40 ft", attack: "Bite", attackBonus: 4, damage: "1d6+2 piercing", notes: "Pounce: DC 12 STR save or prone + free claw attack (1d4+2)." },
  { name: "Axe Beak", cr: "1/4", hp: 19, ac: 11, speed: "50 ft", attack: "Beak", attackBonus: 4, damage: "1d8+2 slashing", notes: "Highest HP of the standard CR 1/4 options. Great for mounted combat." },
  { name: "Boar", cr: "1/4", hp: 11, ac: 11, speed: "40 ft", attack: "Tusk", attackBonus: 3, damage: "2d6+1 slashing", notes: "Charge: extra 2d6 + DC 11 STR save or knocked prone." },
  { name: "Giant Badger", cr: "1/4", hp: 13, ac: 10, speed: "30 ft, burrow 10 ft", attack: "Bite", attackBonus: 3, damage: "1d6+1 piercing", notes: "Claws +3, 2d4+1. Burrow speed for terrain advantage." },
  { name: "Giant Lizard", cr: "1/4", hp: 19, ac: 12, speed: "30 ft, climb 30 ft", attack: "Bite", attackBonus: 4, damage: "2d6+2 piercing", notes: "High HP and damage. Climb speed 30 ft for vertical terrain." },
  { name: "Constrictor Snake", cr: "1/4", hp: 13, ac: 12, speed: "30 ft, swim 30 ft", attack: "Bite", attackBonus: 4, damage: "1d6+2 piercing", notes: "Constrict: +4 to hit, 1d8+2 + grappled (DC 14 STR to escape)." },
  { name: "Pteranodon", cr: "1/4", hp: 13, ac: 13, speed: "10 ft, fly 60 ft", attack: "Bite", attackBonus: 3, damage: "2d4+1 piercing", notes: "Flyby. Fly speed 60 ft — aerial support and scouting." },
  { name: "Blood Hawk", cr: "1/8", hp: 7, ac: 13, speed: "fly 60 ft", attack: "Beak", attackBonus: 4, damage: "1d4+2 piercing", notes: "Flyby. Pack Tactics. Fast flier for scouting and distraction." },
  { name: "Giant Weasel", cr: "1/8", hp: 9, ac: 13, speed: "40 ft", attack: "Bite", attackBonus: 4, damage: "2d4+2 piercing", notes: "Keen Hearing & Smell (adv. Perception). Good all-rounder." },
  { name: "Flying Snake", cr: "1/8", hp: 5, ac: 14, speed: "30 ft, fly 60 ft, swim 30 ft", attack: "Bite", attackBonus: 6, damage: "1+3 piercing, 3d4 poison", notes: "Highest AC for a CR 1/8. Flyby. Venomous bite." },
  { name: "Mastiff", cr: "1/8", hp: 5, ac: 12, speed: "40 ft", attack: "Bite", attackBonus: 3, damage: "1d6+1 piercing", notes: "Bite: DC 11 STR save or knocked prone. Reliable crowd control." },
];

type PrimalBeastEntry = { name: string; primalType: "Land" | "Sea" | "Sky"; description: string; speed: string; attack: string; special: string; baseStr: number; baseDex: number; baseCon: number; abilityKey: "str" | "dex"; hpFormula: (level: number) => number; acFormula: (profBonus: number) => number; damageFormula: (profBonus: number, abilityBonus: number) => string };
const PRIMAL_BEAST_DATA: PrimalBeastEntry[] = [
  {
    name: "Beast of the Land", primalType: "Land",
    description: "A Medium beast that can burrow and climb. Charge knocks enemies prone.",
    speed: "40 ft, burrow 15 ft, climb 15 ft", attack: "Maul",
    special: "Charge: moves 20ft+ toward target, DC (8 + prof + STR mod) STR save or knocked prone + 1d6 extra bludgeoning.",
    baseStr: 14, baseDex: 14, baseCon: 15, abilityKey: "str",
    hpFormula: (level) => 5 * level + 2,
    acFormula: (prof) => 13 + prof,
    damageFormula: (prof, ab) => `1d8+${ab + prof} bludgeoning`,
  },
  {
    name: "Beast of the Sea", primalType: "Sea",
    description: "A Medium aquatic beast with a 60-ft swim speed. Binding Strike restrains enemies.",
    speed: "5 ft, swim 60 ft", attack: "Binding Strike",
    special: "On hit: target is grappled (escape DC = 8 + prof + STR/DEX mod). Grappled speed becomes 0.",
    baseStr: 14, baseDex: 14, baseCon: 15, abilityKey: "str",
    hpFormula: (level) => 5 * level + 2,
    acFormula: (prof) => 13 + prof,
    damageFormula: (prof, ab) => `1d6+${ab + prof} piercing/bludgeoning`,
  },
  {
    name: "Beast of the Sky", primalType: "Sky",
    description: "A Small flying beast with Flyby. Shred deals slashing damage.",
    speed: "10 ft, fly 60 ft", attack: "Shred",
    special: "Flyby: doesn't provoke opportunity attacks when it flies out of reach.",
    baseStr: 6, baseDex: 16, baseCon: 13, abilityKey: "dex",
    hpFormula: (level) => 4 * level + 1,
    acFormula: (prof) => 13 + prof,
    damageFormula: (prof, ab) => `1d4+${ab + prof} slashing`,
  },
];

// ─── Edit Character Modal ───────────────────────────────────────────────────

function EditCharacterModal({ campaignId, onClose }: { campaignId: number; onClose: () => void }) {
  const { data: char } = useGetCharacter(campaignId, { query: { queryKey: getGetCharacterQueryKey(campaignId) } });
  const updateCharacter = useUpdateCharacter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<"identity" | "stats" | "proficiencies" | "spells" | "abilities" | "warlock" | "ranger" | "familiar">("identity");
  const [saving, setSaving] = useState(false);
  const [knownSpellsList, setKnownSpellsList] = useState<string[]>(() => (char?.knownSpells as string[] | null) ?? []);
  const [spellSearch, setSpellSearch] = useState("");
  const [warlockInvocationSearch, setWarlockInvocationSearch] = useState("");
  const [warlockPactBoon, setWarlockPactBoon] = useState<string | null>(() => (char?.pactBoon as string | null) ?? null);
  const [warlockFamiliarType, setWarlockFamiliarType] = useState<string | null>(() => (char?.familiar as { type: string } | null)?.type ?? null);
  const [warlockInvocations, setWarlockInvocations] = useState<string[]>(() => (char?.invocations as string[] | null) ?? []);
  const existingCompanion = char?.companion as { mode: string; name: string; primalType?: string; hp: number; maxHp: number; ac: number; attackBonus: number; damage: string } | null | undefined;
  const [rangerMode, setRangerMode] = useState<"primal" | "beast">(() => (existingCompanion?.mode as "primal" | "beast") ?? "primal");
  const [rangerPrimalType, setRangerPrimalType] = useState<"Land" | "Sea" | "Sky" | null>(() => (existingCompanion?.primalType as "Land" | "Sea" | "Sky") ?? null);
  const [rangerBeastName, setRangerBeastName] = useState<string | null>(() => existingCompanion?.mode === "beast" ? existingCompanion.name : null);
  const [ffFamiliarType, setFfFamiliarType] = useState<string | null>(() => (char?.class as string) !== "Warlock" ? (char?.familiar as { type: string } | null)?.type ?? null : null);

  const [form, setForm] = useState(() => {
    const features = (char?.features as string[] | null) ?? [];
    return {
      name: char?.name ?? "",
      race: char?.race ?? "Human",
      charClass: char?.class ?? "Fighter",
      subclass: features[0] ?? "",
      background: char?.background ?? "Folk Hero",
      alignment: char?.alignment ?? "True Neutral",
      backstory: char?.backstory ?? "",
      strength: char?.strength ?? 10,
      dexterity: char?.dexterity ?? 10,
      constitution: char?.constitution ?? 10,
      intelligence: char?.intelligence ?? 10,
      wisdom: char?.wisdom ?? 10,
      charisma: char?.charisma ?? 10,
      maxHp: char?.maxHp ?? 10,
      ac: char?.ac ?? 10,
      speed: char?.speed ?? 30,
      proficiencyBonus: char?.proficiencyBonus ?? 2,
      skillProficiencies: (char?.skillProficiencies as string[] | null) ?? [],
      savingThrowProficiencies: (char?.savingThrowProficiencies as string[] | null) ?? [],
    };
  });

  function setField<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function toggleSkill(skill: string) {
    setForm(f => ({
      ...f,
      skillProficiencies: f.skillProficiencies.includes(skill)
        ? f.skillProficiencies.filter(s => s !== skill)
        : [...f.skillProficiencies, skill],
    }));
  }

  function toggleSave(save: string) {
    setForm(f => ({
      ...f,
      savingThrowProficiencies: f.savingThrowProficiencies.includes(save)
        ? f.savingThrowProficiencies.filter(s => s !== save)
        : [...f.savingThrowProficiencies, save],
    }));
  }

  function adjustNum(k: "strength"|"dexterity"|"constitution"|"intelligence"|"wisdom"|"charisma"|"maxHp"|"ac"|"speed"|"proficiencyBonus", delta: number, min: number, max: number) {
    setForm(f => ({ ...f, [k]: Math.min(max, Math.max(min, f[k] + delta)) }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const isWarlock = form.charClass === "Warlock";
      const isRanger = form.charClass === "Ranger";
      const charLevel = char?.level ?? 1;
      const charProfBonus = char?.proficiencyBonus ?? 2;

      const familiarData = isWarlock && warlockPactBoon === "Pact of the Chain" && warlockFamiliarType
        ? (() => {
            const existing = char?.familiar as { type: string; hp: number; maxHp: number; ac: number } | null;
            if (existing && existing.type === warlockFamiliarType) return existing;
            const base = CHAIN_FAMILIAR_TYPES.find(f => f.name === warlockFamiliarType);
            return base ? { type: base.name, hp: base.maxHp, maxHp: base.maxHp, ac: base.ac } : null;
          })()
        : null;

      const ffFamiliarData = !isWarlock && ffFamiliarType !== null
        ? (() => {
            const existing = char?.familiar as { type: string; hp: number; maxHp: number; ac: number } | null;
            if (existing && existing.type === ffFamiliarType) return existing;
            const base = STANDARD_FAMILIAR_TYPES.find(f => f.name === ffFamiliarType);
            return base ? { type: base.name, hp: base.maxHp, maxHp: base.maxHp, ac: base.ac } : null;
          })()
        : undefined;

      const companionData = isRanger && charLevel >= 3
        ? (() => {
            if (rangerMode === "primal" && rangerPrimalType) {
              const entry = PRIMAL_BEAST_DATA.find(b => b.primalType === rangerPrimalType);
              if (!entry) return undefined;
              const ab = abilityMod(entry.abilityKey === "str" ? entry.baseStr : entry.baseDex);
              const maxHp = entry.hpFormula(charLevel);
              const ac = entry.acFormula(charProfBonus);
              const attackBonus = charProfBonus + ab;
              const damage = entry.damageFormula(charProfBonus, ab);
              const currentHp = existingCompanion?.primalType === rangerPrimalType ? existingCompanion.hp : maxHp;
              return { mode: "primal", name: entry.name, primalType: entry.primalType, hp: currentHp, maxHp, ac, attackBonus, damage };
            } else if (rangerMode === "beast" && rangerBeastName) {
              const beast = BEASTMASTER_PHB_BEASTS.find(b => b.name === rangerBeastName);
              if (!beast) return undefined;
              const currentHp = existingCompanion?.name === rangerBeastName ? existingCompanion.hp : beast.hp;
              return { mode: "beast", name: beast.name, primalType: undefined, hp: currentHp, maxHp: beast.hp, ac: beast.ac, attackBonus: beast.attackBonus, damage: beast.damage };
            }
            return existingCompanion ?? undefined;
          })()
        : undefined;

      await updateCharacter.mutateAsync({
        campaignId,
        data: {
          name: form.name,
          race: form.race,
          class: form.charClass,
          background: form.background,
          alignment: form.alignment,
          backstory: form.backstory || null,
          strength: form.strength,
          dexterity: form.dexterity,
          constitution: form.constitution,
          intelligence: form.intelligence,
          wisdom: form.wisdom,
          charisma: form.charisma,
          maxHp: form.maxHp,
          ac: form.ac,
          speed: form.speed,
          proficiencyBonus: form.proficiencyBonus,
          skillProficiencies: form.skillProficiencies,
          savingThrowProficiencies: form.savingThrowProficiencies,
          features: form.subclass ? [form.subclass] : [],
          knownSpells: knownSpellsList,
          ...(isWarlock ? { pactBoon: warlockPactBoon, invocations: warlockInvocations, familiar: familiarData } : {}),
          ...(ffFamiliarData !== undefined ? { familiar: ffFamiliarData } : {}),
          ...(companionData !== undefined ? { companion: companionData } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
      toast({ title: "Character updated" });
      onClose();
    } catch {
      toast({ title: "Failed to save changes", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const subclassInfo = SUBCLASS_OPTIONS[form.charClass];

  const numField = (k: "strength"|"dexterity"|"constitution"|"intelligence"|"wisdom"|"charisma"|"maxHp"|"ac"|"speed"|"proficiencyBonus", label: string, min: number, max: number) => (
    <div key={k} className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">
        <button onClick={() => adjustNum(k, -1, min, max)}
          className="w-6 h-6 rounded border border-border text-muted-foreground hover:text-foreground flex items-center justify-center text-xs">−</button>
        <div className="flex-1 text-center font-serif font-bold text-sm text-foreground bg-card border border-border rounded py-1 min-w-[2.5rem]">{form[k]}</div>
        <button onClick={() => adjustNum(k, 1, min, max)}
          className="w-6 h-6 rounded border border-border text-muted-foreground hover:text-foreground flex items-center justify-center text-xs">+</button>
      </div>
    </div>
  );

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-background border-border">
        <DialogHeader>
          <DialogTitle className="font-serif text-primary">Edit Character Sheet</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-1 border-b border-border pb-2">
          {(["identity", "stats", "proficiencies", "spells", "abilities"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-2.5 py-1.5 rounded text-xs font-medium capitalize transition-colors ${tab === t ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"}`}>
              {t}
            </button>
          ))}
          {form.charClass === "Warlock" && (
            <button onClick={() => setTab("warlock")}
              className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${tab === "warlock" ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"} ${!warlockPactBoon && (char?.level ?? 1) >= 3 ? "ring-1 ring-amber-500/50" : ""}`}>
              Warlock {!warlockPactBoon && (char?.level ?? 1) >= 3 ? "⚠" : ""}
            </button>
          )}
          {form.charClass === "Ranger" && (char?.level ?? 1) >= 3 && (
            <button onClick={() => setTab("ranger")}
              className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${tab === "ranger" ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"} ${!existingCompanion ? "ring-1 ring-amber-500/50" : ""}`}>
              Ranger {!existingCompanion ? "⚠" : ""}
            </button>
          )}
          {form.charClass !== "Warlock" && knownSpellsList.includes("Find Familiar") && (
            <button onClick={() => setTab("familiar")}
              className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${tab === "familiar" ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"}`}>
              Familiar
            </button>
          )}
        </div>

        {tab === "identity" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs text-muted-foreground">Character Name</Label>
                <Input value={form.name} onChange={e => setField("name", e.target.value)} className="h-8 text-sm bg-card border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Race</Label>
                <Select value={form.race} onValueChange={v => setField("race", v)}>
                  <SelectTrigger className="h-8 text-sm bg-card border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{EDIT_RACES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Class</Label>
                <Select value={form.charClass} onValueChange={v => { setField("charClass", v); setField("subclass", ""); }}>
                  <SelectTrigger className="h-8 text-sm bg-card border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{EDIT_CLASSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {subclassInfo && (
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs text-muted-foreground">{subclassInfo.label}</Label>
                  <Select value={form.subclass} onValueChange={v => setField("subclass", v)}>
                    <SelectTrigger className="h-8 text-sm bg-card border-border"><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>{subclassInfo.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Background</Label>
                <Select value={form.background} onValueChange={v => setField("background", v)}>
                  <SelectTrigger className="h-8 text-sm bg-card border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{EDIT_BACKGROUNDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Alignment</Label>
                <Select value={form.alignment} onValueChange={v => setField("alignment", v)}>
                  <SelectTrigger className="h-8 text-sm bg-card border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{EDIT_ALIGNMENTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Backstory</Label>
              <Textarea value={form.backstory} onChange={e => setField("backstory", e.target.value)}
                rows={4} className="text-sm bg-card border-border resize-none"
                placeholder="Your character's history and motivations…" />
            </div>
          </div>
        )}

        {tab === "stats" && (
          <div className="space-y-5">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Ability Scores</div>
              <div className="grid grid-cols-3 gap-2">
                {numField("strength", "STR", 1, 30)}
                {numField("dexterity", "DEX", 1, 30)}
                {numField("constitution", "CON", 1, 30)}
                {numField("intelligence", "INT", 1, 30)}
                {numField("wisdom", "WIS", 1, 30)}
                {numField("charisma", "CHA", 1, 30)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Combat & Movement</div>
              <div className="grid grid-cols-2 gap-2">
                {numField("maxHp", "Max HP", 1, 999)}
                {numField("ac", "Armor Class", 1, 30)}
                {numField("speed", "Speed (ft)", 0, 120)}
                {numField("proficiencyBonus", "Prof. Bonus", 2, 6)}
              </div>
            </div>
            <p className="text-xs text-muted-foreground/50 italic">Changing Max HP here does not change your current HP automatically.</p>
          </div>
        )}

        {tab === "proficiencies" && (() => {
          const bgProfs = new Set(BACKGROUND_PROFICIENCIES[form.background] ?? []);
          return (
            <div className="space-y-4">
              {bgProfs.size > 0 && (
                <div className="flex items-center gap-2 p-2 rounded border border-primary/20 bg-primary/5">
                  <span className="text-xs text-muted-foreground">Background ({form.background}):</span>
                  {[...bgProfs].map(s => (
                    <span key={s} className="px-2 py-0.5 rounded border border-primary/40 bg-primary/10 text-xs text-primary font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              )}
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Saving Throws</div>
                <div className="flex flex-wrap gap-2">
                  {EDIT_SAVING_THROWS.map(s => {
                    const on = form.savingThrowProficiencies.includes(s);
                    return (
                      <button key={s} onClick={() => toggleSave(s)}
                        className={`px-2.5 py-1 rounded border text-xs font-medium transition-all ${on ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/40"}`}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Skill Proficiencies</div>
                <div className="flex flex-wrap gap-2">
                  {EDIT_ALL_SKILLS.map(s => {
                    const on = form.skillProficiencies.includes(s);
                    const fromBg = bgProfs.has(s);
                    return (
                      <button key={s} onClick={() => toggleSkill(s)}
                        className={`px-2.5 py-1 rounded border text-xs font-medium transition-all ${on ? fromBg ? "border-primary bg-primary/20 text-primary ring-1 ring-primary/30" : "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/40"}`}>
                        {s}{fromBg && on ? " ✦" : ""}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground/50 mt-2">✦ granted by background</p>
              </div>
            </div>
          );
        })()}

        {tab === "spells" && (() => {
          const pool = CLASS_SPELL_POOL[form.charClass] ?? {};
          const knownSet = new Set(knownSpellsList);
          // Build the full spell pool flattened
          const allPoolSpells: string[] = [
            ...(pool.cantrips ?? []),
            ...(pool["1"] ?? []),
            ...(pool["2"] ?? []),
            ...(pool["3"] ?? []),
          ];
          const addable = allPoolSpells.filter(s => !knownSet.has(s) && (spellSearch === "" || s.toLowerCase().includes(spellSearch.toLowerCase())));
          const hasPool = allPoolSpells.length > 0;
          return (
            <div className="space-y-4">
              {/* Known spells */}
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Known Spells & Cantrips</div>
                {knownSpellsList.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 italic">No spells learned yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {knownSpellsList.map(s => (
                      <span key={s} className="flex items-center gap-1 px-2 py-0.5 rounded border border-primary/30 bg-primary/5 text-xs text-primary">
                        {s}
                        <button onClick={() => setKnownSpellsList(prev => prev.filter(x => x !== s))}
                          className="text-primary/50 hover:text-primary ml-0.5">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Add from class pool */}
              {hasPool && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Add from {form.charClass} Spell List</div>
                  <Input
                    value={spellSearch}
                    onChange={e => setSpellSearch(e.target.value)}
                    placeholder="Search spells…"
                    className="h-7 text-xs bg-card border-border mb-2"
                  />
                  {addable.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 italic">{spellSearch ? "No matches." : "All available spells already known."}</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {addable.map(s => (
                        <button key={s} onClick={() => setKnownSpellsList(prev => [...prev, s])}
                          className="flex items-center gap-1 px-2 py-0.5 rounded border border-border text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-all">
                          <Plus className="w-2.5 h-2.5" /> {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!hasPool && (
                <p className="text-xs text-muted-foreground/60 italic">{form.charClass}s do not have a spell list.</p>
              )}
            </div>
          );
        })()}

        {tab === "abilities" && (() => {
          const currentLevel = char?.level ?? 1;
          const classFeatures = CLASS_LEVEL_FEATURES[form.charClass] ?? {};
          const levels = Array.from({ length: currentLevel }, (_, i) => i + 1).filter(l => classFeatures[l]?.length);
          return (
            <div className="space-y-4">
              {levels.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 italic">No class features recorded for {form.charClass}.</p>
              ) : (
                levels.map(lvl => (
                  <div key={lvl}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="text-xs text-muted-foreground uppercase tracking-widest">Level {lvl}</div>
                      <div className="flex-1 h-px bg-border/60" />
                    </div>
                    <ul className="space-y-1.5">
                      {(classFeatures[lvl] ?? []).map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Sparkles className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                          <span className="text-foreground/85 leading-snug">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          );
        })()}

        {tab === "warlock" && (() => {
          const currentLevel = char?.level ?? 1;
          const pactKey = warlockPactBoon?.replace("Pact of the ", "") ?? null;
          const knownSet = new Set(warlockInvocations);
          const available = ELDRITCH_INVOCATIONS.filter(inv => {
            if (knownSet.has(inv.name)) return false;
            if (inv.prereqLevel && inv.prereqLevel > currentLevel) return false;
            if (inv.prereqPact && inv.prereqPact !== pactKey) return false;
            if (warlockInvocationSearch && !inv.name.toLowerCase().includes(warlockInvocationSearch.toLowerCase())) return false;
            return true;
          });
          const expectedCount = Object.entries(WARLOCK_NEW_INVOCATIONS)
            .filter(([lvl]) => parseInt(lvl) <= currentLevel)
            .reduce((sum, [, n]) => sum + n, 0);
          const missingCount = Math.max(0, expectedCount - warlockInvocations.length);
          return (
            <div className="space-y-5">
              {/* Pact Boon */}
              {currentLevel >= 3 ? (
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Pact Boon</div>
                  <div className="space-y-1.5">
                    {PACT_BOON_OPTIONS.map(boon => {
                      const sel = warlockPactBoon === boon.name;
                      return (
                        <button key={boon.key}
                          onClick={() => { setWarlockPactBoon(boon.name); if (boon.key !== "Chain") setWarlockFamiliarType(null); }}
                          className={`w-full text-left rounded border p-2.5 transition-all ${sel ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                          <div className="flex items-center gap-2">
                            <span>{boon.icon}</span>
                            <span className={`text-sm font-medium ${sel ? "text-primary" : "text-foreground"}`}>{boon.name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{boon.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/60 italic">Pact Boon is granted at level 3.</p>
              )}

              {/* Familiar selector */}
              {warlockPactBoon === "Pact of the Chain" && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Familiar Type</div>
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {CHAIN_FAMILIAR_TYPES.map(f => {
                      const sel = warlockFamiliarType === f.name;
                      return (
                        <button key={f.name} onClick={() => setWarlockFamiliarType(f.name)}
                          className={`w-full text-left rounded border p-2 transition-all ${sel ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {f.special && <span className="text-xs text-primary/70 font-bold">✦</span>}
                              <span className={`text-sm font-medium ${sel ? "text-primary" : "text-foreground"}`}>{f.name}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">HP {f.maxHp} · AC {f.ac}</span>
                          </div>
                          <p className="text-xs text-muted-foreground/70 mt-0.5 leading-snug">{f.description}</p>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground/50 mt-1 italic">✦ Special Chain-only familiars. Changing type resets familiar HP to max.</p>
                </div>
              )}

              {/* Invocations */}
              {currentLevel >= 2 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-muted-foreground uppercase tracking-widest">Eldritch Invocations</div>
                    <span className={`text-xs font-medium ${missingCount > 0 ? "text-amber-500" : "text-primary"}`}>
                      {warlockInvocations.length} known{missingCount > 0 ? ` · ${missingCount} unchosen` : ""}
                    </span>
                  </div>

                  {/* Known invocations */}
                  {warlockInvocations.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {warlockInvocations.map(name => (
                        <span key={name} className="flex items-center gap-1 px-2 py-0.5 rounded border border-primary/30 bg-primary/5 text-xs text-primary">
                          {name}
                          <button onClick={() => setWarlockInvocations(prev => prev.filter(i => i !== name))}
                            className="text-primary/50 hover:text-primary ml-0.5">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Add invocations */}
                  <Input
                    value={warlockInvocationSearch}
                    onChange={e => setWarlockInvocationSearch(e.target.value)}
                    placeholder="Search invocations…"
                    className="h-7 text-xs bg-card border-border mb-2"
                  />
                  {available.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 italic">
                      {warlockInvocationSearch ? "No matches." : "All available invocations already known."}
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-52 overflow-y-auto">
                      {available.map(inv => (
                        <button key={inv.name} onClick={() => setWarlockInvocations(prev => [...prev, inv.name])}
                          className="w-full text-left rounded border border-border hover:border-primary/50 p-2 transition-all group">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {inv.prereqPact && <span className="text-xs text-primary/70">✦</span>}
                              <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">{inv.name}</span>
                              {inv.prereqLevel && <span className="text-xs text-muted-foreground/50">Lvl {inv.prereqLevel}+</span>}
                            </div>
                            <Plus className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary" />
                          </div>
                          <p className="text-xs text-muted-foreground/70 mt-0.5 leading-snug">{inv.description}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {currentLevel < 2 && (
                <p className="text-xs text-muted-foreground/60 italic">Eldritch Invocations are granted at level 2.</p>
              )}
            </div>
          );
        })()}

        {tab === "ranger" && (() => {
          const charLevel = char?.level ?? 1;
          const charProfBonus = char?.proficiencyBonus ?? 2;
          const calcPrimal = (entry: PrimalBeastEntry) => {
            const ab = abilityMod(entry.abilityKey === "str" ? entry.baseStr : entry.baseDex);
            return { maxHp: entry.hpFormula(charLevel), ac: entry.acFormula(charProfBonus), attackBonus: charProfBonus + ab, damage: entry.damageFormula(charProfBonus, ab) };
          };
          return (
            <div className="space-y-4">
              {/* Mode selector */}
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Companion Rules</div>
                <div className="grid grid-cols-2 gap-2">
                  {(["primal", "beast"] as const).map(m => (
                    <button key={m} onClick={() => setRangerMode(m)}
                      className={`rounded border p-2 text-xs font-medium transition-all ${rangerMode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                      {m === "primal" ? "Tasha's Primal (TCoE)" : "PHB Beast"}
                    </button>
                  ))}
                </div>
              </div>

              {rangerMode === "primal" && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Primal Companion</div>
                  {PRIMAL_BEAST_DATA.map(entry => {
                    const sel = rangerPrimalType === entry.primalType;
                    const stats = calcPrimal(entry);
                    return (
                      <button key={entry.primalType} onClick={() => setRangerPrimalType(entry.primalType)}
                        className={`w-full text-left rounded border p-2.5 transition-all ${sel ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-sm font-medium ${sel ? "text-primary" : "text-foreground"}`}>{entry.name}</span>
                          <span className="text-xs text-muted-foreground">HP {stats.maxHp} · AC {stats.ac} · +{stats.attackBonus} {entry.attack}</span>
                        </div>
                        <p className="text-xs text-muted-foreground/70 leading-snug">{entry.description}</p>
                        <div className="flex flex-wrap gap-x-3 mt-1">
                          <span className="text-xs text-muted-foreground/60">Speed: {entry.speed}</span>
                          <span className="text-xs text-muted-foreground/60">Damage: {stats.damage}</span>
                        </div>
                        <p className="text-xs text-primary/60 mt-1 leading-snug italic">{entry.special}</p>
                      </button>
                    );
                  })}
                  <p className="text-xs text-muted-foreground/50 italic">HP and AC scale with ranger level and proficiency bonus. Use <strong>Recalculate Stats</strong> in the character sheet after leveling up.</p>
                </div>
              )}

              {rangerMode === "beast" && (
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">PHB Beast (CR ≤ 1/4)</div>
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {BEASTMASTER_PHB_BEASTS.map(beast => {
                      const sel = rangerBeastName === beast.name;
                      return (
                        <button key={beast.name} onClick={() => setRangerBeastName(beast.name)}
                          className={`w-full text-left rounded border p-2.5 transition-all ${sel ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium ${sel ? "text-primary" : "text-foreground"}`}>{beast.name}</span>
                              <span className="text-xs text-muted-foreground/50">CR {beast.cr}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">HP {beast.hp} · AC {beast.ac}</span>
                          </div>
                          <div className="text-xs text-primary/70">{beast.attack} +{beast.attackBonus} · {beast.damage} · {beast.speed}</div>
                          <p className="text-xs text-muted-foreground/60 mt-0.5 leading-snug">{beast.notes}</p>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground/50 italic">PHB companions use a fixed stat block. Adjust HP in the character sheet after taking damage.</p>
                </div>
              )}
            </div>
          );
        })()}

        {tab === "familiar" && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Find Familiar</div>
            <p className="text-xs text-muted-foreground/70 leading-snug">Choose the form your familiar currently takes. Changing forms is possible each time you cast Find Familiar (1 hour ritual). Current HP resets only when you pick a different form.</p>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              <button onClick={() => setFfFamiliarType(null)}
                className={`w-full text-left rounded border p-2 transition-all ${ffFamiliarType === null ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                <span className="text-xs font-medium">No familiar (dismissed / not yet summoned)</span>
              </button>
              {STANDARD_FAMILIAR_TYPES.map(f => {
                const sel = ffFamiliarType === f.name;
                return (
                  <button key={f.name} onClick={() => setFfFamiliarType(f.name)}
                    className={`w-full text-left rounded border p-2 transition-all ${sel ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium ${sel ? "text-primary" : "text-foreground"}`}>{f.name}</span>
                      <span className="text-xs text-muted-foreground">HP {f.maxHp} · AC {f.ac}</span>
                    </div>
                    <p className="text-xs text-muted-foreground/70 mt-0.5 leading-snug">{f.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="pt-2 border-t border-border">
          <Button variant="outline" onClick={onClose} className="border-border text-muted-foreground hover:text-foreground">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90 font-serif">
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dice Tray ─────────────────────────────────────────────────────────────

type DiceTrayChar = {
  strength?: number | null; dexterity?: number | null; constitution?: number | null;
  intelligence?: number | null; wisdom?: number | null; charisma?: number | null;
  proficiencyBonus?: number | null; skillProficiencies?: unknown; savingThrowProficiencies?: unknown;
};

function DiceTray({ onRoll, charData }: { onRoll: (roll: DiceRoll) => void; charData?: DiceTrayChar | null }) {
  const rollDiceApi = useRollDice();
  const [rolling, setRolling] = useState<number | null>(null);
  const [displayVal, setDisplayVal] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pendingD20, setPendingD20] = useState<DiceRoll | null>(null);

  async function handleRoll(sides: number) {
    if (pendingD20) setPendingD20(null);
    setRolling(sides);
    setDisplayVal(Math.ceil(Math.random() * sides));
    intervalRef.current = setInterval(() => {
      setDisplayVal(Math.ceil(Math.random() * sides));
    }, 70);
    try {
      const result = await rollDiceApi.mutateAsync({ data: { expression: `1d${sides}` } });
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setDisplayVal(result.total);
      const roll: DiceRoll = { expression: result.expression, label: result.label ?? null, total: result.total, rolls: result.rolls, modifier: result.modifier, details: result.details };
      if (sides === 20 && charData) {
        setPendingD20(roll);
      } else {
        onRoll(roll);
      }
      await new Promise(r => setTimeout(r, 350));
    } finally {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setRolling(null);
    }
  }

  function applyChoice(skillKey: string | null) {
    if (!pendingD20) return;
    if (!skillKey || !charData) {
      onRoll(pendingD20);
      setPendingD20(null);
      return;
    }
    const { totalMod, label } = getCheckModifier(skillKey, charData);
    const natural = pendingD20.rolls[0];
    const newTotal = natural + totalMod;
    const sign = totalMod >= 0 ? `+${totalMod}` : `${totalMod}`;
    const enhanced: DiceRoll = {
      ...pendingD20,
      total: newTotal,
      label,
      modifier: totalMod,
      expression: totalMod !== 0 ? `1d20${sign}` : "1d20",
      details: totalMod !== 0 ? `[${natural}] ${sign}` : `[${natural}]`,
    };
    onRoll(enhanced);
    setPendingD20(null);
  }

  // Pre-compute all modifiers so they appear instantly in the picker
  const skillChoices = charData
    ? Object.keys(SKILL_ABILITY_MAP).map(skill => {
        const { totalMod, isProficient } = getCheckModifier(skill, charData);
        const ability = SKILL_ABILITY_MAP[skill].slice(0, 3).toUpperCase();
        return { key: skill, name: skill, ability, mod: totalMod, isProficient };
      })
    : [];
  const saveChoices = charData
    ? Object.entries(ABILITY_TO_STAT).map(([abilityName]) => {
        const saveKey = `${abilityName} saving throw`;
        const { totalMod, isProficient } = getCheckModifier(saveKey, charData);
        return { key: saveKey, name: abilityName.slice(0, 3).toUpperCase(), mod: totalMod, isProficient };
      })
    : [];

  return (
    <div className="space-y-2">
      {/* Modifier picker — shown after d20 roll */}
      {pendingD20 && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5 space-y-2.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-serif text-primary">
              Rolled <span className="font-black text-sm">{pendingD20.rolls[0]}</span> — add modifier?
            </span>
            <button onClick={() => applyChoice(null)}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded border border-border/50 hover:border-border flex-shrink-0">
              Raw / No modifier
            </button>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1.5">Skill Checks</div>
            <div className="flex flex-wrap gap-1">
              {skillChoices.map(s => (
                <button key={s.key} onClick={() => applyChoice(s.key)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/60 bg-background hover:border-primary/60 hover:bg-primary/10 transition-all group">
                  <span className="text-[11px] text-muted-foreground group-hover:text-foreground">{s.name}</span>
                  <span className="text-[9px] text-muted-foreground/40">{s.ability}</span>
                  {s.isProficient && <span className="text-primary/70 text-[9px] leading-none">★</span>}
                  <span className={`text-[11px] font-bold ${s.mod >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {s.mod >= 0 ? `+${s.mod}` : s.mod}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest mb-1.5">Saving Throws</div>
            <div className="flex flex-wrap gap-1">
              {saveChoices.map(s => (
                <button key={s.key} onClick={() => applyChoice(s.key)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-border/60 bg-background hover:border-primary/60 hover:bg-primary/10 transition-all group">
                  <span className="text-[11px] text-muted-foreground group-hover:text-foreground">{s.name} Save</span>
                  {s.isProficient && <span className="text-primary/70 text-[9px] leading-none">★</span>}
                  <span className={`text-[11px] font-bold ${s.mod >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {s.mod >= 0 ? `+${s.mod}` : s.mod}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dice buttons */}
      <div className="flex flex-wrap gap-2 items-center">
        {DICE_FACES.map(d => (
          <button key={d} data-testid={`button-roll-d${d}`} onClick={() => handleRoll(d)} disabled={rolling !== null}
            className={`relative w-10 h-10 rounded border font-serif font-bold transition-all flex items-center justify-center ${rolling === d ? "border-primary bg-primary/20 text-primary shadow-[0_0_8px_rgba(var(--primary)/0.4)]" : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"} disabled:opacity-50`}>
            {rolling === d
              ? <span className="text-base font-black tabular-nums leading-none">{displayVal}</span>
              : <span className="text-xs">{`d${d}`}</span>
            }
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── HP Bar ────────────────────────────────────────────────────────────────

function HPBar({ hp, maxHp, tempHp, campaignId }: { hp: number; maxHp: number; tempHp: number; campaignId: number }) {
  const [editing, setEditing] = useState(false);
  const [delta, setDelta] = useState("");
  const updateChar = useUpdateCharacter();
  const queryClient = useQueryClient();
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const hpColor = pct > 50 ? "bg-green-700" : pct > 25 ? "bg-yellow-600" : "bg-red-700";

  async function applyDelta(positive: boolean) {
    const n = parseInt(delta);
    if (isNaN(n) || n <= 0) return;
    const newHp = positive ? Math.min(maxHp, hp + n) : Math.max(0, hp - n);
    await updateChar.mutateAsync({ campaignId, data: { hp: newHp } });
    await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
    setDelta(""); setEditing(false);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">HP</span>
        <button onClick={() => setEditing(e => !e)} data-testid="button-edit-hp" className="text-primary hover:text-primary/80 font-bold font-serif">
          {hp}{tempHp > 0 ? `+${tempHp}` : ""} / {maxHp}
        </button>
      </div>
      <div className="w-full bg-card border border-border rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${hpColor}`} style={{ width: `${pct}%` }} />
      </div>
      {editing && (
        <div className="flex gap-1 mt-1">
          <input data-testid="input-hp-delta" type="number" value={delta} onChange={e => setDelta(e.target.value)} placeholder="Amount"
            className="flex-1 bg-card border border-border rounded px-2 py-1 text-xs text-foreground min-w-0" />
          <button onClick={() => applyDelta(true)} data-testid="button-heal" className="px-2 py-1 rounded bg-green-800/50 border border-green-700 text-green-300 text-xs hover:bg-green-800"><Plus className="w-3 h-3" /></button>
          <button onClick={() => applyDelta(false)} data-testid="button-damage" className="px-2 py-1 rounded bg-red-900/50 border border-red-800 text-red-300 text-xs hover:bg-red-900"><Minus className="w-3 h-3" /></button>
        </div>
      )}
    </div>
  );
}

// ─── Character Panel ───────────────────────────────────────────────────────

function CharacterPanel({ campaignId, onLevelUp }: { campaignId: number; onLevelUp?: (info: { newLevel: number; hitDie: number }) => void }) {
  const { data: char } = useGetCharacter(campaignId, { query: { queryKey: getGetCharacterQueryKey(campaignId) } });
  const { data: campaign } = useGetCampaign(campaignId, { query: { queryKey: getGetCampaignQueryKey(campaignId) } });
  const updateChar = useUpdateCharacter();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [expandedSpell, setExpandedSpell] = useState<string | null>(null);

  // These must be computed before any conditional return to satisfy Rules of Hooks
  const classResources = char ? ((char.classResources as ClassResource[] | null) ?? []) : [];
  const charSubclass = char ? ((char.subclass ?? null) || ((char.features as string[] | null)?.[0] ?? null)) : null;

  // Auto-initialize resources for pre-existing characters that have none
  // Must be before any early return to comply with Rules of Hooks
  useEffect(() => {
    if (!char || classResources.length > 0) return;
    const init = getClassResources(char.class, char.level ?? 1, charSubclass, { charisma: char.charisma }, []);
    if (init.length === 0) return;
    updateChar.mutateAsync({ campaignId, data: { classResources: init } })
      .then(() => queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) }))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char?.id]);

  if (!char) return <div className="p-4 text-muted-foreground text-sm font-serif italic">No character found.</div>;

  const lvl = char.level ?? 1;
  const xp = char.xp ?? 0;
  const xpNext = XP_THRESHOLDS[lvl] ?? 355000;
  const xpPrev = XP_THRESHOLDS[lvl - 1] ?? 0;
  const xpPct = Math.min(100, Math.max(0, ((xp - xpPrev) / (xpNext - xpPrev)) * 100));
  const spellSlots = (char.spellSlots as Record<string, number> | null) ?? {};
  const spellSlotsUsed = (char.spellSlotsUsed as Record<string, number> | null) ?? {};
  const conditions = (char.conditions as string[] | null) ?? [];
  const skills = (char.skillProficiencies as string[] | null) ?? [];
  const knownSpells = (char.knownSpells as string[] | null) ?? [];
  const invocations = (char.invocations as string[] | null) ?? [];
  const charMetamagic = (char.metamagic as string[] | null) ?? [];
  const charSubclassFeatures = (char.subclassFeatures as string[] | null) ?? [];
  const familiar = char.familiar as { type: string; hp: number; maxHp: number; ac: number } | null | undefined;
  const chainInvocations = invocations
    .map(name => ELDRITCH_INVOCATIONS.find(inv => inv.name === name))
    .filter((inv): inv is Invocation => !!inv && !!inv.chainApplies);
  const companion = char.companion as { mode: string; name: string; primalType?: string; hp: number; maxHp: number; ac: number; attackBonus: number; damage: string } | null | undefined;
  const primalEntry = companion?.mode === "primal" && companion.primalType
    ? PRIMAL_BEAST_DATA.find(b => b.primalType === companion.primalType) ?? null
    : null;
  const companionMaxHp = primalEntry ? primalEntry.hpFormula(char.level ?? 1) : (companion?.maxHp ?? 0);
  const companionAc = primalEntry ? primalEntry.acFormula(char.proficiencyBonus ?? 2) : (companion?.ac ?? 0);
  const companionAttackBonus = primalEntry
    ? (char.proficiencyBonus ?? 2) + abilityMod(primalEntry.abilityKey === "str" ? primalEntry.baseStr : primalEntry.baseDex)
    : (companion?.attackBonus ?? 0);
  const companionDamage = primalEntry
    ? primalEntry.damageFormula(char.proficiencyBonus ?? 2, abilityMod(primalEntry.abilityKey === "str" ? primalEntry.baseStr : primalEntry.baseDex))
    : (companion?.damage ?? "");
  const companionNeedsRecalc = !!(primalEntry && companion && companion.maxHp !== companionMaxHp);

  async function setResourceCurrent(id: string, value: number) {
    const updated = classResources.map(r => r.id === id ? { ...r, current: Math.max(0, Math.min(r.max, value)) } : r);
    await updateChar.mutateAsync({ campaignId, data: { classResources: updated } });
    await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
  }

  async function adjustSpellSlot(level: string, delta: number) {
    const currentUsed = spellSlotsUsed[level] ?? 0;
    const max = spellSlots[level] ?? 0;
    const newUsed = Math.max(0, Math.min(max, currentUsed - delta));
    await updateChar.mutateAsync({ campaignId, data: { spellSlotsUsed: { ...spellSlotsUsed, [level]: newUsed } } });
    await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
  }

  async function performShortRest() {
    const updated = classResources.map(r => r.rechargeOn === "short" ? { ...r, current: r.max } : r);
    await updateChar.mutateAsync({ campaignId, data: { classResources: updated } });
    await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
  }

  async function performLongRest() {
    if (!char) return;
    const updated = classResources.map(r => ({ ...r, current: r.max }));
    const slots = (char.spellSlots as Record<string, number> | null) ?? {};
    const resetUsed = Object.fromEntries(Object.keys(slots).map(k => [k, 0]));
    await updateChar.mutateAsync({
      campaignId,
      data: {
        hp: char.maxHp ?? 10,
        tempHp: 0,
        classResources: updated,
        ...(Object.keys(slots).length > 0 ? { spellSlotsUsed: resetUsed } : {}),
      },
    });
    await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
  }

  async function adjustFamiliarHp(delta: number) {
    if (!familiar) return;
    const newHp = Math.max(0, Math.min(familiar.maxHp, familiar.hp + delta));
    if (newHp === familiar.hp) return;
    await updateChar.mutateAsync({ campaignId, data: { familiar: { ...familiar, hp: newHp } } });
    await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
  }

  async function dismissFamiliar() {
    await updateChar.mutateAsync({ campaignId, data: { familiar: null } });
    await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
  }

  async function adjustCompanionHp(delta: number) {
    if (!companion) return;
    const newHp = Math.max(0, Math.min(companionMaxHp, companion.hp + delta));
    if (newHp === companion.hp) return;
    await updateChar.mutateAsync({ campaignId, data: { companion: { ...companion, hp: newHp, maxHp: companionMaxHp } } });
    await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
  }

  async function recalculateCompanion() {
    if (!companion || !primalEntry || !char) return;
    const profBonus = char.proficiencyBonus ?? 2;
    const ab = abilityMod(primalEntry.abilityKey === "str" ? primalEntry.baseStr : primalEntry.baseDex);
    const newMaxHp = primalEntry.hpFormula(char.level ?? 1);
    await updateChar.mutateAsync({ campaignId, data: { companion: { ...companion, hp: Math.min(companion.hp, newMaxHp), maxHp: newMaxHp, ac: primalEntry.acFormula(profBonus), attackBonus: profBonus + ab, damage: primalEntry.damageFormula(profBonus, ab) } } });
    await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
  }

  async function dismissCompanion() {
    await updateChar.mutateAsync({ campaignId, data: { companion: null } });
    await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-5 scrollbar-thin">
      {/* Portrait */}
      <div className="text-center relative">
        <div className="w-20 h-20 mx-auto rounded-full border-2 border-primary/40 bg-card flex items-center justify-center mb-2 overflow-hidden">
          {char.portraitUrl ? <img src={char.portraitUrl} alt={char.name} className="w-full h-full object-cover" /> : <User className="w-8 h-8 text-muted-foreground/50" />}
        </div>
        <div className="font-serif text-base font-bold text-foreground" data-testid="text-character-name">{char.name}</div>
        <div className="text-xs text-muted-foreground">{char.race} {char.class}</div>
        {(char.features as string[] | null)?.[0] && (
          <div className="text-xs text-primary/70 italic">{(char.features as string[])[0]}</div>
        )}
        <div className="text-xs text-primary font-bold">Level {lvl}</div>
        {char.portraitDescription && (
          <details className="mt-1">
            <summary className="text-xs text-muted-foreground/60 cursor-pointer hover:text-muted-foreground">Portrait</summary>
            <p className="text-xs text-muted-foreground/80 mt-1 font-serif italic leading-relaxed">{char.portraitDescription}</p>
          </details>
        )}
        <button onClick={() => setEditOpen(true)} data-testid="button-edit-character"
          title="Edit character sheet"
          className="absolute top-0 right-0 p-1.5 rounded text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* XP */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>XP</span><span data-testid="text-xp">{xp} / {xpNext}</span>
        </div>
        <div className="w-full bg-card border border-border rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${xpPct}%` }} />
        </div>
        {xp >= xpNext && lvl < 20 && (
          <button
            onClick={() => onLevelUp?.({ newLevel: lvl + 1, hitDie: CLASS_HIT_DICE[char.class] ?? 8 })}
            className="w-full mt-1 py-1.5 rounded border border-primary/60 bg-primary/10 text-primary text-xs font-serif font-bold hover:bg-primary/20 transition-colors">
            ✦ Level Up Available — Click to claim
          </button>
        )}
      </div>

      {/* HP + stats */}
      <div className="space-y-2">
        <HPBar hp={char.hp ?? 10} maxHp={char.maxHp ?? 10} tempHp={char.tempHp ?? 0} campaignId={campaignId} />
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-card border border-border rounded p-1.5">
            <Shield className="w-3 h-3 mx-auto text-primary mb-0.5" />
            <div className="font-bold text-foreground" data-testid="text-ac">{char.ac}</div>
            <div className="text-muted-foreground">AC</div>
          </div>
          <div className="bg-card border border-border rounded p-1.5">
            <Zap className="w-3 h-3 mx-auto text-primary mb-0.5" />
            <div className="font-bold text-foreground">{char.speed}</div>
            <div className="text-muted-foreground">Speed</div>
          </div>
          <div className="bg-card border border-border rounded p-1.5">
            <Star className="w-3 h-3 mx-auto text-primary mb-0.5" />
            <div className="font-bold text-foreground">+{char.proficiencyBonus}</div>
            <div className="text-muted-foreground">Prof</div>
          </div>
        </div>
      </div>

      {/* Abilities */}
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Abilities</div>
        <div className="grid grid-cols-3 gap-1.5">
          {ABILITY_KEYS.map(k => (
            <div key={k} className="bg-card border border-border rounded p-1.5 text-center">
              <div className="text-xs text-muted-foreground uppercase">{ABILITY_LABELS[k]}</div>
              <div className="font-serif font-bold text-sm text-foreground">{(char as unknown as Record<string, number>)[k]}</div>
              <div className="text-xs text-primary">{modStr((char as unknown as Record<string, number>)[k])}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Saving throw proficiencies */}
      {(char.savingThrowProficiencies as string[] | null)?.length ? (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5">Saving Throws</div>
          <div className="flex flex-wrap gap-1">
            {(char.savingThrowProficiencies as string[]).map(s => (
              <Badge key={s} variant="outline" className="text-xs border-border/50 text-muted-foreground py-0">{s.slice(0, 3).toUpperCase()}</Badge>
            ))}
          </div>
        </div>
      ) : null}

      {/* Skill proficiencies */}
      {skills.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5">Skill Proficiencies</div>
          <div className="flex flex-wrap gap-1">
            {skills.map(s => <Badge key={s} variant="outline" className="text-xs border-primary/30 text-primary/70 py-0">{s}</Badge>)}
          </div>
        </div>
      )}

      {/* Spell slots */}
      {Object.keys(spellSlots).length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Spell Slots</div>
          <div className="space-y-2">
            {Object.entries(spellSlots)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([lvl, max]) => {
                const used = spellSlotsUsed[lvl] ?? 0;
                const remaining = max - used;
                return (
                  <div key={lvl}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Level {lvl}</span>
                      <span className={`text-xs font-medium tabular-nums ${remaining > 0 ? "text-primary" : "text-muted-foreground/40"}`}>
                        {remaining} / {max}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {Array.from({ length: max }, (_, i) => {
                        const isFilled = i < remaining;
                        return (
                          <button
                            key={i}
                            onClick={() => adjustSpellSlot(lvl, isFilled ? -1 : 1)}
                            disabled={updateChar.isPending}
                            title={isFilled ? "Click to expend this slot" : "Click to restore this slot"}
                            className={`w-4 h-4 rounded-full border transition-all disabled:opacity-40 ${isFilled ? "bg-primary border-primary hover:bg-primary/60" : "bg-transparent border-primary/25 hover:border-primary/60"}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Known spells */}
      {knownSpells.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5">Known Spells</div>
          <div className="flex flex-wrap gap-1">
            {knownSpells.map(s => {
              const desc = SPELL_DESCRIPTIONS[s];
              const isExpanded = expandedSpell === s;
              return (
                <div key={s} className="w-full">
                  <button
                    onClick={() => setExpandedSpell(isExpanded ? null : s)}
                    className={`px-2 py-0.5 rounded border text-xs transition-all text-left ${isExpanded ? "border-primary/40 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground/70 hover:border-primary/30 hover:text-foreground/80"}`}
                  >
                    {s}{desc ? <span className="ml-0.5 opacity-50">▾</span> : ""}
                  </button>
                  {isExpanded && desc && (
                    <p className="mt-0.5 mb-1 px-2 text-xs text-muted-foreground/70 leading-snug italic">{desc}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Eldritch Invocations */}
      {invocations.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5">Eldritch Invocations</div>
          <div className="space-y-1">
            {invocations.map(name => {
              const inv = ELDRITCH_INVOCATIONS.find(i => i.name === name);
              return (
                <div key={name} className="bg-card border border-border/50 rounded px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    {inv?.chainApplies && <span className="text-xs text-primary/70">✦</span>}
                    <span className="text-xs font-medium text-foreground">{name}</span>
                  </div>
                  {inv && <p className="text-xs text-muted-foreground/70 mt-0.5 leading-snug">{inv.description}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subclass Features (Totems, Maneuvers, Disciplines, etc.) */}
      {charSubclassFeatures.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5">
            {char.class === "Fighter" ? "Combat Maneuvers"
              : char.class === "Monk" ? "Elemental Disciplines"
              : char.class === "Barbarian" ? "Totem Features"
              : char.class === "Ranger" ? "Hunter Features"
              : "Subclass Features"}
          </div>
          <div className="space-y-1">
            {charSubclassFeatures.map(name => {
              const allOptions = [
                ...TOTEM_SPIRIT_OPTIONS, ...ASPECT_BEAST_OPTIONS, ...TOTEMIC_ATTUNEMENT_OPTIONS,
                ...BATTLE_MASTER_MANEUVERS,
                ...FOUR_ELEMENTS_DISCIPLINES,
                ...HUNTER_PREY_OPTIONS, ...HUNTER_DEFENSIVE_TACTICS, ...HUNTER_MULTIATTACK,
                ...SWORDS_FIGHTING_STYLES,
              ];
              const opt = allOptions.find(o => o.name === name);
              return (
                <div key={name} className="bg-card border border-border/50 rounded px-2 py-1.5">
                  <span className="text-xs font-medium text-foreground">{name}</span>
                  {opt && <p className="text-xs text-muted-foreground/70 mt-0.5 leading-snug">{opt.description}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Metamagic */}
      {charMetamagic.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5">Metamagic</div>
          <div className="space-y-1">
            {charMetamagic.map(name => {
              const mm = METAMAGIC_OPTIONS.find(m => m.name === name);
              return (
                <div key={name} className="bg-card border border-border/50 rounded px-2 py-1.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium text-foreground">{name}</span>
                    {mm && <span className="text-xs text-primary/70 font-medium ml-2 shrink-0">{mm.cost}</span>}
                  </div>
                  {mm && <p className="text-xs text-muted-foreground/70 leading-snug">{mm.description}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Familiar (Pact of the Chain) */}
      {familiar && (
        <div className="bg-card border border-primary/20 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground uppercase tracking-widest">Familiar</div>
            <button onClick={dismissFamiliar} disabled={updateChar.isPending}
              className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors">
              Dismiss
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-primary text-base">🐾</span>
            <div>
              <div className="text-sm font-medium text-foreground">{familiar.type}</div>
              <div className="text-xs text-muted-foreground">AC {familiar.ac}</div>
            </div>
          </div>
          {/* Familiar HP bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">HP</span>
              <span className={familiar.hp <= 0 ? "text-destructive font-bold" : familiar.hp <= Math.floor(familiar.maxHp / 2) ? "text-amber-500" : "text-green-400"}>
                {familiar.hp} / {familiar.maxHp}
              </span>
            </div>
            <div className="w-full bg-background border border-border rounded-full h-1.5 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${familiar.hp <= 0 ? "bg-destructive" : familiar.hp <= Math.floor(familiar.maxHp / 2) ? "bg-amber-500" : "bg-green-500"}`}
                style={{ width: `${Math.max(0, (familiar.hp / familiar.maxHp) * 100)}%` }} />
            </div>
            <div className="flex gap-1.5 justify-center pt-0.5">
              {[-5, -1, +1, +5].map(delta => (
                <button key={delta} onClick={() => adjustFamiliarHp(delta)} disabled={updateChar.isPending}
                  className={`px-2 py-0.5 rounded border text-xs transition-all hover:bg-primary/10 ${delta < 0 ? "border-destructive/50 text-destructive/80" : "border-green-600/50 text-green-400"} disabled:opacity-40`}>
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
            </div>
          </div>
          {/* Active Chain invocations */}
          {chainInvocations.length > 0 && (
            <div className="pt-1 border-t border-border/40 space-y-1">
              <div className="text-xs text-muted-foreground/60 uppercase tracking-widest">Chain Invocations Active</div>
              {chainInvocations.map(inv => (
                <div key={inv.name} className="flex items-start gap-1.5">
                  <span className="text-primary/70 text-xs mt-0.5">✦</span>
                  <div>
                    <span className="text-xs font-medium text-primary/90">{inv.name}</span>
                    <p className="text-xs text-muted-foreground/70 leading-snug">{inv.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pact Boon (no familiar) */}
      {char.pactBoon && !familiar && (
        <div className="bg-card border border-border/50 rounded p-2">
          <span className="text-xs text-muted-foreground uppercase tracking-widest">Pact Boon </span>
          <span className="text-xs text-primary font-medium">{char.pactBoon as string}</span>
        </div>
      )}

      {/* Animal Companion / Primal Beast */}
      {companion && (
        <div className="bg-card border border-primary/20 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground uppercase tracking-widest">
              {companion.mode === "primal" ? "Primal Companion" : "Animal Companion"}
            </div>
            <button onClick={dismissCompanion} disabled={updateChar.isPending}
              className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors px-1.5 py-0.5 rounded hover:bg-destructive/10">
              Release
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-foreground">{companion.name}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>AC {companionAc}</span>
              <span>+{companionAttackBonus} {companion.mode === "primal" ? (primalEntry?.attack ?? "Attack") : "Attack"}</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground/70">{companionDamage}</div>
          {/* HP bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">HP</span>
              <span className={companion.hp <= 0 ? "text-xs text-destructive font-bold" : companion.hp <= Math.floor(companionMaxHp / 2) ? "text-xs text-amber-500" : "text-xs text-green-400"}>
                {companion.hp} / {companionMaxHp}
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${companion.hp <= 0 ? "bg-destructive" : companion.hp <= Math.floor(companionMaxHp / 2) ? "bg-amber-500" : "bg-green-500"}`}
                style={{ width: `${Math.max(0, (companion.hp / companionMaxHp) * 100)}%` }} />
            </div>
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {[-5, -1, +1, +5].map(delta => (
                <button key={delta} onClick={() => adjustCompanionHp(delta)} disabled={updateChar.isPending}
                  className={`flex-1 min-w-[2rem] text-xs rounded border py-0.5 transition-colors ${delta < 0 ? "border-destructive/40 text-destructive/70 hover:bg-destructive/10" : "border-green-600/40 text-green-500 hover:bg-green-600/10"}`}>
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
            </div>
          </div>
          {/* Recalculate stats for primal companions after level-up */}
          {companionNeedsRecalc && (
            <button onClick={recalculateCompanion} disabled={updateChar.isPending}
              className="w-full text-xs text-amber-500 border border-amber-500/30 rounded py-1 hover:bg-amber-500/10 transition-colors">
              ⚠ Recalculate Stats (leveled up — stored HP {companion.maxHp} → {companionMaxHp})
            </button>
          )}
          {/* Primal special ability */}
          {primalEntry && (
            <div className="pt-1 border-t border-border/40">
              <p className="text-xs text-muted-foreground/60 leading-snug italic">{primalEntry.special}</p>
            </div>
          )}
          {/* PHB beast notes */}
          {companion.mode === "beast" && (() => {
            const beastData = BEASTMASTER_PHB_BEASTS.find(b => b.name === companion.name);
            return beastData ? (
              <div className="pt-1 border-t border-border/40">
                <p className="text-xs text-muted-foreground/60 leading-snug">{beastData.notes}</p>
                <p className="text-xs text-muted-foreground/40 mt-0.5">Speed: {beastData.speed}</p>
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* Death saves */}
      {char.deathSaves && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Death Saves</div>
          <div className="flex gap-3">
            <div className="flex gap-1 items-center">
              <CheckCircle className="w-3 h-3 text-green-600" />
              {[0, 1, 2].map(i => <div key={i} className={`w-3 h-3 rounded-full border ${i < (char.deathSaves as { successes: number }).successes ? "bg-green-600 border-green-600" : "border-border"}`} />)}
            </div>
            <div className="flex gap-1 items-center">
              <XCircle className="w-3 h-3 text-red-600" />
              {[0, 1, 2].map(i => <div key={i} className={`w-3 h-3 rounded-full border ${i < (char.deathSaves as { failures: number }).failures ? "bg-red-600 border-red-600" : "border-border"}`} />)}
            </div>
          </div>
        </div>
      )}

      {/* Conditions */}
      {conditions.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Conditions</div>
          <div className="flex flex-wrap gap-1">
            {conditions.map(c => <Badge key={c} variant="outline" className="text-xs border-destructive/50 text-destructive">{c}</Badge>)}
          </div>
        </div>
      )}

      {/* Class Resources */}
      {classResources.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Class Resources</div>
          <div className="space-y-2">
            {classResources.map(r => {
              const useDots = r.max <= 10 && r.max !== 99;
              const isEmpty = r.current === 0;
              return (
                <div key={r.id} className={`bg-card border rounded-lg p-2.5 transition-colors ${isEmpty ? "border-destructive/30 opacity-60" : "border-border"}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-foreground">{r.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground/55 bg-background border border-border/40 px-1 py-0.5 rounded">
                        {r.rechargeOn === "short" ? "⚡ Short" : "🌙 Long"}
                      </span>
                      <span className={`text-xs font-bold ${isEmpty ? "text-destructive" : "text-primary"}`}>
                        {r.current}/{r.max === 99 ? "∞" : r.max}
                      </span>
                    </div>
                  </div>
                  {useDots ? (
                    <div className="flex gap-1.5 flex-wrap">
                      {Array.from({ length: r.max }, (_, i) => (
                        <button
                          key={i}
                          onClick={() => setResourceCurrent(r.id, i < r.current ? i : i + 1)}
                          disabled={updateChar.isPending}
                          title={i < r.current ? "Mark as used" : "Restore"}
                          className={`w-4 h-4 rounded-full border transition-all disabled:opacity-40 ${
                            i < r.current
                              ? "bg-primary border-primary hover:bg-primary/60 hover:border-primary/60"
                              : "border-border/60 hover:border-primary/50 hover:bg-primary/10"
                          }`}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      {[-5, -1].map(d => (
                        <button key={d} onClick={() => setResourceCurrent(r.id, r.current + d)} disabled={updateChar.isPending}
                          className="px-1.5 py-0.5 rounded border border-destructive/40 text-destructive/70 text-xs hover:bg-destructive/10 transition-colors disabled:opacity-40">{d}</button>
                      ))}
                      <div className={`flex-1 text-center text-sm font-bold font-serif ${isEmpty ? "text-destructive" : "text-primary"}`}>{r.current}</div>
                      {[1, 5].map(d => (
                        <button key={d} onClick={() => setResourceCurrent(r.id, r.current + d)} disabled={updateChar.isPending}
                          className="px-1.5 py-0.5 rounded border border-green-600/40 text-green-500 text-xs hover:bg-green-600/10 transition-colors disabled:opacity-40">+{d}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Gold */}
      <div className="flex items-center justify-between bg-card border border-border rounded p-2">
        <span className="text-xs text-muted-foreground">Gold</span>
        <span className="font-serif font-bold text-primary" data-testid="text-gold">{campaign?.gold ?? 0} gp</span>
      </div>

      {/* Rest buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={performShortRest}
          disabled={updateChar.isPending}
          className="py-1.5 rounded border border-border text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-all font-serif disabled:opacity-40">
          ⚡ Short Rest
        </button>
        <button
          onClick={performLongRest}
          disabled={updateChar.isPending}
          className="py-1.5 rounded border border-primary/40 bg-primary/5 text-xs text-primary hover:bg-primary/10 transition-all font-serif disabled:opacity-40">
          🌙 Long Rest
        </button>
      </div>

      {editOpen && <EditCharacterModal campaignId={campaignId} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

// ─── Chat Message ──────────────────────────────────────────────────────────

function ChatMessage({ msg }: { msg: Message }) {
  if (msg.role === "system") return null;
  const isAI = msg.role === "assistant";
  const rolls = (msg.diceRolls as DiceRoll[] | null) ?? [];
  return (
    <div className={`space-y-2 ${isAI ? "" : "flex flex-col items-end"}`}>
      {rolls.map((roll, i) => (
        <div key={i} className="bg-primary/10 border border-primary/30 rounded p-3 inline-flex gap-3 items-center self-end">
          <Dices className="w-4 h-4 text-primary flex-shrink-0" />
          <div>
            <div className="text-xs text-muted-foreground">{roll.expression}{roll.label ? ` — ${roll.label}` : ""}</div>
            <div className="font-serif font-bold text-primary text-lg leading-none">{roll.total}</div>
            <div className="text-xs text-muted-foreground/70">{roll.details}</div>
          </div>
        </div>
      ))}
      <div className={`rounded-lg px-4 py-3 max-w-full ${isAI ? "bg-card border border-border text-foreground font-serif leading-relaxed text-[0.95rem]" : "bg-primary/15 border border-primary/25 text-foreground text-sm"}`}>
        <div className="whitespace-pre-wrap">{msg.content}</div>
      </div>
    </div>
  );
}

// ─── Spell Progression Data ─────────────────────────────────────────────────

type SpellGain = { spells?: number; cantrips?: number; maxSlotLevel: number; isPrepared?: boolean };
const SPELL_GAINS: Record<string, Record<number, SpellGain>> = {
  Wizard:   { 2:{spells:2,maxSlotLevel:1}, 3:{spells:2,maxSlotLevel:2}, 4:{spells:2,maxSlotLevel:2}, 5:{spells:2,maxSlotLevel:3} },
  Bard:     { 2:{spells:1,maxSlotLevel:1}, 3:{spells:1,maxSlotLevel:2}, 4:{spells:1,cantrips:1,maxSlotLevel:2}, 5:{spells:1,maxSlotLevel:3} },
  Sorcerer: { 2:{spells:1,maxSlotLevel:1}, 3:{spells:1,maxSlotLevel:2}, 4:{spells:1,cantrips:1,maxSlotLevel:2}, 5:{spells:1,maxSlotLevel:3} },
  Warlock:  { 2:{spells:1,maxSlotLevel:1}, 3:{spells:1,maxSlotLevel:2}, 4:{spells:1,maxSlotLevel:2}, 5:{spells:1,maxSlotLevel:3} },
  Ranger:   { 2:{spells:2,maxSlotLevel:1}, 3:{spells:1,maxSlotLevel:1}, 4:{spells:1,maxSlotLevel:1}, 5:{spells:1,maxSlotLevel:2} },
  Paladin:  { 2:{spells:2,maxSlotLevel:1}, 3:{spells:1,maxSlotLevel:1}, 4:{spells:1,maxSlotLevel:1}, 5:{spells:1,maxSlotLevel:2} },
  Cleric:   { 3:{maxSlotLevel:2,isPrepared:true}, 5:{maxSlotLevel:3,isPrepared:true} },
  Druid:    { 3:{maxSlotLevel:2,isPrepared:true}, 5:{maxSlotLevel:3,isPrepared:true} },
};

type SpellPool = { cantrips?: string[]; "1"?: string[]; "2"?: string[]; "3"?: string[] };
const CLASS_SPELL_POOL: Record<string, SpellPool> = {
  Wizard: {
    cantrips: ["Acid Splash","Blade Ward","Chill Touch","Dancing Lights","Fire Bolt","Friends","Light","Mage Hand","Mending","Message","Minor Illusion","Poison Spray","Prestidigitation","Ray of Frost","Shocking Grasp","True Strike"],
    "1": ["Alarm","Burning Hands","Charm Person","Chromatic Orb","Color Spray","Comprehend Languages","Detect Magic","Disguise Self","Expeditious Retreat","False Life","Feather Fall","Fog Cloud","Grease","Identify","Jump","Longstrider","Mage Armor","Magic Missile","Protection from Evil and Good","Ray of Sickness","Shield","Silent Image","Sleep","Tasha's Hideous Laughter","Thunderwave","Unseen Servant","Witch Bolt"],
    "2": ["Alter Self","Blindness/Deafness","Blur","Cloud of Daggers","Crown of Madness","Darkness","Darkvision","Detect Thoughts","Enhance Ability","Enlarge/Reduce","Flaming Sphere","Hold Person","Invisibility","Knock","Levitate","Magic Weapon","Melf's Acid Arrow","Mirror Image","Misty Step","Phantasmal Force","Ray of Enfeeblement","Scorching Ray","See Invisibility","Shatter","Spider Climb","Suggestion","Web"],
    "3": ["Animate Dead","Bestow Curse","Blink","Clairvoyance","Counterspell","Dispel Magic","Fear","Fireball","Fly","Gaseous Form","Haste","Hypnotic Pattern","Lightning Bolt","Major Image","Nondetection","Protection from Energy","Remove Curse","Sending","Slow","Stinking Cloud","Tongues","Vampiric Touch"],
  },
  Bard: {
    cantrips: ["Blade Ward","Dancing Lights","Friends","Light","Mage Hand","Mending","Message","Minor Illusion","Prestidigitation","True Strike","Thunderclap","Vicious Mockery"],
    "1": ["Animal Friendship","Bane","Charm Person","Color Spray","Command","Comprehend Languages","Cure Wounds","Detect Magic","Disguise Self","Dissonant Whispers","Faerie Fire","Feather Fall","Healing Word","Heroism","Identify","Longstrider","Silent Image","Sleep","Speak with Animals","Tasha's Hideous Laughter","Thunderwave","Unseen Servant"],
    "2": ["Animal Messenger","Blindness/Deafness","Calm Emotions","Cloud of Daggers","Crown of Madness","Detect Thoughts","Enhance Ability","Enthrall","Heat Metal","Hold Person","Invisibility","Knock","Locate Object","Mirror Image","Misty Step","Phantasmal Force","See Invisibility","Shatter","Silence","Suggestion","Zone of Truth"],
    "3": ["Bestow Curse","Clairvoyance","Dispel Magic","Fear","Hypnotic Pattern","Major Image","Nondetection","Plant Growth","Remove Curse","Sending","Speak with Dead","Stinking Cloud","Tongues"],
  },
  Sorcerer: {
    cantrips: ["Acid Splash","Blade Ward","Chill Touch","Dancing Lights","Fire Bolt","Friends","Light","Mage Hand","Mending","Message","Minor Illusion","Poison Spray","Prestidigitation","Ray of Frost","Shocking Grasp","True Strike","Thunderclap","Booming Blade"],
    "1": ["Burning Hands","Charm Person","Chromatic Orb","Color Spray","Comprehend Languages","Detect Magic","Disguise Self","Expeditious Retreat","False Life","Feather Fall","Fog Cloud","Jump","Mage Armor","Magic Missile","Protection from Evil and Good","Ray of Sickness","Shield","Silent Image","Sleep","Thunderwave","Witch Bolt","Absorb Elements"],
    "2": ["Blindness/Deafness","Blur","Cloud of Daggers","Crown of Madness","Darkness","Darkvision","Detect Thoughts","Enhance Ability","Enlarge/Reduce","Gust of Wind","Hold Person","Invisibility","Knock","Levitate","Mirror Image","Misty Step","Phantasmal Force","Scorching Ray","See Invisibility","Shatter","Spider Climb","Suggestion","Web"],
    "3": ["Blink","Clairvoyance","Counterspell","Daylight","Dispel Magic","Fear","Fireball","Fly","Gaseous Form","Haste","Hypnotic Pattern","Lightning Bolt","Major Image","Protection from Energy","Slow","Stinking Cloud","Tongues","Water Breathing"],
  },
  Warlock: {
    cantrips: ["Blade Ward","Chill Touch","Eldritch Blast","Friends","Mage Hand","Minor Illusion","Poison Spray","Prestidigitation","True Strike","Booming Blade","Green-Flame Blade"],
    "1": ["Armor of Agathys","Arms of Hadar","Charm Person","Comprehend Languages","Expeditious Retreat","Hellish Rebuke","Hex","Protection from Evil and Good","Unseen Servant","Witch Bolt","Cause Fear"],
    "2": ["Cloud of Daggers","Crown of Madness","Darkness","Enthrall","Hold Person","Invisibility","Mirror Image","Misty Step","Ray of Enfeeblement","Shatter","Spider Climb","Suggestion"],
    "3": ["Counterspell","Dispel Magic","Fear","Fly","Gaseous Form","Hunger of Hadar","Hypnotic Pattern","Magic Circle","Major Image","Remove Curse","Tongues","Vampiric Touch"],
  },
  Ranger: {
    "1": ["Alarm","Animal Friendship","Cure Wounds","Detect Magic","Detect Poison and Disease","Ensnaring Strike","Fog Cloud","Goodberry","Hail of Thorns","Hunter's Mark","Jump","Longstrider","Speak with Animals"],
    "2": ["Animal Messenger","Barkskin","Cordon of Arrows","Darkvision","Find Traps","Lesser Restoration","Locate Animals or Plants","Locate Object","Pass Without Trace","Protection from Poison","Silence","Spike Growth"],
  },
  Paladin: {
    "1": ["Bless","Command","Compelled Duel","Cure Wounds","Detect Evil and Good","Detect Magic","Detect Poison and Disease","Divine Favor","Heroism","Protection from Evil and Good","Purify Food and Drink","Searing Smite","Shield of Faith","Thunderous Smite","Wrathful Smite"],
    "2": ["Aid","Branding Smite","Find Steed","Lesser Restoration","Locate Object","Magic Weapon","Protection from Poison","Zone of Truth"],
  },
  Cleric: {
    "1": ["Bane","Bless","Command","Create or Destroy Water","Cure Wounds","Detect Evil and Good","Detect Magic","Detect Poison and Disease","Guiding Bolt","Healing Word","Inflict Wounds","Protection from Evil and Good","Purify Food and Drink","Sanctuary","Shield of Faith","Thunderwave","Faerie Fire"],
    "2": ["Aid","Augury","Blindness/Deafness","Calm Emotions","Enhance Ability","Find Traps","Gentle Repose","Hold Person","Lesser Restoration","Locate Object","Prayer of Healing","Protection from Poison","Silence","Spiritual Weapon","Zone of Truth"],
    "3": ["Animate Dead","Beacon of Hope","Bestow Curse","Clairvoyance","Create Food and Water","Daylight","Dispel Magic","Glyph of Warding","Mass Healing Word","Meld into Stone","Protection from Energy","Remove Curse","Sending","Speak with Dead","Spirit Guardians","Tongues","Water Walk"],
  },
  Druid: {
    "1": ["Animal Friendship","Charm Person","Create or Destroy Water","Cure Wounds","Detect Magic","Detect Poison and Disease","Entangle","Faerie Fire","Fog Cloud","Goodberry","Healing Word","Jump","Longstrider","Purify Food and Drink","Speak with Animals","Thunderwave"],
    "2": ["Animal Messenger","Barkskin","Darkvision","Enhance Ability","Find Traps","Flame Blade","Flaming Sphere","Gust of Wind","Heat Metal","Hold Person","Lesser Restoration","Locate Animals or Plants","Locate Object","Moonbeam","Pass Without Trace","Protection from Poison","Spike Growth"],
    "3": ["Call Lightning","Conjure Animals","Daylight","Dispel Magic","Meld into Stone","Plant Growth","Protection from Energy","Sleet Storm","Speak with Plants","Water Breathing","Water Walk","Wind Wall"],
  },
};

// ─── Level-Up Modal ────────────────────────────────────────────────────────

function LevelUpModal({ newLevel, hitDie, campaignId, manualTrigger, onClose }: {
  newLevel: number; hitDie: number; campaignId: number; manualTrigger?: boolean; onClose: () => void;
}) {
  const { data: char } = useGetCharacter(campaignId, { query: { queryKey: getGetCharacterQueryKey(campaignId) } });
  const updateChar = useUpdateCharacter();
  const queryClient = useQueryClient();
  const [hpGained, setHpGained] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [newSpells, setNewSpells] = useState<string[]>([]);
  const [newCantrips, setNewCantrips] = useState<string[]>([]);
  const [asiAlloc, setAsiAlloc] = useState<Partial<Record<typeof ASI_STAT_KEYS[number], number>>>({});
  const [pactBoon, setPactBoon] = useState<string | null>(null);
  const [selectedFamiliarType, setSelectedFamiliarType] = useState<string | null>(null);
  const [newInvocations, setNewInvocations] = useState<string[]>([]);
  const [newMetamagic, setNewMetamagic] = useState<string[]>([]);
  const [newSubclassFeatures, setNewSubclassFeatures] = useState<Record<string, string[]>>({});

  if (!char) return null;

  const conMod = abilityMod(char.constitution ?? 10);
  const avgHp = Math.max(1, Math.floor(hitDie / 2) + 1 + conMod);
  const features = CLASS_LEVEL_FEATURES[char.class]?.[newLevel] ?? [];
  const spellGain: SpellGain | undefined = SPELL_GAINS[char.class]?.[newLevel];
  const spellPool: SpellPool = CLASS_SPELL_POOL[char.class] ?? {};
  const alreadyKnown = new Set((char.knownSpells as string[] | null) ?? []);

  // Build available spell list up to the max slot level for this level-up
  const availableSpells: string[] = [];
  for (let lvl = 1; lvl <= (spellGain?.maxSlotLevel ?? 0); lvl++) {
    const key = String(lvl) as "1" | "2" | "3";
    (spellPool[key] ?? []).forEach(s => { if (!alreadyKnown.has(s)) availableSpells.push(s); });
  }
  const availableCantrips = (spellPool.cantrips ?? []).filter(c => !alreadyKnown.has(c));

  const spellsNeeded = spellGain?.spells ?? 0;
  const cantripsNeeded = spellGain?.cantrips ?? 0;
  const spellsDone = newSpells.length === spellsNeeded;
  const cantripsDone = newCantrips.length === cantripsNeeded;
  const spellsReady = !spellGain || spellGain.isPrepared || (spellsDone && cantripsDone);
  const isAsiLevel = ASI_LEVELS.has(newLevel);
  const totalAsiPoints = Object.values(asiAlloc).reduce((a, b) => a + (b ?? 0), 0);
  const asiDone = !isAsiLevel || totalAsiPoints === 2;

  // Warlock-specific
  const isWarlockPactLevel = char.class === "Warlock" && newLevel === 3;
  const warlockInvocationsNeeded = char.class === "Warlock" ? (WARLOCK_NEW_INVOCATIONS[newLevel] ?? 0) : 0;
  const existingPactKey = (char.pactBoon as string | null)?.replace("Pact of the ", "") ?? null;
  const pendingPactKey = pactBoon?.replace("Pact of the ", "") ?? existingPactKey;
  const knownInvocSet = new Set((char.invocations as string[] | null) ?? []);
  const availableInvocations = ELDRITCH_INVOCATIONS.filter(inv => {
    if (knownInvocSet.has(inv.name)) return false;
    if (inv.prereqLevel && inv.prereqLevel > newLevel) return false;
    if (inv.prereqPact && inv.prereqPact !== pendingPactKey) return false;
    return true;
  });
  const pactBoonDone = !isWarlockPactLevel || pactBoon !== null;
  const familiarDone = !isWarlockPactLevel || pactBoon !== "Pact of the Chain" || selectedFamiliarType !== null;
  const invocationsDone = warlockInvocationsNeeded === 0 || newInvocations.length === warlockInvocationsNeeded;

  // Sorcerer-specific Metamagic
  const sorcererMetamagicNeeded = char.class === "Sorcerer" ? (SORCERER_NEW_METAMAGIC[newLevel] ?? 0) : 0;
  const knownMetamagicSet = new Set((char.metamagic as string[] | null) ?? []);
  const availableMetamagic = METAMAGIC_OPTIONS.filter(m => !knownMetamagicSet.has(m.name));
  const metamagicDone = sorcererMetamagicNeeded === 0 || newMetamagic.length === sorcererMetamagicNeeded;

  // Subclass feature selections (Totems, Maneuvers, Disciplines, Hunter, etc.)
  const knownSubclassFeatures = (char.subclassFeatures as string[] | null) ?? [];
  const modalSubclass = char.subclass ?? (char.features as string[] | null)?.[0] ?? null;
  const subclassFeatureGains = getSubclassFeatureGains(char.class, modalSubclass, newLevel, knownSubclassFeatures);
  const subclassFeaturesDone = subclassFeatureGains.every(gain => (newSubclassFeatures[gain.key] ?? []).length === gain.count);

  const canApply = hpGained !== null && spellsReady && asiDone && pactBoonDone && familiarDone && invocationsDone && metamagicDone && subclassFeaturesDone;

  function adjustAsi(stat: typeof ASI_STAT_KEYS[number], delta: number) {
    setAsiAlloc(prev => {
      const cur = prev[stat] ?? 0;
      const newVal = Math.max(0, Math.min(2, cur + delta));
      const newTotal = totalAsiPoints - cur + newVal;
      if (newTotal > 2) return prev;
      return { ...prev, [stat]: newVal };
    });
  }

  function toggleSpell(spell: string) {
    setNewSpells(prev =>
      prev.includes(spell) ? prev.filter(s => s !== spell)
        : prev.length < spellsNeeded ? [...prev, spell] : prev
    );
  }

  function toggleCantrip(cantrip: string) {
    setNewCantrips(prev =>
      prev.includes(cantrip) ? prev.filter(s => s !== cantrip)
        : prev.length < cantripsNeeded ? [...prev, cantrip] : prev
    );
  }

  function rollHp() {
    setRolling(true);
    setHpGained(null);
    setTimeout(() => {
      const roll = Math.ceil(Math.random() * hitDie);
      setHpGained(Math.max(1, roll + conMod));
      setRolling(false);
    }, 600);
  }

  function toggleInvocation(name: string) {
    setNewInvocations(prev =>
      prev.includes(name) ? prev.filter(i => i !== name)
        : prev.length < warlockInvocationsNeeded ? [...prev, name] : prev
    );
  }

  function toggleMetamagic(name: string) {
    setNewMetamagic(prev =>
      prev.includes(name) ? prev.filter(m => m !== name)
        : prev.length < sorcererMetamagicNeeded ? [...prev, name] : prev
    );
  }

  function toggleSubclassFeature(key: string, name: string, count: number) {
    setNewSubclassFeatures(prev => {
      const current = prev[key] ?? [];
      if (current.includes(name)) return { ...prev, [key]: current.filter(n => n !== name) };
      if (current.length >= count) return prev;
      return { ...prev, [key]: [...current, name] };
    });
  }

  async function applyLevelUp() {
    if (hpGained === null) return;
    const newMaxHp = (char!.maxHp ?? 10) + hpGained;
    const newHp = Math.min(newMaxHp, (char!.hp ?? 10) + hpGained);
    const currentSpells = (char!.knownSpells as string[] | null) ?? [];
    const allNewSpells = [...newSpells, ...newCantrips];

    const asiUpdates: Record<string, number> = {};
    if (isAsiLevel && totalAsiPoints > 0) {
      for (const stat of ASI_STAT_KEYS) {
        const delta = asiAlloc[stat] ?? 0;
        if (delta > 0) asiUpdates[stat] = ((char![stat] as number | null) ?? 10) + delta;
      }
    }

    const currentInvocations = (char!.invocations as string[] | null) ?? [];
    const currentMetamagic = (char!.metamagic as string[] | null) ?? [];
    const currentSubclassFeatures = (char!.subclassFeatures as string[] | null) ?? [];
    const allNewSubclassFeatures = Object.values(newSubclassFeatures).flat();
    const selectedFamiliarData = selectedFamiliarType
      ? CHAIN_FAMILIAR_TYPES.find(f => f.name === selectedFamiliarType)
      : null;

    const newProfBonus = Math.floor((newLevel - 1) / 4) + 2;

    // Recalculate class resource maxes for the new level, preserving current values
    const existingResources = (char!.classResources as ClassResource[] | null) ?? [];
    const charSubclassForLevelUp = (char!.subclass ?? null) || ((char!.features as string[] | null)?.[0] ?? null);
    const updatedResources = getClassResources(
      char!.class, newLevel, charSubclassForLevelUp,
      { charisma: char!.charisma }, existingResources,
    );

    // Update spell slots from PHB progression table
    const newSlots = getSpellSlotsForLevel(char!.class, newLevel);
    const currentUsedSlots = (char!.spellSlotsUsed as Record<string, number> | null) ?? {};

    await updateChar.mutateAsync({
      campaignId,
      data: {
        maxHp: newMaxHp,
        hp: newHp,
        ...(allNewSpells.length > 0 ? { knownSpells: [...currentSpells, ...allNewSpells] } : {}),
        ...asiUpdates,
        ...(manualTrigger ? { level: newLevel, proficiencyBonus: newProfBonus } : {}),
        // Spell slot progression
        ...(newSlots && Object.keys(newSlots).length > 0 ? {
          spellSlots: newSlots,
          spellSlotsUsed: Object.fromEntries(
            Object.keys(newSlots).map(lvl => [lvl, Math.min(currentUsedSlots[lvl] ?? 0, newSlots[lvl])])
          ),
        } : {}),
        // Warlock
        ...(pactBoon ? { pactBoon } : {}),
        ...(selectedFamiliarData ? {
          familiar: {
            type: selectedFamiliarData.name,
            hp: selectedFamiliarData.maxHp,
            maxHp: selectedFamiliarData.maxHp,
            ac: selectedFamiliarData.ac,
          }
        } : {}),
        ...(newInvocations.length > 0 ? { invocations: [...currentInvocations, ...newInvocations] } : {}),
        // Sorcerer Metamagic
        ...(newMetamagic.length > 0 ? { metamagic: [...currentMetamagic, ...newMetamagic] } : {}),
        // Subclass Features (Totems, Maneuvers, Disciplines, Hunter, Fighting Style, etc.)
        ...(allNewSubclassFeatures.length > 0 ? { subclassFeatures: [...currentSubclassFeatures, ...allNewSubclassFeatures] } : {}),
        // Update class resource maxes for the new level
        classResources: updatedResources,
      },
    });
    await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
    onClose();
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border text-foreground max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-primary text-xl flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Level {newLevel}!
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground font-serif italic">
            {char.name} has grown in power as a {char.class}. Your proficiency bonus is now +{Math.floor((newLevel - 1) / 4) + 2}.
          </p>

          {features.length > 0 && (
            <div className="bg-background/50 border border-border/60 rounded-lg p-3">
              <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2.5">New Features</div>
              <ul className="space-y-2">
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Star className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-foreground/90 leading-snug">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Spell learning */}
          {spellGain && spellGain.isPrepared && (
            <div className="bg-background/50 border border-primary/20 rounded-lg p-3">
              <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1.5">Spellcasting</div>
              <p className="text-sm text-foreground/80 leading-snug">
                As a {char.class} you now have access to all Level {spellGain.maxSlotLevel} spells from your class list.
                You prepare <span className="text-primary font-medium">{Math.max(1, abilityMod(char.class === "Cleric" ? (char.wisdom ?? 10) : (char.intelligence ?? 10)) + newLevel)}</span> spells per day chosen from your full list — no selections needed here.
              </p>
            </div>
          )}

          {spellGain && !spellGain.isPrepared && (cantripsNeeded > 0 || spellsNeeded > 0) && (
            <div className="bg-background/50 border border-border/60 rounded-lg p-3 space-y-4">
              <div className="text-xs text-muted-foreground uppercase tracking-widest">Learn New Spells</div>

              {cantripsNeeded > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-foreground">Cantrips</span>
                    <span className={`text-xs font-medium ${newCantrips.length === cantripsNeeded ? "text-primary" : "text-amber-500"}`}>
                      {newCantrips.length} / {cantripsNeeded} chosen
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {availableCantrips.map(c => {
                      const sel = newCantrips.includes(c);
                      const maxed = newCantrips.length >= cantripsNeeded;
                      return (
                        <button key={c} onClick={() => toggleCantrip(c)}
                          disabled={!sel && maxed}
                          className={`px-2 py-1 rounded border text-xs transition-all ${sel ? "border-primary bg-primary/15 text-primary" : maxed ? "border-border/30 text-muted-foreground/30 cursor-not-allowed" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}>
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {spellsNeeded > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-foreground">
                      Spells <span className="text-xs text-muted-foreground">(up to level {spellGain.maxSlotLevel})</span>
                    </span>
                    <span className={`text-xs font-medium ${newSpells.length === spellsNeeded ? "text-primary" : "text-amber-500"}`}>
                      {newSpells.length} / {spellsNeeded} chosen
                    </span>
                  </div>
                  {availableSpells.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">All available spells already known.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {availableSpells.map(s => {
                        const sel = newSpells.includes(s);
                        const maxed = newSpells.length >= spellsNeeded;
                        return (
                          <button key={s} onClick={() => toggleSpell(s)}
                            disabled={!sel && maxed}
                            className={`px-2 py-1 rounded border text-xs transition-all ${sel ? "border-primary bg-primary/15 text-primary" : maxed ? "border-border/30 text-muted-foreground/30 cursor-not-allowed" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Warlock — Pact Boon Selection (level 3) */}
          {isWarlockPactLevel && (
            <div className="bg-background/50 border border-primary/30 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground uppercase tracking-widest">Choose Your Pact Boon</div>
                {!pactBoonDone && <span className="text-xs text-amber-500">Required</span>}
              </div>
              <div className="space-y-2">
                {PACT_BOON_OPTIONS.map(boon => {
                  const sel = pactBoon === boon.name;
                  return (
                    <button key={boon.key} onClick={() => { setPactBoon(boon.name); setSelectedFamiliarType(null); }}
                      className={`w-full text-left rounded-lg border p-3 transition-all ${sel ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">{boon.icon}</span>
                        <span className={`text-sm font-medium ${sel ? "text-primary" : "text-foreground"}`}>{boon.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-snug">{boon.description}</p>
                    </button>
                  );
                })}
              </div>

              {/* Familiar selector when Chain is chosen */}
              {pactBoon === "Pact of the Chain" && (
                <div className="space-y-2 pt-1 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground uppercase tracking-widest">Choose Your Familiar</div>
                    {!familiarDone && <span className="text-xs text-amber-500">Required</span>}
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 max-h-52 overflow-y-auto">
                    {CHAIN_FAMILIAR_TYPES.map(f => {
                      const sel = selectedFamiliarType === f.name;
                      return (
                        <button key={f.name} onClick={() => setSelectedFamiliarType(f.name)}
                          className={`w-full text-left rounded border p-2 transition-all ${sel ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {f.special && <span className="text-xs text-primary/70 font-bold">✦</span>}
                              <span className={`text-sm font-medium ${sel ? "text-primary" : "text-foreground"}`}>{f.name}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">HP {f.maxHp} · AC {f.ac}</span>
                          </div>
                          <p className="text-xs text-muted-foreground/80 mt-0.5 leading-snug">{f.description}</p>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground/60 italic">✦ Special Chain familiars exclusive to Warlocks</p>
                </div>
              )}
            </div>
          )}

          {/* Warlock — Eldritch Invocation Selection */}
          {warlockInvocationsNeeded > 0 && (
            <div className="bg-background/50 border border-border/60 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground uppercase tracking-widest">Eldritch Invocations</div>
                <span className={`text-xs font-medium ${invocationsDone ? "text-primary" : "text-amber-500"}`}>
                  {newInvocations.length} / {warlockInvocationsNeeded} chosen
                </span>
              </div>
              {availableInvocations.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">All available invocations already known.</p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {availableInvocations.map(inv => {
                    const sel = newInvocations.includes(inv.name);
                    const maxed = newInvocations.length >= warlockInvocationsNeeded;
                    return (
                      <button key={inv.name} onClick={() => toggleInvocation(inv.name)}
                        disabled={!sel && maxed}
                        className={`w-full text-left rounded border p-2 transition-all ${sel ? "border-primary bg-primary/10" : maxed ? "border-border/30 opacity-40 cursor-not-allowed" : "border-border hover:border-primary/50"}`}>
                        <div className="flex items-center gap-1.5">
                          {inv.prereqPact && <span className="text-xs text-primary/70 font-bold">✦</span>}
                          <span className={`text-sm font-medium ${sel ? "text-primary" : "text-foreground"}`}>{inv.name}</span>
                          {inv.prereqLevel && <span className="text-xs text-muted-foreground/60">Lvl {inv.prereqLevel}+</span>}
                        </div>
                        <p className="text-xs text-muted-foreground/80 mt-0.5 leading-snug">{inv.description}</p>
                      </button>
                    );
                  })}
                </div>
              )}
              {!invocationsDone && (
                <p className="text-xs text-amber-500">
                  Choose {warlockInvocationsNeeded - newInvocations.length} more invocation{warlockInvocationsNeeded - newInvocations.length !== 1 ? "s" : ""} to continue.
                </p>
              )}
            </div>
          )}

          {/* Sorcerer — Metamagic Selection */}
          {sorcererMetamagicNeeded > 0 && (
            <div className="bg-background/50 border border-border/60 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground uppercase tracking-widest">Choose Metamagic</div>
                <span className={`text-xs font-medium ${metamagicDone ? "text-primary" : "text-amber-500"}`}>
                  {newMetamagic.length} / {sorcererMetamagicNeeded} chosen
                </span>
              </div>
              <p className="text-xs text-muted-foreground/70 leading-snug">
                Metamagic lets you spend Sorcery Points to modify spells in powerful ways.
              </p>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {availableMetamagic.map(mm => {
                  const sel = newMetamagic.includes(mm.name);
                  const maxed = newMetamagic.length >= sorcererMetamagicNeeded;
                  return (
                    <button key={mm.name} onClick={() => toggleMetamagic(mm.name)}
                      disabled={!sel && maxed}
                      className={`w-full text-left rounded border p-2 transition-all ${sel ? "border-primary bg-primary/10" : maxed ? "border-border/30 opacity-40 cursor-not-allowed" : "border-border hover:border-primary/50"}`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-sm font-medium ${sel ? "text-primary" : "text-foreground"}`}>{mm.name}</span>
                        <span className="text-xs text-primary/60 font-medium ml-2 shrink-0">{mm.cost}</span>
                      </div>
                      <p className="text-xs text-muted-foreground/80 leading-snug">{mm.description}</p>
                    </button>
                  );
                })}
              </div>
              {!metamagicDone && (
                <p className="text-xs text-amber-500">
                  Choose {sorcererMetamagicNeeded - newMetamagic.length} more Metamagic option{sorcererMetamagicNeeded - newMetamagic.length !== 1 ? "s" : ""} to continue.
                </p>
              )}
            </div>
          )}

          {/* Subclass Feature Selections (Totems, Maneuvers, Disciplines, Hunter, Fighting Style) */}
          {subclassFeatureGains.map(gain => {
            const selected = newSubclassFeatures[gain.key] ?? [];
            const done = selected.length === gain.count;
            return (
              <div key={gain.key} className="bg-background/50 border border-border/60 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">{gain.label}</div>
                  <span className={`text-xs font-medium ${done ? "text-primary" : "text-amber-500"}`}>
                    {selected.length} / {gain.count} chosen
                  </span>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {gain.options.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">All options already chosen.</p>
                  ) : gain.options.map(opt => {
                    const sel = selected.includes(opt.name);
                    const maxed = selected.length >= gain.count;
                    return (
                      <button key={opt.name} onClick={() => toggleSubclassFeature(gain.key, opt.name, gain.count)}
                        disabled={!sel && maxed}
                        className={`w-full text-left rounded border p-2 transition-all ${sel ? "border-primary bg-primary/10" : maxed ? "border-border/30 opacity-40 cursor-not-allowed" : "border-border hover:border-primary/50"}`}>
                        <span className={`text-sm font-medium ${sel ? "text-primary" : "text-foreground"}`}>{opt.name}</span>
                        <p className="text-xs text-muted-foreground/80 mt-0.5 leading-snug">{opt.description}</p>
                      </button>
                    );
                  })}
                </div>
                {!done && (
                  <p className="text-xs text-amber-500">
                    Choose {gain.count - selected.length} more {gain.label.toLowerCase()} option{gain.count - selected.length !== 1 ? "s" : ""} to continue.
                  </p>
                )}
              </div>
            );
          })}

          {/* ASI — Ability Score Improvement */}
          {isAsiLevel && (
            <div className="bg-background/50 border border-primary/30 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground uppercase tracking-widest">Ability Score Improvement</div>
                <span className={`text-xs font-bold ${totalAsiPoints === 2 ? "text-primary" : "text-amber-500"}`}>
                  {totalAsiPoints} / 2 points
                </span>
              </div>
              <p className="text-xs text-muted-foreground/70 mb-3">Distribute +2 points among your ability scores (max +2 per stat).</p>
              <div className="grid grid-cols-3 gap-2">
                {ASI_STAT_KEYS.map(stat => {
                  const current = (char[stat] as number | null) ?? 10;
                  const alloc = asiAlloc[stat] ?? 0;
                  const statLabel = stat.slice(0, 3).toUpperCase();
                  return (
                    <div key={stat} className="flex flex-col items-center gap-1 bg-card border border-border rounded p-2">
                      <div className="text-xs text-muted-foreground">{statLabel}</div>
                      <div className="font-bold text-foreground text-sm">{current}{alloc > 0 ? <span className="text-primary text-xs">+{alloc}</span> : ""}</div>
                      <div className="flex gap-1">
                        <button onClick={() => adjustAsi(stat, -1)} disabled={alloc === 0}
                          className="w-5 h-5 rounded border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-30">−</button>
                        <button onClick={() => adjustAsi(stat, 1)} disabled={totalAsiPoints >= 2 || alloc >= 2 || current + alloc >= 20}
                          className="w-5 h-5 rounded border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-30">+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-background/50 border border-border/60 rounded-lg p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Hit Points</div>
            <div className="text-xs text-muted-foreground mb-3">
              Roll your d{hitDie} or take the fixed average.
              CON modifier: {conMod >= 0 ? `+${conMod}` : conMod}
            </div>

            {hpGained !== null ? (
              <div className="text-center py-2">
                <div className="font-serif text-4xl font-bold text-primary">+{hpGained}</div>
                <div className="text-xs text-muted-foreground mt-1">maximum HP gained</div>
                <button onClick={() => setHpGained(null)}
                  className="text-xs text-muted-foreground/60 hover:text-muted-foreground mt-2 underline">
                  Re-choose
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button onClick={rollHp} disabled={rolling} variant="outline"
                  className="flex-1 border-primary/40 text-primary hover:bg-primary/10">
                  {rolling ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Rolling…
                    </span>
                  ) : `Roll d${hitDie}`}
                </Button>
                <Button onClick={() => setHpGained(avgHp)} variant="outline"
                  className="flex-1 border-border text-muted-foreground hover:text-foreground">
                  Average (+{avgHp})
                </Button>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="flex-col gap-2">
          <Button onClick={applyLevelUp} disabled={!canApply || updateChar.isPending}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-serif text-base">
            {updateChar.isPending ? "Applying…" : "Apply Level Up"}
          </Button>
          {isAsiLevel && !asiDone && (
            <p className="text-xs text-amber-500 text-center">
              Distribute all 2 ability score points to continue.
            </p>
          )}
          {spellGain && !spellGain.isPrepared && !spellsReady && (
            <p className="text-xs text-amber-500 text-center">
              Choose your {!cantripsDone ? `${cantripsNeeded - newCantrips.length} cantrip${cantripsNeeded - newCantrips.length > 1 ? "s" : ""}` : ""}
              {!cantripsDone && !spellsDone ? " and " : ""}
              {!spellsDone ? `${spellsNeeded - newSpells.length} spell${spellsNeeded - newSpells.length > 1 ? "s" : ""}` : ""} to continue.
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Item Dialog ───────────────────────────────────────────────────────

function AddItemDialog({ campaignId, open, onClose }: { campaignId: number; open: boolean; onClose: () => void }) {
  const addItem = useAddInventoryItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "", itemType: "misc" as "weapon" | "armor" | "consumable" | "tool" | "treasure" | "misc",
    quantity: 1, description: "",
    armorType: "" as "" | "light" | "medium" | "heavy" | "shield",
    acBase: "",
    damage: "", damageType: "",
  });

  async function handleAdd() {
    if (!form.name.trim()) return;
    const itemProperties: ItemProps | null = (() => {
      if (form.itemType === "armor" && form.armorType) {
        return { armorType: form.armorType, acBase: form.acBase ? parseInt(form.acBase) : undefined };
      }
      if (form.itemType === "weapon" && form.damage) {
        return { damage: form.damage, damageType: form.damageType || undefined };
      }
      return null;
    })();

    await addItem.mutateAsync({
      campaignId,
      data: {
        name: form.name.trim(),
        itemType: form.itemType,
        quantity: form.quantity,
        description: form.description || null,
        isEquipped: false,
        itemProperties,
      },
    });
    await queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey(campaignId) });
    toast({ title: `${form.name} added to inventory.` });
    setForm({ name: "", itemType: "misc", quantity: 1, description: "", armorType: "", acBase: "", damage: "", damageType: "" });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border text-foreground max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-primary">Add Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Item Name</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Rope, Potion of Healing" className="mt-1 bg-background border-border text-foreground text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={form.itemType} onValueChange={v => setForm(f => ({ ...f, itemType: v as typeof form.itemType, armorType: "", acBase: "", damage: "", damageType: "" }))}>
                <SelectTrigger className="mt-1 bg-background border-border text-foreground text-sm h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  {["weapon","armor","consumable","tool","treasure","misc"].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Quantity</Label>
              <Input type="number" min={1} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} className="mt-1 bg-background border-border text-foreground text-sm" />
            </div>
          </div>
          {form.itemType === "armor" && (
            <div className="grid grid-cols-2 gap-2 p-2 bg-background/50 rounded border border-border/50">
              <div>
                <Label className="text-xs text-muted-foreground">Armor Type</Label>
                <Select value={form.armorType} onValueChange={v => setForm(f => ({ ...f, armorType: v as typeof form.armorType }))}>
                  <SelectTrigger className="mt-1 bg-background border-border text-foreground text-sm h-8">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-foreground">
                    <SelectItem value="">No stats</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="heavy">Heavy</SelectItem>
                    <SelectItem value="shield">Shield (+2 AC)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.armorType && form.armorType !== "shield" && (
                <div>
                  <Label className="text-xs text-muted-foreground">Base AC</Label>
                  <Input type="number" value={form.acBase} onChange={e => setForm(f => ({ ...f, acBase: e.target.value }))} placeholder="e.g. 11" className="mt-1 bg-background border-border text-foreground text-sm" />
                </div>
              )}
            </div>
          )}
          {form.itemType === "weapon" && (
            <div className="grid grid-cols-2 gap-2 p-2 bg-background/50 rounded border border-border/50">
              <div>
                <Label className="text-xs text-muted-foreground">Damage</Label>
                <Input value={form.damage} onChange={e => setForm(f => ({ ...f, damage: e.target.value }))} placeholder="e.g. 1d8" className="mt-1 bg-background border-border text-foreground text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Damage Type</Label>
                <Input value={form.damageType} onChange={e => setForm(f => ({ ...f, damageType: e.target.value }))} placeholder="slashing" className="mt-1 bg-background border-border text-foreground text-sm" />
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Description (optional)</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Notes..." className="mt-1 bg-background border-border text-foreground text-sm" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="border-border text-muted-foreground">Cancel</Button>
          <Button size="sm" onClick={handleAdd} disabled={!form.name.trim() || addItem.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">
            Add Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Item Dialog ───────────────────────────────────────────────────────

const WEAPON_ABILITY_TAGS = ["Magical", "Silvered", "Hexblade", "Pact of the Blade", "Finesse", "Thrown", "Reach", "Two-handed", "Light", "Versatile", "Returning", "Bound"];

function EditItemDialog({ item, campaignId, onClose }: {
  item: { id: number; name: string; itemType: string; quantity: number; description: string | null; isEquipped: boolean; itemProperties: unknown };
  campaignId: number;
  onClose: () => void;
}) {
  const updateItem = useUpdateInventoryItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const props = (item.itemProperties ?? {}) as ItemProps;
  const existingTags = (props.weaponProperties ?? []) as string[];

  const [form, setForm] = useState({
    name: item.name,
    itemType: item.itemType as "weapon" | "armor" | "consumable" | "tool" | "treasure" | "misc",
    quantity: item.quantity,
    notes: item.description ?? "",
    armorType: (props.armorType ?? "none") as "none" | "light" | "medium" | "heavy" | "shield",
    acBase: props.acBase?.toString() ?? "",
    stealthDisadvantage: props.stealthDisadvantage ?? false,
    damage: props.damage ?? "",
    damageType: props.damageType ?? "",
    versatileDamage: props.versatileDamage ?? "",
    tags: existingTags as string[],
  });

  function toggleTag(tag: string) {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
    }));
  }

  async function handleSave() {
    const itemProperties: ItemProps | null = (() => {
      if (form.itemType === "armor" && form.armorType !== "none") {
        return {
          armorType: form.armorType as "light" | "medium" | "heavy" | "shield",
          acBase: form.acBase ? parseInt(form.acBase) : undefined,
          stealthDisadvantage: form.stealthDisadvantage || undefined,
          ...(form.tags.length > 0 ? { weaponProperties: form.tags } : {}),
        };
      }
      if (form.itemType === "weapon" || form.tags.length > 0) {
        return {
          ...(form.damage ? { damage: form.damage } : {}),
          ...(form.damageType ? { damageType: form.damageType } : {}),
          ...(form.versatileDamage ? { versatileDamage: form.versatileDamage } : {}),
          ...(form.tags.length > 0 ? { weaponProperties: form.tags } : {}),
        };
      }
      return null;
    })();

    try {
      await updateItem.mutateAsync({
        campaignId,
        itemId: item.id,
        data: {
          name: form.name.trim(),
          itemType: form.itemType,
          quantity: form.quantity,
          description: form.notes.trim() || null,
          itemProperties,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey(campaignId) });
      await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
      toast({ title: "Item updated." });
      onClose();
    } catch {
      toast({ title: "Failed to save item.", variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="bg-card border-border text-foreground max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-primary">Edit Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Name + type + quantity */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Item Name</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="h-8 text-sm bg-background border-border text-foreground" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={form.itemType} onValueChange={v => setForm(f => ({ ...f, itemType: v as typeof f.itemType, armorType: "none", acBase: "", damage: "", damageType: "" }))}>
                <SelectTrigger className="h-8 text-sm bg-background border-border text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  {["weapon", "armor", "consumable", "tool", "treasure", "misc"].map(t => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Quantity</Label>
              <div className="flex items-center gap-1">
                <button onClick={() => setForm(f => ({ ...f, quantity: Math.max(1, f.quantity - 1) }))}
                  className="w-7 h-8 rounded border border-border text-muted-foreground hover:text-foreground flex items-center justify-center text-sm flex-shrink-0">−</button>
                <div className="flex-1 text-center text-sm font-bold bg-background border border-border rounded py-1">{form.quantity}</div>
                <button onClick={() => setForm(f => ({ ...f, quantity: f.quantity + 1 }))}
                  className="w-7 h-8 rounded border border-border text-muted-foreground hover:text-foreground flex items-center justify-center text-sm flex-shrink-0">+</button>
              </div>
            </div>
          </div>

          {/* Weapon stats */}
          {form.itemType === "weapon" && (
            <div className="grid grid-cols-3 gap-2 p-2 bg-background/50 rounded border border-border/50">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Damage</Label>
                <Input value={form.damage} onChange={e => setForm(f => ({ ...f, damage: e.target.value }))}
                  placeholder="1d8" className="h-7 text-xs bg-background border-border text-foreground" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Input value={form.damageType} onChange={e => setForm(f => ({ ...f, damageType: e.target.value }))}
                  placeholder="slashing" className="h-7 text-xs bg-background border-border text-foreground" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Versatile</Label>
                <Input value={form.versatileDamage} onChange={e => setForm(f => ({ ...f, versatileDamage: e.target.value }))}
                  placeholder="1d10" className="h-7 text-xs bg-background border-border text-foreground" />
              </div>
            </div>
          )}

          {/* Armor stats */}
          {form.itemType === "armor" && (
            <div className="p-2 bg-background/50 rounded border border-border/50 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Armor Type</Label>
                  <Select value={form.armorType} onValueChange={v => setForm(f => ({ ...f, armorType: v as typeof f.armorType }))}>
                    <SelectTrigger className="h-7 text-xs bg-background border-border text-foreground"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent className="bg-card border-border text-foreground">
                      <SelectItem value="none">No stats</SelectItem>
                      {["light", "medium", "heavy", "shield"].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.armorType !== "none" && form.armorType !== "shield" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">AC Base</Label>
                    <Input type="number" value={form.acBase} onChange={e => setForm(f => ({ ...f, acBase: e.target.value }))}
                      placeholder="e.g. 13" className="h-7 text-xs bg-background border-border text-foreground" />
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.stealthDisadvantage}
                  onChange={e => setForm(f => ({ ...f, stealthDisadvantage: e.target.checked }))}
                  className="rounded accent-primary" />
                <span className="text-xs text-muted-foreground">Stealth Disadvantage</span>
              </label>
            </div>
          )}

          {/* Ability / property tags */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Properties & Special Abilities</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEAPON_ABILITY_TAGS.map(tag => {
                const on = form.tags.includes(tag);
                return (
                  <button key={tag} onClick={() => toggleTag(tag)}
                    className={`px-2 py-0.5 rounded border text-xs transition-all ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
                    {tag}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground/50">Tags appear in AI context (e.g. Hexblade, Pact of the Blade affect how the DM rules your attacks)</p>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3} placeholder="Cursed, attuned, lore, how you got it..."
              className="text-sm bg-background border-border text-foreground resize-none" />
          </div>
        </div>

        <DialogFooter className="pt-2 border-t border-border gap-2">
          <Button variant="outline" onClick={onClose} className="border-border text-muted-foreground hover:text-foreground">Cancel</Button>
          <Button onClick={handleSave} disabled={updateItem.isPending || !form.name.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-serif">
            {updateItem.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sidebar Panel ─────────────────────────────────────────────────────────

function SidebarPanel({ campaignId, onEditItem }: { campaignId: number; onEditItem: (item: { id: number; name: string; itemType: string; quantity: number; description: string | null; isEquipped: boolean; itemProperties: unknown }) => void }) {
  const [showAddItem, setShowAddItem] = useState(false);
  const { data: items } = useListInventory(campaignId, { query: { queryKey: getListInventoryQueryKey(campaignId) } });
  const { data: char } = useGetCharacter(campaignId, { query: { queryKey: getGetCharacterQueryKey(campaignId) } });
  const updateItem = useUpdateInventoryItem();
  const deleteItem = useDeleteInventoryItem();
  const queryClient = useQueryClient();

  async function toggleEquip(itemId: number, equipped: boolean) {
    await updateItem.mutateAsync({ campaignId, itemId, data: { isEquipped: !equipped } });
    await queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey(campaignId) });
    await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
  }

  async function handleDelete(itemId: number) {
    await deleteItem.mutateAsync({ campaignId, itemId });
    await queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey(campaignId) });
    await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
  }

  const ITEM_ICONS: Record<string, string> = { weapon: "⚔", armor: "🛡", consumable: "⊕", tool: "⚙", treasure: "◆", misc: "◇" };

  // Calculate AC breakdown for tooltip
  const equippedArmor = (items ?? []).filter(i => i.isEquipped && (i.itemProperties as ItemProps | null)?.armorType);
  const acBreakdown = equippedArmor.length > 0 && char
    ? equippedArmor.map(i => {
        const props = i.itemProperties as ItemProps;
        if (props.armorType === "shield") return "Shield +2";
        const dexMod = abilityMod(char.dexterity ?? 10);
        if (props.armorType === "light") return `${i.name}: ${props.acBase}+${dexMod}`;
        if (props.armorType === "medium") return `${i.name}: ${props.acBase}+${Math.min(dexMod, 2)}`;
        return `${i.name}: ${props.acBase}`;
      }).join(", ")
    : "Unarmored";

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border px-3 py-2.5 flex items-center gap-1.5">
        <Package className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Inventory</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <>
          {/* AC breakdown hint */}
          {equippedArmor.length > 0 && (
            <div className="flex items-center gap-1.5 bg-primary/5 border border-primary/20 rounded p-2 text-xs text-muted-foreground">
              <Info className="w-3 h-3 text-primary flex-shrink-0" />
              <span>AC {char?.ac}: {acBreakdown}</span>
            </div>
          )}

          {(items ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground/60 italic font-serif text-center py-4">Your pack is empty.</p>
          )}
            {(items ?? []).map(item => {
              const props = item.itemProperties as ItemProps | null;
              const canEquip = item.itemType === "weapon" || item.itemType === "armor";
              return (
                <div key={item.id} data-testid={`inventory-item-${item.id}`}
                  className={`rounded border p-2 flex items-start gap-2 group ${item.isEquipped ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
                  <span className="text-sm mt-0.5 flex-shrink-0">{ITEM_ICONS[item.itemType] ?? "◇"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs font-semibold text-foreground truncate">{item.name}</span>
                      {item.quantity > 1 && <span className="text-xs text-muted-foreground">×{item.quantity}</span>}
                      {item.isEquipped && <Badge className="text-xs px-1 py-0 bg-primary/20 text-primary border-primary/30 h-4">equipped</Badge>}
                    </div>
                    {/* Stat line */}
                    {props && (
                      <div className="text-xs text-primary/70 mt-0.5">
                        {props.armorType === "shield" ? "+2 AC (Shield)" :
                          props.armorType ? `AC ${props.acBase}${props.armorType === "light" ? "+DEX" : props.armorType === "medium" ? "+DEX (max 2)" : ""} [${props.armorType}]` :
                          props.damage ? `${props.damage} ${props.damageType ?? ""}${props.versatileDamage ? ` / ${props.versatileDamage} (2H)` : ""}` : null}
                        {props.stealthDisadvantage && <span className="text-muted-foreground/50 ml-1">(stealth disadv.)</span>}
                      </div>
                    )}
                    {item.description && <div className="text-xs text-muted-foreground/70 truncate mt-0.5">{item.description}</div>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {canEquip && (
                      <button onClick={() => toggleEquip(item.id, item.isEquipped ?? false)} data-testid={`button-equip-${item.id}`}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors p-0.5"
                        title={item.isEquipped ? "Unequip" : "Equip"}>
                        {item.isEquipped ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button onClick={() => onEditItem({ id: item.id, name: item.name, itemType: item.itemType, quantity: item.quantity, description: item.description ?? null, isEquipped: item.isEquipped ?? false, itemProperties: item.itemProperties })}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors p-0.5 opacity-0 group-hover:opacity-100"
                      title="Edit item">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleDelete(item.id)}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors p-0.5 opacity-0 group-hover:opacity-100"
                      title="Remove item">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </>
      </div>

      <div className="border-t border-border p-2">
        <button onClick={() => setShowAddItem(true)} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-primary transition-colors rounded hover:bg-primary/5">
          <PlusCircle className="w-3.5 h-3.5" /> Add Item
        </button>
      </div>

      <AddItemDialog campaignId={campaignId} open={showAddItem} onClose={() => setShowAddItem(false)} />
    </div>
  );
}

// ─── Main Game View ────────────────────────────────────────────────────────

export default function GameView() {
  const { id } = useParams<{ id: string }>();
  const campaignId = parseInt(id ?? "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: campaign } = useGetCampaign(campaignId, { query: { queryKey: getGetCampaignQueryKey(campaignId) } });
  const { data: messages = [], isLoading: messagesLoading } = useListMessages(campaignId, { query: { queryKey: getListMessagesQueryKey(campaignId) } });
  const { data: charForRolls } = useGetCharacter(campaignId, { query: { queryKey: getGetCharacterQueryKey(campaignId) } });
  const saveCampaign = useSaveCampaign();

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [pendingRolls, setPendingRolls] = useState<DiceRoll[]>([]);
  const [showDice, setShowDice] = useState(false);
  const [mobileTab, setMobileTab] = useState<"character" | "chat" | "sidebar">("chat");
  const [pendingLevelUp, setPendingLevelUp] = useState<{ newLevel: number; hitDie: number; manual?: boolean } | null>(null);
  const [pendingRollPrompt, setPendingRollPrompt] = useState<{ dice: string; skill?: string; reason: string; dc?: number } | null>(null);
  const [pendingLootOffer, setPendingLootOffer] = useState<Array<{ name: string; itemType: string; quantity?: number; description?: string }> | null>(null);
  type EditableItem = { id: number; name: string; itemType: string; quantity: number; description: string | null; isEquipped: boolean; itemProperties: unknown };
  const [editingItem, setEditingItem] = useState<EditableItem | null>(null);

  const rollDiceForPrompt = useRollDice();
  const addInventoryItem = useAddInventoryItem();

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamingContent]);

  function handleDiceRoll(roll: DiceRoll) { setPendingRolls(prev => [...prev, roll]); }

  async function handleRollPrompt() {
    if (!pendingRollPrompt || rollDiceForPrompt.isPending) return;
    const { totalMod } = charForRolls
      ? getCheckModifier(pendingRollPrompt.skill, charForRolls)
      : { totalMod: 0 };
    const expression = totalMod !== 0
      ? `1d20${totalMod > 0 ? `+${totalMod}` : `${totalMod}`}`
      : "1d20";
    const result = await rollDiceForPrompt.mutateAsync({ data: { expression } });
    const dcNote = pendingRollPrompt.dc ? ` (DC ${pendingRollPrompt.dc})` : "";
    const roll: DiceRoll = {
      expression: result.expression,
      label: `${pendingRollPrompt.reason}${dcNote}`,
      total: result.total,
      rolls: result.rolls,
      modifier: result.modifier,
      details: result.details,
    };
    setPendingRollPrompt(null);
    // Auto-send the roll result immediately — player doesn't need to press Send
    await sendMessageWithRolls([roll]);
  }

  async function addLootItem(item: { name: string; itemType: string; quantity?: number; description?: string }, index: number) {
    await addInventoryItem.mutateAsync({
      campaignId,
      data: {
        name: item.name,
        itemType: (item.itemType as "weapon" | "armor" | "consumable" | "tool" | "treasure" | "misc") ?? "misc",
        quantity: item.quantity ?? 1,
        description: item.description ?? null,
        isEquipped: false,
        itemProperties: null,
      },
    });
    await queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey(campaignId) });
    setPendingLootOffer(prev => {
      if (!prev) return null;
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : null;
    });
    toast({ title: `${item.name} added to inventory.` });
  }

  async function takeAllLoot() {
    if (!pendingLootOffer) return;
    for (const item of pendingLootOffer) {
      await addInventoryItem.mutateAsync({
        campaignId,
        data: {
          name: item.name,
          itemType: (item.itemType as "weapon" | "armor" | "consumable" | "tool" | "treasure" | "misc") ?? "misc",
          quantity: item.quantity ?? 1,
          description: item.description ?? null,
          isEquipped: false,
          itemProperties: null,
        },
      });
    }
    await queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey(campaignId) });
    setPendingLootOffer(null);
    toast({ title: "All loot added to inventory." });
  }

  // Core SSE sender — takes explicit content + rolls, used by both sendMessage and handleRollPrompt
  const sendMessageWithRolls = useCallback(async (rolls: DiceRoll[], content = "") => {
    if (streaming) return;
    setStreaming(true);
    setStreamingContent("");
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/campaigns/${campaignId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content || "(the player rolled dice)", diceRolls: rolls.length > 0 ? rolls : undefined }),
      });
      if (!response.ok) throw new Error("Failed to send message");

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                setStreamingContent(c => {
                  const raw = c + data.content;
                  return raw
                    .replace(/<ROLL_PROMPT[^/]*\/>/g, "")
                    .replace(/<LOOT_OFFER>[\s\S]*?<\/LOOT_OFFER>/g, "")
                    .replace(/<LEVEL_UP>[\s\S]*?<\/LEVEL_UP>/g, "")
                    .replace(/<STATE_UPDATE>[\s\S]*?<\/STATE_UPDATE>/g, "");
                });
              }
              if (data.done) {
                setStreamingContent("");
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(campaignId) }),
                  queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) }),
                  queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) }),
                  queryClient.invalidateQueries({ queryKey: getListQuestsQueryKey(campaignId) }),
                  queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey(campaignId) }),
                ]);
                if (data.levelUp && data.newLevel) {
                  setPendingLevelUp({ newLevel: data.newLevel, hitDie: data.hitDie ?? 8 });
                }
                if (data.rollPrompt) setPendingRollPrompt(data.rollPrompt);
                if (data.lootOffer) setPendingLootOffer(data.lootOffer);
              }
              if (data.error) toast({ title: "AI Error", description: data.error, variant: "destructive" });
            } catch { /* ignore */ }
          }
        }
      }
    } catch {
      toast({ title: "Failed to send message", variant: "destructive" });
    } finally {
      setStreaming(false);
      setStreamingContent("");
    }
  }, [streaming, campaignId, queryClient, toast]);

  const sendMessage = useCallback(async () => {
    if ((!input.trim() && pendingRolls.length === 0) || streaming) return;
    const msg = input.trim();
    setInput("");
    const rolls = [...pendingRolls];
    setPendingRolls([]);
    setPendingRollPrompt(null);
    await sendMessageWithRolls(rolls, msg);
  }, [input, pendingRolls, streaming, sendMessageWithRolls]);

  async function handleSave() {
    await saveCampaign.mutateAsync({ id: campaignId, data: {} });
    toast({ title: "Progress saved." });
  }

  const allMessages = [...(messages as Message[])];

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/")} data-testid="button-back-home" className="text-muted-foreground hover:text-primary transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="font-serif font-bold text-foreground text-sm" data-testid="text-campaign-name">{campaign?.name ?? "Loading..."}</div>
            {campaign?.currentLocation && <div className="text-xs text-muted-foreground">{campaign.currentLocation}</div>}
          </div>
        </div>
        <div className="flex gap-1 lg:hidden">
          {(["character", "chat", "sidebar"] as const).map(t => (
            <button key={t} onClick={() => setMobileTab(t)} data-testid={`mobile-tab-${t}`}
              className={`px-2 py-1 rounded text-xs capitalize transition-colors ${mobileTab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "character" ? <User className="w-4 h-4" /> : t === "chat" ? <BookOpen className="w-4 h-4" /> : <Package className="w-4 h-4" />}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={handleSave} disabled={saveCampaign.isPending} data-testid="button-save"
          className="border-border text-muted-foreground hover:text-foreground gap-1.5 hidden sm:flex">
          <Save className="w-3.5 h-3.5" /> Save
        </Button>
      </header>

      {/* Main Layout */}
      <div className="flex-1 overflow-hidden flex">
        {/* LEFT: Character */}
        <div className={`w-64 xl:w-72 flex-shrink-0 border-r border-border ${mobileTab === "character" ? "block" : "hidden"} lg:block`}>
          <CharacterPanel campaignId={campaignId} onLevelUp={info => setPendingLevelUp({ ...info, manual: true })} />
        </div>

        {/* CENTER: Chat */}
        <div className={`flex-1 flex flex-col overflow-hidden ${mobileTab === "chat" ? "flex" : "hidden"} lg:flex`}>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messagesLoading && <div className="text-center text-muted-foreground text-sm font-serif italic py-8"><div className="animate-pulse">Loading your adventure...</div></div>}
            {!messagesLoading && allMessages.length === 0 && (
              <div className="text-center py-12">
                <div className="font-serif text-muted-foreground/60 text-lg italic mb-3">The story awaits.</div>
                <div className="text-sm text-muted-foreground/50">Send a message to begin your adventure. Your Dungeon Master is ready.</div>
              </div>
            )}
            {allMessages.map(msg => <ChatMessage key={msg.id} msg={msg} />)}
            {streaming && streamingContent && (
              <div className="bg-card border border-border rounded-lg px-4 py-3 text-foreground font-serif leading-relaxed text-[0.95rem]">
                <div className="whitespace-pre-wrap">{streamingContent}</div>
                <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-1 rounded-sm" />
              </div>
            )}
            {streaming && !streamingContent && (
              <div className="bg-card border border-border rounded-lg px-4 py-3">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </div>
              </div>
            )}
            {/* Roll Prompt Banner */}
            {pendingRollPrompt && !streaming && (() => {
              const { totalMod, isProficient } = charForRolls
                ? getCheckModifier(pendingRollPrompt.skill, charForRolls)
                : { totalMod: 0, isProficient: false };
              const modDisplay = totalMod >= 0 ? `+${totalMod}` : String(totalMod);
              const rollExpr = `1d20${totalMod !== 0 ? modDisplay : ""}`;
              return (
                <div className="border-2 border-primary/60 bg-primary/8 rounded-lg p-3.5 animate-in fade-in duration-300 shadow-[0_0_12px_rgba(var(--primary)/0.15)]">
                  <div className="flex items-start gap-3">
                    <Dices className="w-5 h-5 text-primary flex-shrink-0 mt-0.5 animate-pulse" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <div className="text-xs text-primary/80 uppercase tracking-wider font-semibold">Roll Required</div>
                        {pendingRollPrompt.skill && (
                          <div className="text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded font-medium">{pendingRollPrompt.skill}</div>
                        )}
                        {pendingRollPrompt.dc && (
                          <div className="text-xs text-muted-foreground bg-card border border-border px-1.5 py-0.5 rounded">DC {pendingRollPrompt.dc}</div>
                        )}
                      </div>
                      <div className="text-sm font-serif text-foreground leading-snug">{pendingRollPrompt.reason}</div>
                      {charForRolls && pendingRollPrompt.skill && (
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                          <span>Your modifier: <span className={`font-bold ${totalMod >= 0 ? "text-green-400" : "text-red-400"}`}>{modDisplay}</span></span>
                          {isProficient && <span className="text-primary/70 italic">proficient</span>}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleRollPrompt}
                      disabled={rollDiceForPrompt.isPending}
                      className="flex-shrink-0 px-4 py-2 rounded-lg border-2 border-primary bg-primary/15 text-primary hover:bg-primary/30 font-bold font-serif transition-all disabled:opacity-50 flex flex-col items-center gap-0.5 min-w-[72px]">
                      <Dices className="w-4 h-4" />
                      <span className="text-xs leading-none">{rollExpr}</span>
                      <span className="text-[10px] text-primary/60 leading-none">& Send</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Loot Offer Panel */}
            {pendingLootOffer && pendingLootOffer.length > 0 && !streaming && (
              <div className="border border-amber-500/40 bg-amber-500/5 rounded-lg p-3 animate-in fade-in duration-300">
                <div className="flex items-center gap-2 mb-2.5">
                  <Gift className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-amber-400/90 uppercase tracking-wider font-semibold">Loot Available</span>
                  <button onClick={() => setPendingLootOffer(null)} className="ml-auto text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 mb-3">
                  {pendingLootOffer.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 py-1 px-1">
                      <span className="text-sm flex-1 text-foreground font-medium">
                        {item.name}
                        {(item.quantity ?? 1) > 1 && <span className="text-muted-foreground font-normal"> ×{item.quantity}</span>}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize px-1.5 py-0.5 rounded bg-card border border-border">{item.itemType}</span>
                      <button
                        onClick={() => addLootItem(item, i)}
                        disabled={addInventoryItem.isPending}
                        className="flex-shrink-0 w-7 h-7 rounded-full border border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/25 transition-all flex items-center justify-center disabled:opacity-50"
                        title={`Add ${item.name} to inventory`}>
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-2 border-t border-amber-500/20">
                  <button onClick={takeAllLoot} disabled={addInventoryItem.isPending}
                    className="flex-1 text-xs py-1.5 rounded border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors font-medium disabled:opacity-50">
                    Take All
                  </button>
                  <button onClick={() => setPendingLootOffer(null)}
                    className="flex-1 text-xs py-1.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors">
                    Leave It
                  </button>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Pending Rolls */}
          {pendingRolls.length > 0 && (
            <div className="px-4 py-2 border-t border-border bg-primary/5 flex flex-wrap gap-2">
              {pendingRolls.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 rounded px-2 py-1">
                  <Dices className="w-3 h-3 text-primary" />
                  <span className="text-xs text-primary font-bold">{r.total}</span>
                  <span className="text-xs text-muted-foreground">{r.expression}</span>
                  <button onClick={() => setPendingRolls(p => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground text-xs ml-1">×</button>
                </div>
              ))}
            </div>
          )}

          {/* Input area */}
          <div className="border-t border-border p-3 space-y-2 flex-shrink-0">
            {showDice && <DiceTray onRoll={handleDiceRoll} charData={charForRolls} />}
            <div className="flex gap-2">
              <button onClick={() => setShowDice(s => !s)} data-testid="button-toggle-dice"
                className={`flex-shrink-0 px-3 py-2 rounded border text-xs transition-all ${showDice ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
                <Dices className="w-4 h-4" />
              </button>
              <Textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder="What do you do?"
                data-testid="input-chat-message"
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                rows={2} disabled={streaming}
                className="flex-1 resize-none bg-card border-border text-foreground placeholder:text-muted-foreground/50 min-h-0 text-sm" />
              <button onClick={sendMessage} disabled={streaming || (!input.trim() && pendingRolls.length === 0)} data-testid="button-send"
                className="flex-shrink-0 px-3 py-2 rounded border border-primary bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Sidebar */}
        <div className={`w-56 xl:w-64 flex-shrink-0 border-l border-border ${mobileTab === "sidebar" ? "block" : "hidden"} lg:block`}>
          <SidebarPanel campaignId={campaignId} onEditItem={setEditingItem} />
        </div>
      </div>

      {editingItem && (
        <EditItemDialog item={editingItem} campaignId={campaignId} onClose={() => setEditingItem(null)} />
      )}

      {pendingLevelUp && (
        <LevelUpModal
          newLevel={pendingLevelUp.newLevel}
          hitDie={pendingLevelUp.hitDie}
          campaignId={campaignId}
          manualTrigger={pendingLevelUp.manual}
          onClose={() => setPendingLevelUp(null)}
        />
      )}
    </div>
  );
}
