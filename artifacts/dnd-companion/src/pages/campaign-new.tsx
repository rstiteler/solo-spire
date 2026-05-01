import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateCampaign, useUpdateCharacter, getGetCampaignQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Sword, Shield, BookOpen, Star, Dices, Check } from "lucide-react";

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

const CLASSES = [
  { name: "Fighter", icon: "⚔", features: ["Second Wind: bonus action self-heal", "Action Surge: extra action 1/rest", "Fighting Style", "Martial weapons & all armor proficiency"] },
  { name: "Rogue", icon: "🗡", features: ["Sneak Attack: bonus damage with advantage", "Cunning Action: Dash/Disengage/Hide as bonus action", "Expertise: double proficiency bonus", "Thieves' Cant language"] },
  { name: "Wizard", icon: "✦", features: ["Spellcasting (Intelligence)", "Arcane Recovery: recover spell slots on short rest", "Spellbook: learn new spells", "Cantrips at will"] },
  { name: "Cleric", icon: "☩", features: ["Spellcasting (Wisdom)", "Divine Domain features", "Channel Divinity: powerful divine effects", "Turn Undead"] },
  { name: "Ranger", icon: "◎", features: ["Spellcasting (Wisdom)", "Favored Enemy: advantage vs creature type", "Natural Explorer: expertise in favored terrain", "Two-Weapon Fighting"] },
  { name: "Paladin", icon: "✦", features: ["Spellcasting (Charisma)", "Divine Smite: extra radiant damage", "Lay on Hands: healing pool", "Divine Sense: detect evil"] },
  { name: "Barbarian", icon: "⬡", features: ["Rage: bonus damage & resistance", "Unarmored Defense: AC = 10 + DEX + CON", "Reckless Attack", "Danger Sense: advantage on DEX saves"] },
  { name: "Druid", icon: "✿", features: ["Spellcasting (Wisdom)", "Wild Shape: transform into beasts", "Druidic language", "Ritual Casting"] },
  { name: "Bard", icon: "♪", features: ["Spellcasting (Charisma)", "Bardic Inspiration: bonus to ally rolls", "Jack of All Trades: half proficiency to all skills", "Song of Rest"] },
  { name: "Warlock", icon: "◈", features: ["Eldritch Blast cantrip", "Pact Magic: few but recovering spell slots", "Eldritch Invocations", "Patron: otherworldly benefactor"] },
  { name: "Sorcerer", icon: "✧", features: ["Spellcasting (Charisma)", "Sorcery Points: flexible spell resource", "Metamagic: enhance spell casting", "Font of Magic"] },
  { name: "Monk", icon: "◯", features: ["Martial Arts: unarmed strike die", "Ki Points: fuel special abilities", "Unarmored Defense", "Unarmored Movement: increased speed"] },
];

const BACKGROUNDS = ["Acolyte", "Charlatan", "Criminal", "Entertainer", "Folk Hero", "Guild Artisan", "Hermit", "Noble", "Outlander", "Sage", "Sailor", "Soldier", "Urchin"];
const ALIGNMENTS = ["Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil"];

const BASE_STATS = { strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8 };
const STAT_KEYS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
type StatKey = typeof STAT_KEYS[number];

function rollAbilityScore(): number {
  const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
  rolls.sort((a, b) => a - b);
  return rolls.slice(1).reduce((a, b) => a + b, 0);
}

function modifier(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : String(mod);
}

const TOTAL_POINTS = 27;
const COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

export default function CampaignNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createCampaign = useCreateCampaign();
  const updateCharacter = useUpdateCharacter();

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
  });

  const pointsSpent = STAT_KEYS.reduce((acc, k) => acc + (COST[form.stats[k]] ?? 0), 0);
  const pointsRemaining = TOTAL_POINTS - pointsSpent;

  function setField(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function setStat(k: StatKey, v: number) {
    const newStats = { ...form.stats, [k]: v };
    const newCost = STAT_KEYS.reduce((acc, key) => acc + (COST[newStats[key]] ?? 0), 0);
    if (newCost <= TOTAL_POINTS && v >= 8 && v <= 15) {
      setForm(f => ({ ...f, stats: newStats }));
    }
  }

  function rollAll() {
    const rolled = STAT_KEYS.reduce((acc, k) => ({ ...acc, [k]: rollAbilityScore() }), {} as Record<StatKey, number>);
    setForm(f => ({ ...f, rolledStats: rolled, stats: rolled, usePointBuy: false }));
  }

  async function handleFinish() {
    try {
      const campaign = await createCampaign.mutateAsync({ data: { name: form.campaignName || "The Unnamed Quest" } });

      await updateCharacter.mutateAsync({
        campaignId: campaign.id,
        data: {
          name: form.characterName || "The Nameless One",
          race: form.race || "Human",
          class: form.class || "Fighter",
          background: form.background,
          alignment: form.alignment,
          backstory: form.backstory || null,
          strength: form.stats.strength,
          dexterity: form.stats.dexterity,
          constitution: form.stats.constitution,
          intelligence: form.stats.intelligence,
          wisdom: form.stats.wisdom,
          charisma: form.stats.charisma,
          level: 1,
          xp: 0,
          hp: 10 + Math.floor((form.stats.constitution - 10) / 2),
          maxHp: 10 + Math.floor((form.stats.constitution - 10) / 2),
          ac: 10 + Math.floor((form.stats.dexterity - 10) / 2),
          speed: 30,
          proficiencyBonus: 2,
          tempHp: 0,
        },
      });

      await queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaign.id) });
      setLocation(`/campaign/${campaign.id}`);
    } catch {
      toast({ title: "Failed to create campaign", variant: "destructive" });
    }
  }

  const steps = ["Basics", "Race", "Class", "Ability Scores", "Confirm"];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto py-8 px-6">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary mb-6 text-sm transition-colors"
          data-testid="button-back"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Campaigns
        </button>

        <h1 className="font-serif text-3xl font-bold text-primary mb-2">Begin a New Adventure</h1>
        <p className="text-muted-foreground mb-8">Forge your legend. Every hero's tale starts here.</p>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-10">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
                step > i + 1 ? "bg-primary border-primary text-primary-foreground" :
                step === i + 1 ? "border-primary text-primary" :
                "border-border text-muted-foreground"
              }`}>
                {step > i + 1 ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span className={`text-xs hidden sm:block ${step === i + 1 ? "text-primary" : "text-muted-foreground"}`}>{s}</span>
              {i < steps.length - 1 && <div className={`h-px w-8 ${step > i + 1 ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Basics */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="font-serif text-xl text-foreground">Your Identity</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="campaignName" className="text-muted-foreground text-sm">Campaign Name</Label>
                <Input id="campaignName" data-testid="input-campaign-name"
                  placeholder="The Curse of Strahd, Dungeon of the Mad Mage..."
                  value={form.campaignName} onChange={e => setField("campaignName", e.target.value)}
                  className="mt-1 bg-card border-border text-foreground placeholder:text-muted-foreground/50" />
              </div>
              <div>
                <Label htmlFor="charName" className="text-muted-foreground text-sm">Character Name</Label>
                <Input id="charName" data-testid="input-character-name"
                  placeholder="What do they call you, wanderer?"
                  value={form.characterName} onChange={e => setField("characterName", e.target.value)}
                  className="mt-1 bg-card border-border text-foreground placeholder:text-muted-foreground/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-sm">Background</Label>
                  <select
                    data-testid="select-background"
                    value={form.background}
                    onChange={e => setField("background", e.target.value)}
                    className="mt-1 w-full bg-card border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {BACKGROUNDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Alignment</Label>
                  <select
                    data-testid="select-alignment"
                    value={form.alignment}
                    onChange={e => setField("alignment", e.target.value)}
                    className="mt-1 w-full bg-card border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {ALIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="backstory" className="text-muted-foreground text-sm">Backstory (optional)</Label>
                <Textarea id="backstory" data-testid="input-backstory"
                  placeholder="A wandering mercenary, haunted by a past they cannot outrun..."
                  value={form.backstory} onChange={e => setField("backstory", e.target.value)}
                  rows={4}
                  className="mt-1 bg-card border-border text-foreground placeholder:text-muted-foreground/50 resize-none" />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Race */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="font-serif text-xl text-foreground">Choose Your Race</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {RACES.map(r => (
                <button
                  key={r.name}
                  data-testid={`button-race-${r.name.toLowerCase()}`}
                  onClick={() => setField("race", r.name)}
                  className={`p-4 rounded border text-left transition-all ${
                    form.race === r.name
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-foreground hover:border-primary/50"
                  }`}
                >
                  <div className="font-serif font-semibold text-sm">{r.name}</div>
                </button>
              ))}
            </div>
            {form.race && (
              <div className="bg-card border border-border rounded p-4">
                <h3 className="font-serif text-primary mb-2">{form.race} Traits</h3>
                <ul className="space-y-1">
                  {RACES.find(r => r.name === form.race)?.traits.map(t => (
                    <li key={t} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-primary mt-0.5">•</span> {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Class */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="font-serif text-xl text-foreground">Choose Your Class</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CLASSES.map(c => (
                <button
                  key={c.name}
                  data-testid={`button-class-${c.name.toLowerCase()}`}
                  onClick={() => setField("class", c.name)}
                  className={`p-4 rounded border text-left transition-all ${
                    form.class === c.name
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-foreground hover:border-primary/50"
                  }`}
                >
                  <div className="font-serif font-semibold text-sm">{c.name}</div>
                </button>
              ))}
            </div>
            {form.class && (
              <div className="bg-card border border-border rounded p-4">
                <h3 className="font-serif text-primary mb-2">{form.class} Features</h3>
                <ul className="space-y-1">
                  {CLASSES.find(c => c.name === form.class)?.features.map(f => (
                    <li key={f} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-primary mt-0.5">•</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Ability Scores */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl text-foreground">Ability Scores</h2>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={form.usePointBuy ? "default" : "outline"}
                  onClick={() => setForm(f => ({ ...f, usePointBuy: true, stats: { ...BASE_STATS } }))}
                  data-testid="button-point-buy"
                  className="text-xs"
                >
                  Point Buy
                </Button>
                <Button
                  size="sm"
                  variant={!form.usePointBuy ? "default" : "outline"}
                  onClick={rollAll}
                  data-testid="button-roll-stats"
                  className="text-xs gap-1"
                >
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
              {STAT_KEYS.map(k => (
                <div key={k} className="bg-card border border-border rounded p-3 text-center">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">{k.slice(0, 3)}</div>
                  <div className="font-serif text-2xl font-bold text-foreground">{form.stats[k]}</div>
                  <div className="text-xs text-primary mb-2">{modifier(form.stats[k])}</div>
                  {form.usePointBuy && (
                    <div className="flex justify-center gap-2">
                      <button
                        data-testid={`button-stat-minus-${k}`}
                        onClick={() => setStat(k, form.stats[k] - 1)}
                        disabled={form.stats[k] <= 8}
                        className="w-6 h-6 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary disabled:opacity-30 text-sm"
                      >-</button>
                      <button
                        data-testid={`button-stat-plus-${k}`}
                        onClick={() => setStat(k, form.stats[k] + 1)}
                        disabled={form.stats[k] >= 15 || pointsRemaining <= 0}
                        className="w-6 h-6 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary disabled:opacity-30 text-sm"
                      >+</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Confirm */}
        {step === 5 && (
          <div className="space-y-6">
            <h2 className="font-serif text-xl text-foreground">Ready to Begin</h2>
            <div className="bg-card border border-primary/30 rounded-lg p-6 space-y-4">
              <div className="border-b border-border pb-4">
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Campaign</div>
                <div className="font-serif text-xl text-foreground">{form.campaignName || "The Unnamed Quest"}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Name</div>
                  <div className="font-serif text-foreground">{form.characterName || "The Nameless One"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Background</div>
                  <div className="text-foreground text-sm">{form.background}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Race</div>
                  <div className="text-foreground text-sm">{form.race || "Human"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Class</div>
                  <div className="text-foreground text-sm">{form.class || "Fighter"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Alignment</div>
                  <div className="text-foreground text-sm">{form.alignment}</div>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-2 pt-2">
                {STAT_KEYS.map(k => (
                  <div key={k} className="text-center">
                    <div className="text-xs text-muted-foreground uppercase">{k.slice(0, 3)}</div>
                    <div className="font-bold text-foreground">{form.stats[k]}</div>
                    <div className="text-xs text-primary">{modifier(form.stats[k])}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-10 pt-6 border-t border-border">
          <Button
            variant="outline"
            onClick={() => step > 1 ? setStep(s => s - 1) : setLocation("/")}
            data-testid="button-prev-step"
            className="border-border text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {step === 1 ? "Cancel" : "Back"}
          </Button>

          {step < 5 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              data-testid="button-next-step"
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-serif"
            >
              Continue <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleFinish}
              disabled={createCampaign.isPending || updateCharacter.isPending}
              data-testid="button-begin-adventure"
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-serif gap-2"
            >
              <Star className="w-4 h-4" />
              Begin the Adventure
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
