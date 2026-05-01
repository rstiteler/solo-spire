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
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, Save, Send, Dices, Sword, Shield, Heart, Zap, BookOpen, Package,
  ChevronDown, ChevronUp, User, Star, CheckCircle, XCircle, Minus, Plus, Scroll
} from "lucide-react";

// Types from API
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

// --- Dice Tray ---
function DiceTray({ onRoll }: { onRoll: (roll: DiceRoll) => void }) {
  const rollDice = useRollDice();
  const [pending, setPending] = useState<DiceRoll[]>([]);
  const [rolling, setRolling] = useState<number | null>(null);

  async function handleRoll(sides: number) {
    setRolling(sides);
    try {
      const result = await rollDice.mutateAsync({ data: { expression: `1d${sides}` } });
      const roll: DiceRoll = {
        expression: result.expression,
        label: result.label ?? null,
        total: result.total,
        rolls: result.rolls,
        modifier: result.modifier,
        details: result.details,
      };
      setPending(p => [...p, roll]);
      onRoll(roll);
    } finally {
      setRolling(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {DICE_FACES.map(d => (
        <button
          key={d}
          data-testid={`button-roll-d${d}`}
          onClick={() => handleRoll(d)}
          disabled={rolling !== null}
          className={`relative w-10 h-10 rounded border font-serif font-bold text-xs transition-all
            ${rolling === d ? "border-primary bg-primary/20 text-primary animate-pulse" : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"}
            disabled:opacity-50`}
        >
          d{d}
        </button>
      ))}
    </div>
  );
}

// --- HP Adjuster ---
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
    const newHp = positive
      ? Math.min(maxHp, hp + n)
      : Math.max(0, hp - n);
    await updateChar.mutateAsync({ campaignId, data: { hp: newHp } });
    await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
    setDelta("");
    setEditing(false);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">HP</span>
        <button
          onClick={() => setEditing(e => !e)}
          data-testid="button-edit-hp"
          className="text-primary hover:text-primary/80 font-bold font-serif"
        >
          {hp}{tempHp > 0 ? `+${tempHp}` : ""} / {maxHp}
        </button>
      </div>
      <div className="w-full bg-card border border-border rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${hpColor}`} style={{ width: `${pct}%` }} />
      </div>
      {editing && (
        <div className="flex gap-1 mt-1">
          <input
            data-testid="input-hp-delta"
            type="number"
            value={delta}
            onChange={e => setDelta(e.target.value)}
            placeholder="Amount"
            className="flex-1 bg-card border border-border rounded px-2 py-1 text-xs text-foreground min-w-0"
          />
          <button onClick={() => applyDelta(true)} data-testid="button-heal" className="px-2 py-1 rounded bg-green-800/50 border border-green-700 text-green-300 text-xs hover:bg-green-800">
            <Plus className="w-3 h-3" />
          </button>
          <button onClick={() => applyDelta(false)} data-testid="button-damage" className="px-2 py-1 rounded bg-red-900/50 border border-red-800 text-red-300 text-xs hover:bg-red-900">
            <Minus className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// --- Character Panel ---
function CharacterPanel({ campaignId }: { campaignId: number }) {
  const { data: char } = useGetCharacter(campaignId, {
    query: { queryKey: getGetCharacterQueryKey(campaignId) }
  });
  const { data: campaign } = useGetCampaign(campaignId, {
    query: { queryKey: getGetCampaignQueryKey(campaignId) }
  });

  if (!char) return (
    <div className="p-4 text-muted-foreground text-sm font-serif italic">No character found.</div>
  );

  const lvl = char.level ?? 1;
  const xp = char.xp ?? 0;
  const xpNext = XP_THRESHOLDS[lvl] ?? 355000;
  const xpPrev = XP_THRESHOLDS[lvl - 1] ?? 0;
  const xpPct = Math.min(100, Math.max(0, ((xp - xpPrev) / (xpNext - xpPrev)) * 100));

  const spellSlots = (char.spellSlots as Record<string, number> | null) ?? {};
  const spellSlotsUsed = (char.spellSlotsUsed as Record<string, number> | null) ?? {};
  const conditions = (char.conditions as string[] | null) ?? [];

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-5 scrollbar-thin">
      {/* Portrait */}
      <div className="text-center">
        <div className="w-20 h-20 mx-auto rounded-full border-2 border-primary/40 bg-card flex items-center justify-center mb-2 overflow-hidden">
          {char.portraitUrl
            ? <img src={char.portraitUrl} alt={char.name} className="w-full h-full object-cover" />
            : <User className="w-8 h-8 text-muted-foreground/50" />
          }
        </div>
        <div className="font-serif text-base font-bold text-foreground" data-testid="text-character-name">{char.name}</div>
        <div className="text-xs text-muted-foreground">{char.race} {char.class}</div>
        <div className="text-xs text-primary font-bold">Level {lvl}</div>
        {char.portraitDescription && (
          <details className="mt-1">
            <summary className="text-xs text-muted-foreground/60 cursor-pointer hover:text-muted-foreground">Portrait</summary>
            <p className="text-xs text-muted-foreground/80 mt-1 font-serif italic leading-relaxed">{char.portraitDescription}</p>
          </details>
        )}
      </div>

      {/* XP Progress */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>XP</span>
          <span data-testid="text-xp">{xp} / {xpNext}</span>
        </div>
        <div className="w-full bg-card border border-border rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${xpPct}%` }} />
        </div>
      </div>

      {/* HP, AC, Speed */}
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

      {/* Ability Scores */}
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

      {/* Spell Slots */}
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

      {/* Death Saves */}
      {char.deathSaves && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Death Saves</div>
          <div className="flex gap-3">
            <div className="flex gap-1 items-center">
              <CheckCircle className="w-3 h-3 text-green-600" />
              {[0, 1, 2].map(i => (
                <div key={i} className={`w-3 h-3 rounded-full border ${i < (char.deathSaves as { successes: number }).successes ? "bg-green-600 border-green-600" : "border-border"}`} />
              ))}
            </div>
            <div className="flex gap-1 items-center">
              <XCircle className="w-3 h-3 text-red-600" />
              {[0, 1, 2].map(i => (
                <div key={i} className={`w-3 h-3 rounded-full border ${i < (char.deathSaves as { failures: number }).failures ? "bg-red-600 border-red-600" : "border-border"}`} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Conditions */}
      {conditions.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Conditions</div>
          <div className="flex flex-wrap gap-1">
            {conditions.map(c => (
              <Badge key={c} variant="outline" className="text-xs border-destructive/50 text-destructive">{c}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Gold */}
      <div className="flex items-center justify-between bg-card border border-border rounded p-2">
        <span className="text-xs text-muted-foreground">Gold</span>
        <span className="font-serif font-bold text-primary" data-testid="text-gold">{campaign?.gold ?? 0} gp</span>
      </div>
    </div>
  );
}

// --- Chat Message ---
function ChatMessage({ msg }: { msg: Message }) {
  if (msg.role === "system") return null;

  const isAI = msg.role === "assistant";
  const rolls = (msg.diceRolls as DiceRoll[] | null) ?? [];

  return (
    <div className={`space-y-2 ${isAI ? "" : "flex flex-col items-end"}`}>
      {rolls.length > 0 && rolls.map((roll, i) => (
        <div key={i} className="bg-primary/10 border border-primary/30 rounded p-3 inline-flex gap-3 items-center self-end">
          <Dices className="w-4 h-4 text-primary flex-shrink-0" />
          <div>
            <div className="text-xs text-muted-foreground">{roll.expression}{roll.label ? ` — ${roll.label}` : ""}</div>
            <div className="font-serif font-bold text-primary text-lg leading-none">{roll.total}</div>
            <div className="text-xs text-muted-foreground/70">{roll.details}</div>
          </div>
        </div>
      ))}
      <div className={`rounded-lg px-4 py-3 max-w-full ${
        isAI
          ? "bg-card border border-border text-foreground font-serif leading-relaxed text-[0.95rem]"
          : "bg-primary/15 border border-primary/25 text-foreground text-sm"
      }`}>
        <div className="whitespace-pre-wrap">{msg.content}</div>
      </div>
    </div>
  );
}

// --- Sidebar Quests/Inventory ---
function SidebarPanel({ campaignId }: { campaignId: number }) {
  const [tab, setTab] = useState<"quests" | "inventory">("quests");
  const { data: quests } = useListQuests(campaignId, { query: { queryKey: getListQuestsQueryKey(campaignId) } });
  const { data: items } = useListInventory(campaignId, { query: { queryKey: getListInventoryQueryKey(campaignId) } });
  const updateItem = useUpdateInventoryItem();
  const queryClient = useQueryClient();

  async function toggleEquip(campaignId: number, itemId: number, equipped: boolean) {
    await updateItem.mutateAsync({ campaignId, itemId, data: { isEquipped: !equipped } });
    await queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey(campaignId) });
  }

  const activeQuests = (quests ?? []).filter(q => q.status === "active");
  const doneQuests = (quests ?? []).filter(q => q.status !== "active");

  const ITEM_ICONS: Record<string, string> = {
    weapon: "⚔", armor: "🛡", consumable: "⊕", tool: "⚙", treasure: "◆", misc: "◇"
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab("quests")}
          data-testid="tab-quests"
          className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
            tab === "quests" ? "text-primary border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Scroll className="w-3 h-3" /> Quests
        </button>
        <button
          onClick={() => setTab("inventory")}
          data-testid="tab-inventory"
          className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
            tab === "inventory" ? "text-primary border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Package className="w-3 h-3" /> Inventory
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {tab === "quests" && (
          <>
            {activeQuests.length === 0 && doneQuests.length === 0 && (
              <p className="text-xs text-muted-foreground/60 italic font-serif text-center py-4">No quests yet. Venture forth to find purpose.</p>
            )}
            {activeQuests.map(q => (
              <div key={q.id} data-testid={`quest-${q.id}`} className={`rounded border p-2.5 ${q.isMain ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
                <div className="flex items-start gap-1.5">
                  {q.isMain && <Star className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />}
                  <div>
                    <div className="text-xs font-semibold text-foreground">{q.title}</div>
                    {q.description && <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{q.description}</div>}
                  </div>
                </div>
              </div>
            ))}
            {doneQuests.length > 0 && (
              <details>
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Completed / Failed ({doneQuests.length})</summary>
                <div className="mt-2 space-y-1">
                  {doneQuests.map(q => (
                    <div key={q.id} className={`rounded border p-2 opacity-50 ${q.status === "failed" ? "border-destructive/30" : "border-border"}`}>
                      <div className="text-xs text-muted-foreground line-through">{q.title}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}

        {tab === "inventory" && (
          <>
            {(items ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground/60 italic font-serif text-center py-4">Your pack is empty. Collect treasures and tools on your journey.</p>
            )}
            {(items ?? []).map(item => (
              <div
                key={item.id}
                data-testid={`inventory-item-${item.id}`}
                className={`rounded border p-2 flex items-start gap-2 ${item.isEquipped ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}
              >
                <span className="text-sm mt-0.5">{ITEM_ICONS[item.itemType] ?? "◇"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-foreground truncate">{item.name}</span>
                    {item.quantity > 1 && <span className="text-xs text-muted-foreground">x{item.quantity}</span>}
                    {item.isEquipped && <Badge className="text-xs px-1 py-0 bg-primary/20 text-primary border-primary/30">equipped</Badge>}
                  </div>
                  {item.description && <div className="text-xs text-muted-foreground/70 truncate">{item.description}</div>}
                </div>
                {(item.itemType === "weapon" || item.itemType === "armor") && (
                  <button
                    onClick={() => toggleEquip(campaignId, item.id, item.isEquipped ?? false)}
                    data-testid={`button-equip-${item.id}`}
                    className="text-xs text-muted-foreground hover:text-primary flex-shrink-0"
                  >
                    {item.isEquipped ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// --- Main Game View ---
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

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  function handleDiceRoll(roll: DiceRoll) {
    setPendingRolls(prev => [...prev, roll]);
  }

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
        body: JSON.stringify({
          content: msg || "(the player rolled dice)",
          diceRolls: rolls.length > 0 ? rolls : undefined,
        }),
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
                setStreamingContent(c => c + data.content);
              }
              if (data.done) {
                setStreamingContent("");
                await queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(campaignId) });
                await queryClient.invalidateQueries({ queryKey: getGetCharacterQueryKey(campaignId) });
                await queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
                await queryClient.invalidateQueries({ queryKey: getListQuestsQueryKey(campaignId) });
                await queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey(campaignId) });
                if (data.levelUp) {
                  toast({ title: "Level Up!", description: "Your character has grown stronger." });
                }
              }
              if (data.error) {
                toast({ title: "AI Error", description: data.error, variant: "destructive" });
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
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
            {campaign?.currentLocation && (
              <div className="text-xs text-muted-foreground">{campaign.currentLocation}</div>
            )}
          </div>
        </div>

        {/* Mobile tab switcher */}
        <div className="flex gap-1 lg:hidden">
          {(["character", "chat", "sidebar"] as const).map(t => (
            <button
              key={t}
              onClick={() => setMobileTab(t)}
              data-testid={`mobile-tab-${t}`}
              className={`px-2 py-1 rounded text-xs capitalize transition-colors ${mobileTab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "character" ? <User className="w-4 h-4" /> : t === "chat" ? <BookOpen className="w-4 h-4" /> : <Package className="w-4 h-4" />}
            </button>
          ))}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleSave}
          disabled={saveCampaign.isPending}
          data-testid="button-save"
          className="border-border text-muted-foreground hover:text-foreground gap-1.5 hidden sm:flex"
        >
          <Save className="w-3.5 h-3.5" /> Save
        </Button>
      </header>

      {/* Main Layout */}
      <div className="flex-1 overflow-hidden flex">
        {/* LEFT: Character Sheet */}
        <div className={`w-64 xl:w-72 flex-shrink-0 border-r border-border ${mobileTab === "character" ? "block" : "hidden"} lg:block`}>
          <CharacterPanel campaignId={campaignId} />
        </div>

        {/* CENTER: Chat */}
        <div className={`flex-1 flex flex-col overflow-hidden ${mobileTab === "chat" ? "flex" : "hidden"} lg:flex`}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messagesLoading && (
              <div className="text-center text-muted-foreground text-sm font-serif italic py-8">
                <div className="animate-pulse">Loading your adventure...</div>
              </div>
            )}
            {!messagesLoading && allMessages.length === 0 && (
              <div className="text-center py-12">
                <div className="font-serif text-muted-foreground/60 text-lg italic mb-3">The story awaits.</div>
                <div className="text-sm text-muted-foreground/50">Send a message to begin your adventure. Your Dungeon Master is ready.</div>
              </div>
            )}
            {allMessages.map(msg => (
              <ChatMessage key={msg.id} msg={msg} />
            ))}
            {streaming && streamingContent && (
              <div className="bg-card border border-border rounded-lg px-4 py-3 text-foreground font-serif leading-relaxed text-[0.95rem]">
                <div className="whitespace-pre-wrap">{streamingContent}</div>
                <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-1 rounded-sm" />
              </div>
            )}
            {streaming && !streamingContent && (
              <div className="bg-card border border-border rounded-lg px-4 py-3">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Pending Rolls */}
          {pendingRolls.length > 0 && (
            <div className="px-4 py-2 border-t border-border bg-primary/5 flex flex-wrap gap-2">
              {pendingRolls.map((r, i) => (
                <div key={i} className="bg-primary/20 border border-primary/30 rounded px-2 py-1 text-xs text-primary flex items-center gap-1">
                  <Dices className="w-3 h-3" /> {r.expression} = <strong>{r.total}</strong>
                  <button onClick={() => setPendingRolls(p => p.filter((_, j) => j !== i))} className="ml-1 hover:text-destructive">×</button>
                </div>
              ))}
            </div>
          )}

          {/* Dice Tray */}
          {showDice && (
            <div className="px-4 py-2 border-t border-border bg-card/50">
              <DiceTray onRoll={handleDiceRoll} />
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-3 border-t border-border flex gap-2 items-end">
            <button
              onClick={() => setShowDice(s => !s)}
              data-testid="button-toggle-dice"
              className={`p-2 rounded border transition-colors flex-shrink-0 ${showDice ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-primary hover:border-primary"}`}
            >
              <Dices className="w-4 h-4" />
            </button>
            <Textarea
              ref={inputRef}
              data-testid="input-message"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="What do you do?"
              rows={2}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={streaming}
              className="flex-1 bg-card border-border text-foreground placeholder:text-muted-foreground/50 resize-none text-sm"
            />
            <Button
              onClick={sendMessage}
              disabled={streaming || (!input.trim() && pendingRolls.length === 0)}
              data-testid="button-send-message"
              className="flex-shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 h-[52px] px-3"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* RIGHT: Quests / Inventory */}
        <div className={`w-64 xl:w-72 flex-shrink-0 border-l border-border ${mobileTab === "sidebar" ? "block" : "hidden"} lg:block`}>
          <SidebarPanel campaignId={campaignId} />
        </div>
      </div>
    </div>
  );
}
