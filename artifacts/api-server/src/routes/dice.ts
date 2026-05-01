import { Router } from "express";
import { RollDiceBody } from "@workspace/api-zod";

const router = Router();

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function parseDiceExpression(expression: string): {
  total: number;
  rolls: number[];
  modifier: number;
  details: string;
} {
  const expr = expression.toLowerCase().trim();

  // Handle "4d6kh3" (keep highest 3) and "4d6kl3" (keep lowest 3)
  const keepHighMatch = expr.match(/^(\d+)d(\d+)kh(\d+)([+-]\d+)?$/);
  const keepLowMatch = expr.match(/^(\d+)d(\d+)kl(\d+)([+-]\d+)?$/);
  const standardMatch = expr.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  const modOnlyMatch = expr.match(/^([+-]?\d+)$/);

  if (keepHighMatch) {
    const count = parseInt(keepHighMatch[1]);
    const sides = parseInt(keepHighMatch[2]);
    const keep = parseInt(keepHighMatch[3]);
    const modifier = keepHighMatch[4] ? parseInt(keepHighMatch[4]) : 0;
    const allRolls = Array.from({ length: count }, () => rollDie(sides));
    const sorted = [...allRolls].sort((a, b) => b - a);
    const kept = sorted.slice(0, keep);
    const dropped = sorted.slice(keep);
    const total = kept.reduce((a, b) => a + b, 0) + modifier;
    const details = `[${allRolls.join(", ")}] keep highest ${keep}: [${kept.join(", ")}]${dropped.length ? ` drop [${dropped.join(", ")}]` : ""}${modifier ? (modifier > 0 ? ` + ${modifier}` : ` ${modifier}`) : ""}`;
    return { total, rolls: allRolls, modifier, details };
  }

  if (keepLowMatch) {
    const count = parseInt(keepLowMatch[1]);
    const sides = parseInt(keepLowMatch[2]);
    const keep = parseInt(keepLowMatch[3]);
    const modifier = keepLowMatch[4] ? parseInt(keepLowMatch[4]) : 0;
    const allRolls = Array.from({ length: count }, () => rollDie(sides));
    const sorted = [...allRolls].sort((a, b) => a - b);
    const kept = sorted.slice(0, keep);
    const total = kept.reduce((a, b) => a + b, 0) + modifier;
    const details = `[${allRolls.join(", ")}] keep lowest ${keep}: [${kept.join(", ")}]${modifier ? (modifier > 0 ? ` + ${modifier}` : ` ${modifier}`) : ""}`;
    return { total, rolls: allRolls, modifier, details };
  }

  if (standardMatch) {
    const count = parseInt(standardMatch[1]);
    const sides = parseInt(standardMatch[2]);
    const modifier = standardMatch[3] ? parseInt(standardMatch[3]) : 0;
    const rolls = Array.from({ length: count }, () => rollDie(sides));
    const total = rolls.reduce((a, b) => a + b, 0) + modifier;
    const details = count === 1
      ? `${rolls[0]}${modifier ? (modifier > 0 ? ` + ${modifier}` : ` ${modifier}`) : ""}`
      : `[${rolls.join(", ")}]${modifier ? (modifier > 0 ? ` + ${modifier}` : ` ${modifier}`) : ""}`;
    return { total, rolls, modifier, details };
  }

  if (modOnlyMatch) {
    const value = parseInt(modOnlyMatch[1]);
    return { total: value, rolls: [value], modifier: value, details: String(value) };
  }

  // Fallback: single d20
  const roll = rollDie(20);
  return { total: roll, rolls: [roll], modifier: 0, details: String(roll) };
}

router.post("/roll", (req, res) => {
  const parsed = RollDiceBody.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: parsed.error });

  try {
    const result = parseDiceExpression(parsed.data.expression);
    res.json({
      expression: parsed.data.expression,
      label: parsed.data.label ?? null,
      ...result,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to roll dice");
    res.status(400).json({ error: "Invalid dice expression" });
  }
});

export default router;
