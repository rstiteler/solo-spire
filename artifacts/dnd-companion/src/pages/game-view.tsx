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
  Trash2, PlusCircle, Info, Pencil, Sparkles, X
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

// ─── Edit Character Modal ───────────────────────────────────────────────────

function EditCharacterModal({ campaignId, onClose }: { campaignId: number; onClose: () => void }) {
  const { data: char } = useGetCharacter(campaignId, { query: { queryKey: getGetCharacterQueryKey(campaignId) } });
  const updateCharacter = useUpdateCharacter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<"identity" | "stats" | "proficiencies" | "spells" | "abilities">("identity");
  const [saving, setSaving] = useState(false);
  const [knownSpellsList, setKnownSpellsList] = useState<string[]>(() => (char?.knownSpells as string[] | null) ?? []);
  const [spellSearch, setSpellSearch] = useState("");

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

        {tab === "proficiencies" && (
          <div className="space-y-4">
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
                  return (
                    <button key={s} onClick={() => toggleSkill(s)}
                      className={`px-2.5 py-1 rounded border text-xs font-medium transition-all ${on ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/40"}`}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

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

function DiceTray({ onRoll }: { onRoll: (roll: DiceRoll) => void }) {
  const rollDice = useRollDice();
  const [rolling, setRolling] = useState<number | null>(null);

  async function handleRoll(sides: number) {
    setRolling(sides);
    try {
      const result = await rollDice.mutateAsync({ data: { expression: `1d${sides}` } });
      onRoll({ expression: result.expression, label: result.label ?? null, total: result.total, rolls: result.rolls, modifier: result.modifier, details: result.details });
    } finally { setRolling(null); }
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {DICE_FACES.map(d => (
        <button key={d} data-testid={`button-roll-d${d}`} onClick={() => handleRoll(d)} disabled={rolling !== null}
          className={`relative w-10 h-10 rounded border font-serif font-bold text-xs transition-all ${rolling === d ? "border-primary bg-primary/20 text-primary animate-pulse" : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"} disabled:opacity-50`}>
          d{d}
        </button>
      ))}
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

function CharacterPanel({ campaignId }: { campaignId: number }) {
  const { data: char } = useGetCharacter(campaignId, { query: { queryKey: getGetCharacterQueryKey(campaignId) } });
  const { data: campaign } = useGetCampaign(campaignId, { query: { queryKey: getGetCampaignQueryKey(campaignId) } });
  const [editOpen, setEditOpen] = useState(false);

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
          <div className="grid grid-cols-3 gap-1.5">
            {Object.entries(spellSlots).map(([lvl, max]) => {
              const used = spellSlotsUsed[lvl] ?? 0;
              const remaining = max - used;
              return (
                <div key={lvl} className="bg-card border border-border rounded p-1.5 text-center">
                  <div className="text-xs text-muted-foreground">L{lvl}</div>
                  <div className={`text-sm font-bold ${remaining > 0 ? "text-primary" : "text-muted-foreground/40"}`}>{remaining}/{max}</div>
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
            {knownSpells.map(s => <Badge key={s} variant="outline" className="text-xs border-border/50 text-muted-foreground/70 py-0">{s}</Badge>)}
          </div>
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

      {/* Gold */}
      <div className="flex items-center justify-between bg-card border border-border rounded p-2">
        <span className="text-xs text-muted-foreground">Gold</span>
        <span className="font-serif font-bold text-primary" data-testid="text-gold">{campaign?.gold ?? 0} gp</span>
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

function LevelUpModal({ newLevel, hitDie, campaignId, onClose }: {
  newLevel: number; hitDie: number; campaignId: number; onClose: () => void;
}) {
  const { data: char } = useGetCharacter(campaignId, { query: { queryKey: getGetCharacterQueryKey(campaignId) } });
  const updateChar = useUpdateCharacter();
  const queryClient = useQueryClient();
  const [hpGained, setHpGained] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [newSpells, setNewSpells] = useState<string[]>([]);
  const [newCantrips, setNewCantrips] = useState<string[]>([]);

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
  const canApply = hpGained !== null && spellsReady;

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

  async function applyLevelUp() {
    if (hpGained === null) return;
    const newMaxHp = (char!.maxHp ?? 10) + hpGained;
    const newHp = Math.min(newMaxHp, (char!.hp ?? 10) + hpGained);
    const currentSpells = (char!.knownSpells as string[] | null) ?? [];
    const allNewSpells = [...newSpells, ...newCantrips];
    await updateChar.mutateAsync({
      campaignId,
      data: {
        maxHp: newMaxHp,
        hp: newHp,
        ...(allNewSpells.length > 0 ? { knownSpells: [...currentSpells, ...allNewSpells] } : {}),
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

// ─── Sidebar Panel ─────────────────────────────────────────────────────────

function SidebarPanel({ campaignId }: { campaignId: number }) {
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
  const saveCampaign = useSaveCampaign();

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [pendingRolls, setPendingRolls] = useState<DiceRoll[]>([]);
  const [showDice, setShowDice] = useState(false);
  const [mobileTab, setMobileTab] = useState<"character" | "chat" | "sidebar">("chat");
  const [pendingLevelUp, setPendingLevelUp] = useState<{ newLevel: number; hitDie: number } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamingContent]);

  function handleDiceRoll(roll: DiceRoll) { setPendingRolls(prev => [...prev, roll]); }

  const sendMessage = useCallback(async () => {
    if ((!input.trim() && pendingRolls.length === 0) || streaming) return;
    const msg = input.trim();
    setInput("");
    const rolls = [...pendingRolls];
    setPendingRolls([]);
    setStreaming(true);
    setStreamingContent("");

    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/campaigns/${campaignId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msg || "(the player rolled dice)", diceRolls: rolls.length > 0 ? rolls : undefined }),
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
              if (data.content) setStreamingContent(c => c + data.content);
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
  }, [input, pendingRolls, streaming, campaignId, queryClient, toast]);

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
          <CharacterPanel campaignId={campaignId} />
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
            {showDice && <DiceTray onRoll={handleDiceRoll} />}
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
          <SidebarPanel campaignId={campaignId} />
        </div>
      </div>

      {pendingLevelUp && (
        <LevelUpModal
          newLevel={pendingLevelUp.newLevel}
          hitDie={pendingLevelUp.hitDie}
          campaignId={campaignId}
          onClose={() => setPendingLevelUp(null)}
        />
      )}
    </div>
  );
}
