
import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BookOpen, ShieldAlert, Target, Trophy, Layers, Sparkles, Calculator, BarChart3, Crown, AlertTriangle } from "lucide-react";
import "./style.css";

const ranks = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
const rankValue = { A:14, K:13, Q:12, J:11, T:10, "9":9, "8":8, "7":7, "6":6, "5":5, "4":4, "3":3, "2":2 };

const positionsByFormat = {
  "Tournament 8-Handed": ["UTG","UTG+1","LJ","HJ","CO","BTN","SB","BB"],
  "Tournament 6-Handed": ["LJ","HJ","CO","BTN","SB","BB"],
  "Cash 6-Max": ["LJ","HJ","CO","BTN","SB","BB"],
  "Cash 9-Handed": ["UTG","UTG+1","UTG+2","LJ","HJ","CO","BTN","SB","BB"],
  "Cash 8-Handed UTG Straddle": ["UTG+1","LJ","HJ","CO","BTN","SB","BB","UTG Straddle"],
};

const scenarios = ["Unopened Pot / RFI","Facing Open","Facing 3-Bet","Facing 4-Bet","Short Stack Open Jam","Facing Jam","BB Defense"];
const villainCounts = ["0", "1", "2", "3+"];
const stackOptions = ["5","8","10","12","15","20","25","30","40","60","100","150"];
const openSizeOptions = ["2.0","2.1","2.2","2.3","2.5","3.0","3.5"];
const anteOptions = ["Yes", "No"];
const tablePresetOptions = ["Standard", "High Rake", "Soft / Passive", "Aggressive / 3-bet Heavy"];

function isUtgStraddleFormat(format) {
  return format === "Cash 8-Handed UTG Straddle";
}

function effectiveBBMultiplier(format) {
  return isUtgStraddleFormat(format) ? 2 : 1;
}

function handAt(row, col) {
  const a = ranks[row], b = ranks[col];
  if (row === col) return `${a}${b}`;
  return row < col ? `${a}${b}s` : `${b}${a}o`;
}

function allHands() {
  const out = [];

  // User-friendly dropdown order:
  // AA, AKs, AKo, AQs, AQo ... then KK, KQs, KQo ...
  // This keeps suited and offsuit versions beside each other.
  for (let i = 0; i < ranks.length; i++) {
    const high = ranks[i];

    // Pair first within each rank group.
    out.push(`${high}${high}`);

    // Then suited + offsuit combos together.
    for (let j = i + 1; j < ranks.length; j++) {
      const low = ranks[j];
      out.push(`${high}${low}s`);
      out.push(`${high}${low}o`);
    }
  }

  return out;
}

function parseHand(hand) {
  if (hand.length === 2) return { r1: hand[0], r2: hand[1], v1: rankValue[hand[0]], v2: rankValue[hand[1]], pair: true, suited: false, offsuit: false, gap: 0 };
  const r1 = hand[0], r2 = hand[1], suffix = hand[2];
  const v1 = rankValue[r1], v2 = rankValue[r2];
  return { r1, r2, v1, v2, pair: false, suited: suffix === "s", offsuit: suffix === "o", gap: Math.abs(v1 - v2) - 1 };
}

function chenLikeScore(hand) {
  const h = parseHand(hand);
  if (h.pair) return Math.max(5, h.v1);
  let score = Math.max(h.v1, h.v2) / 2;
  if (h.r1 === "A" || h.r2 === "A") score += 1.5;
  if (h.suited) score += 2;
  if (h.gap === 0) score += 1.5;
  if (h.gap === 1) score += 0.8;
  if (h.gap === 2) score += 0.2;
  if (h.gap >= 4) score -= 1.2;
  if (Math.max(h.v1, h.v2) < 12 && h.gap <= 1) score += 0.5;
  return score;
}

function handClass(hand) {
  const h = parseHand(hand);
  const score = chenLikeScore(hand);
  const wheelAce = h.r1 === "A" && h.suited && ["5","4","3","2"].includes(h.r2);
  const broadway = h.v1 >= 10 && h.v2 >= 10;
  const suitedConnector = h.suited && h.gap <= 1 && h.v1 <= 12 && h.v2 >= 5;
  if (["AA","KK","QQ","JJ","AKs","AKo"].includes(hand)) return "premium";
  if (["TT","99","AQs","AJs","KQs","AQo"].includes(hand)) return "strong";
  if (h.pair && h.v1 >= 7) return "strong";
  if (wheelAce || broadway || suitedConnector || (h.pair && h.v1 <= 6)) return "playable";
  if (score >= 7.5) return "playable";
  if (h.suited && (h.r1 === "A" || h.r1 === "K" || h.gap <= 2)) return "speculative";
  return "weak";
}

function positionStage(position) {
  if (["UTG","UTG+1","UTG+2","LJ"].includes(position)) return "early";
  if (["HJ","CO"].includes(position)) return "middle";
  if (["BTN","SB"].includes(position)) return "late";
  if (position === "UTG Straddle" || position === "BB") return "blind";
  return "blind";
}

function stackCategory(bb) {
  const n = Number(bb);
  if (n <= 8) return "tiny";
  if (n <= 15) return "short";
  if (n <= 30) return "medium";
  if (n <= 60) return "deepish";
  return "deep";
}

function actionPressure(action) {
  if (action === "Jam") return 5;
  if (action === "4-Bet") return 4;
  if (action === "3-Bet") return 3;
  if (action === "Open") return 2;
  if (action === "Call") return 1;
  return 0;
}

function positionTightness(pos) {
  if (["UTG","UTG+1","UTG+2","LJ"].includes(pos)) return 2;
  if (["HJ","CO"].includes(pos)) return 1;
  return 0;
}

function actionLinePressure({ villainPos, villain1Action, villain2Pos, villain2Action, villainCount }) {
  let pressure = actionPressure(villain1Action) + positionTightness(villainPos);
  if (villainCount === "2" || villainCount === "3+") pressure += actionPressure(villain2Action) + positionTightness(villain2Pos);
  if (villainCount === "2") pressure += 1.25;
  if (villainCount === "3+") pressure += 2;
  return pressure;
}

function baseThreshold({ scenario, heroPos, villainPos, stackBB, format }) {
  const stage = positionStage(heroPos);
  const vStage = positionStage(villainPos);
  const stack = stackCategory(stackBB);
  let t = 0;

  if (scenario === "Unopened Pot / RFI") {
    t = stage === "early" ? 9.5 : stage === "middle" ? 8.0 : stage === "late" ? 6.2 : 8.2;
    if (format.includes("9") && ["UTG","UTG+1"].includes(heroPos)) t += 0.7;
    if (stack === "tiny") t -= 1.2;
    if (stack === "short") t -= 0.6;
    if (stack === "deep") t -= 0.3;
  }
  if (scenario === "Facing Open") {
    t = vStage === "early" ? 10.2 : vStage === "middle" ? 9.0 : 7.8;
    if (["SB","BB"].includes(heroPos)) t -= 0.4;
    if (stack === "short") t += 0.4;
    if (stack === "deep") t -= 0.2;
  }
  if (scenario === "Facing 3-Bet") {
    t = 10.8;
    if (["BTN","CO"].includes(heroPos)) t -= 0.3;
    if (stack === "short") t += 0.8;
    if (stack === "deep") t -= 0.3;
  }
  if (scenario === "Facing 4-Bet") {
    t = 12.3;
    if (stack === "short" || stack === "medium") t -= 0.2;
    if (stack === "deep") t += 0.4;
  }
  if (scenario === "Short Stack Open Jam") {
    t = stack === "tiny" ? 5.8 : stack === "short" ? 7.0 : stack === "medium" ? 9.0 : 10.5;
    if (stage === "late") t -= 1.0;
    if (stage === "early") t += 0.8;
  }
  if (scenario === "Facing Jam") {
    t = stack === "tiny" ? 8.0 : stack === "short" ? 9.2 : stack === "medium" ? 10.5 : 11.5;
    if (vStage === "early") t += 0.8;
    if (vStage === "late") t -= 0.5;
  }
  if (scenario === "BB Defense") {
    t = vStage === "early" ? 7.4 : vStage === "middle" ? 6.6 : 5.6;
    if (stack === "short") t += 0.4;
    if (stack === "deep") t -= 0.4;
  }
  if (isUtgStraddleFormat(format)) {
    if (scenario === "Unopened Pot / RFI") {
      if (heroPos === "UTG+1" || heroPos === "LJ") t += 0.5;
      if (heroPos === "CO" || heroPos === "BTN") t -= 0.2;
      if (heroPos === "UTG Straddle") t -= 0.8;
    }
    if (scenario === "BB Defense" || heroPos === "UTG Straddle") {
      t -= 0.4;
    }
    if (scenario.includes("Facing")) {
      t += 0.25;
    }
  }
  return t;
}

function comboBonus(hand, scenario, stackBB) {
  const h = parseHand(hand);
  const cls = handClass(hand);
  const stack = stackCategory(stackBB);
  let b = 0;
  if (cls === "premium") b += 5;
  if (cls === "strong") b += 2.2;
  if (cls === "playable") b += 0.9;
  if (cls === "speculative") b += 0.1;
  if (cls === "weak") b -= 1.4;
  if (h.pair && stack !== "tiny") b += 0.5;
  if (h.pair && stack === "tiny" && h.v1 < 7) b -= 0.4;
  if (h.suited) b += 0.45;
  if (h.offsuit && h.v1 < 12 && h.v2 < 12) b -= 0.55;
  if (h.r1 === "A" && h.suited && ["5","4","3","2"].includes(h.r2) && ["Facing Open","3-Bet","Facing 3-Bet"].some(x => scenario.includes(x))) b += 0.75;
  if (h.gap <= 1 && h.suited && stack === "deep") b += 0.45;
  if (h.gap >= 4 && !h.r1.includes("A")) b -= 0.45;
  return b;
}

function villainRangePenalty(hand, { scenario, villainPos, villain1Action, villain2Action }) {
  const cls = handClass(hand);
  const h = parseHand(hand);
  let p = 0;
  const earlyVillain = ["UTG","UTG+1","UTG+2","LJ"].includes(villainPos);
  const strongAction = ["3-Bet","4-Bet","Jam"].includes(villain1Action) || ["3-Bet","4-Bet","Jam"].includes(villain2Action);
  if (earlyVillain && scenario !== "Unopened Pot / RFI") p += 0.7;
  if (strongAction && cls === "weak") p += 2.5;
  if (strongAction && cls === "speculative") p += 1.6;
  if (strongAction && cls === "playable") p += 0.8;
  if (scenario === "Facing Jam" && !h.pair && h.offsuit && h.v1 < 13) p += 1.1;
  return p;
}

function scoreHand(hand, params) {
  const score = chenLikeScore(hand);
  const threshold = baseThreshold(params);
  const pressure = actionLinePressure(params);
  const bonus = comboBonus(hand, params.scenario, params.stackBB);
  const penalty = villainRangePenalty(hand, params);
  const multiwayPenalty = pressure * 0.28;
  return score + bonus - threshold - penalty - multiwayPenalty;
}

function frequencies(hand, params, icmAdjustment = 0) {
  const s = scoreHand(hand, params) - icmAdjustment;
  const cls = handClass(hand);
  const scenario = params.scenario;
  let raise = 0, call = 0, fold = 0;
  function clamp(x) { return Math.max(0, Math.min(100, Math.round(x))); }

  if (scenario === "Unopened Pot / RFI") {
    raise = clamp(50 + s * 18); call = 0; fold = 100 - raise;
  } else if (scenario === "Facing Open") {
    raise = clamp((cls === "premium" ? 45 : cls === "strong" ? 25 : 8) + s * 10);
    call = clamp(42 + s * 12 - raise * 0.25);
    fold = clamp(100 - raise - call);
  } else if (scenario === "Facing 3-Bet") {
    raise = clamp((cls === "premium" ? 45 : cls === "strong" ? 15 : 3) + s * 8);
    call = clamp(38 + s * 10 - raise * 0.18);
    fold = clamp(100 - raise - call);
  } else if (scenario === "Facing 4-Bet") {
    raise = clamp((cls === "premium" ? 70 : cls === "strong" ? 18 : 2) + s * 9);
    call = clamp((cls === "premium" ? 25 : cls === "strong" ? 20 : 5) + s * 4);
    fold = clamp(100 - raise - call);
  } else if (scenario === "Short Stack Open Jam") {
    raise = clamp(52 + s * 18); call = 0; fold = 100 - raise;
  } else if (scenario === "Facing Jam") {
    raise = 0; call = clamp(48 + s * 16); fold = 100 - call;
  } else if (scenario === "BB Defense") {
    raise = clamp((cls === "premium" ? 25 : cls === "strong" ? 12 : 3) + s * 5);
    call = clamp(50 + s * 12 - raise * 0.25);
    fold = clamp(100 - raise - call);
  }

  if (fold < 0) {
    const excess = -fold; fold = 0;
    if (call >= excess) call -= excess;
    else raise = Math.max(0, raise - (excess - call));
  }
  const total = raise + call + fold;
  if (total !== 100) fold += 100 - total;

  let primaryAction = "Fold";
  if (raise >= call && raise >= fold) primaryAction = scenario.includes("Jam") || scenario === "Short Stack Open Jam" ? "Jam / Raise" : "Raise / 3-bet";
  else if (call >= fold) primaryAction = "Call / Continue";

  let category = "fold";
  if (raise + call >= 80) category = "primary";
  else if (raise + call >= 35) category = "secondary";
  return { raise, call, fold, primaryAction, category, score: s.toFixed(2) };
}


function roundToFive(x) {
  return Math.max(0, Math.min(100, Math.round(x / 5) * 5));
}

function normalizeFreqs(freq) {
  let raise = roundToFive(freq.raise);
  let call = roundToFive(freq.call);
  let fold = roundToFive(freq.fold);
  let total = raise + call + fold;
  if (total !== 100) {
    const diff = 100 - total;
    if (fold + diff >= 0 && fold + diff <= 100) fold += diff;
    else if (call + diff >= 0 && call + diff <= 100) call += diff;
    else raise += diff;
  }
  let primaryAction = freq.primaryAction;
  if (raise >= call && raise >= fold) primaryAction = "Raise / 3-bet";
  else if (call >= fold) primaryAction = "Call / Continue";
  else primaryAction = "Fold";
  return { ...freq, raise, call, fold, primaryAction };
}

function confidenceGrade(params) {
  let score = 82;
  if (params.villainCount === "2") score -= 10;
  if (params.villainCount === "3+") score -= 16;
  if (["Facing 4-Bet", "Facing Jam"].includes(params.scenario)) score -= 9;
  if (params.format.includes("UTG Straddle")) score -= 7;
  if (Number(params.stackBB) <= 12) score -= 8;
  if (params.tablePreset === "Soft / Passive" || params.tablePreset === "Aggressive / 3-bet Heavy") score -= 5;
  if (Number(params.icmPressureQuick || 0) >= 50) score -= 10;
  score = Math.max(35, Math.min(92, score));
  if (score >= 78) return { label: "High for heuristic", score, text: "Good for baseline study; still not a solver output." };
  if (score >= 60) return { label: "Medium", score, text: "Useful directionally; exact combo frequencies may differ in solver outputs." };
  return { label: "Low / complex node", score, text: "Treat as conceptual guidance. True answer needs a solver/tree or full ICM model." };
}

function reasonBullets(hand, params, freq, sizing) {
  const h = parseHand(hand);
  const cls = handClass(hand);
  const bullets = [];
  bullets.push(`${hand} is classified as ${cls}; raw morphology score ${chenLikeScore(hand).toFixed(1)}.`);
  if (h.suited) bullets.push("Suitedness improves realization and blocker/playability value.");
  if (h.pair) bullets.push("Pocket pair keeps equity well but can lose value under high ICM call-off pressure.");
  if (params.scenario.includes("Facing")) bullets.push("Facing aggression increases threshold; continue range should be stronger than first-in range.");
  if (params.villainCount === "2" || params.villainCount === "3+") bullets.push("Multiway action tightens continuing range, especially offsuit dominated hands.");
  if (Number(params.icmPressureQuick || 0) >= 50) bullets.push("ICM pressure quick input is high enough to tighten marginal calls before tightening opens.");
  if (sizing?.multiway) bullets.push("Sizing engine added multiway pressure; 3-bets should be larger and more value-heavy.");
  if (params.format.includes("UTG Straddle")) bullets.push("UTG straddle mode makes stacks effectively shallower in straddle units.");
  return bullets.slice(0, 5);
}

function actionExplanation(freq) {
  if (freq.category === "primary") return "Strong candidate in this node. Still adjust for sizing, reads, ICM, rake, and bounty pressure.";
  if (freq.category === "secondary") return "Borderline/mixed hand. Prefer continuing when sizing is small, villain is wide, or you have position.";
  return "Mostly outside this range. Folding is the default unless there is a strong exploitative reason.";
}

function icmPressureModel({ playersLeft, playersITM, heroStackBB, avgStackBB, currentPlace, nextPayJumpPlace, nextPayJumpAmount, initialBuyIn, bubbleFactorInput }) {
  const left = Math.max(1, Number(playersLeft || 1));
  const itm = Math.max(1, Number(playersITM || 1));
  const heroBB = Math.max(0.1, Number(heroStackBB || 1));
  const avgBB = Math.max(0.1, Number(avgStackBB || 1));
  const place = Math.max(1, Number(currentPlace || left));
  const jumpPlace = Math.max(1, Number(nextPayJumpPlace || itm));
  const jumpAmount = Math.max(0, Number(nextPayJumpAmount || 0));
  const buyIn = Math.max(1, Number(initialBuyIn || 1));
  const manualBubble = Number(bubbleFactorInput || 0);

  const toMoney = Math.max(0, left - itm);
  const bubbleDistanceRatio = left <= itm ? 0 : toMoney / Math.max(1, left);
  const nearBubbleScore = left > itm ? Math.max(0, 1 - bubbleDistanceRatio * 8) : 0;
  const payJumpDistance = Math.max(0, place - jumpPlace);
  const payJumpPressure = place >= jumpPlace ? Math.max(0, 1 - payJumpDistance / Math.max(3, left * 0.12)) : 0.2;
  const stackRatio = heroBB / avgBB;
  const stackFragility = stackRatio < 0.6 ? 0.35 : stackRatio < 1 ? 0.65 : stackRatio < 1.8 ? 1 : 0.55;
  const prizeMultiple = Math.min(6, jumpAmount / buyIn);
  const jumpValuePressure = Math.min(1, prizeMultiple / 3);

  let pressureScore = (nearBubbleScore * 38) + (payJumpPressure * 28) + (stackFragility * 18) + (jumpValuePressure * 16);
  if (left <= itm) pressureScore = (payJumpPressure * 45) + (stackFragility * 25) + (jumpValuePressure * 30);
  pressureScore = Math.max(0, Math.min(100, pressureScore));

  let riskPremium = 2 + pressureScore * 0.11;
  if (manualBubble > 0) riskPremium = Math.max(riskPremium, manualBubble * 3.5);
  riskPremium = Math.min(18, riskPremium);

  let label = "Low";
  if (pressureScore >= 70) label = "Very High";
  else if (pressureScore >= 50) label = "High";
  else if (pressureScore >= 30) label = "Medium";

  const callingTightness = pressureScore >= 70 ? "Tighten calls significantly; avoid marginal call-offs." : pressureScore >= 50 ? "Tighten calls clearly; prefer being first-in." : pressureScore >= 30 ? "Tighten marginal calls slightly." : "Chip-EV decisions are closer to normal.";
  const firstIn = pressureScore >= 70 ? "First-in aggression can still be good if fold equity is high, but avoid punt-risk into covering stacks." : pressureScore >= 50 ? "Prefer first-in jams/raises over calling off, especially versus stacks that can bust you." : "Normal first-in aggression is usually acceptable.";

  const callOffModifier = pressureScore >= 70 ? 2.2 : pressureScore >= 50 ? 1.45 : pressureScore >= 30 ? 0.75 : 0.25;
  return { pressureScore, riskPremium, label, toMoney, payJumpDistance, prizeMultiple, callingTightness, firstIn, callOffModifier };
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}


function isInPosition(heroPos, villainPos) {
  const order = { "UTG":0, "UTG+1":1, "UTG+2":2, "LJ":3, "HJ":4, "CO":5, "BTN":6, "SB":7, "BB":8, "UTG Straddle":9 };
  return (order[heroPos] ?? 0) > (order[villainPos] ?? 0) && heroPos !== "SB";
}

function roundHalf(x) {
  return Math.round(x * 2) / 2;
}

function sizingEngine({ format, heroPos, villainPos, scenario, stackBB, villainCount, villain1Action, villain2Action, openSizeFaced, ante, tablePreset, icmPressure = 0 }) {
  const stack = Number(stackBB || 25);
  const open = Number(openSizeFaced || 2.2);
  const tournament = format.includes("Tournament");
  const cash = format.includes("Cash");
  const straddle = isUtgStraddleFormat(format);
  const unit = effectiveBBMultiplier(format);
  const ip = isInPosition(heroPos, villainPos);
  const multiway = villainCount === "2" || villainCount === "3+" || villain2Action !== "None";
  const has3bet = villain1Action === "3-Bet" || villain2Action === "3-Bet";
  const has4bet = villain1Action === "4-Bet" || villain2Action === "4-Bet";
  const hasJam = villain1Action === "Jam" || villain2Action === "Jam";

  let openRaise = 2.2;
  if (tournament) {
    if (stack <= 15) openRaise = 2.0;
    else if (stack <= 30) openRaise = 2.1;
    else if (stack <= 60) openRaise = 2.2;
    else openRaise = 2.3;
    if (heroPos === "SB") openRaise += 0.4;
    if (heroPos === "BTN") openRaise -= 0.1;
    if (ante === "No") openRaise += 0.1;
  } else {
    openRaise = 2.5;
    if (heroPos === "BTN" || heroPos === "CO") openRaise = 2.3;
    if (heroPos === "SB") openRaise = 3.0;
    if (tablePreset === "High Rake") openRaise += 0.2;
    if (tablePreset === "Soft / Passive") openRaise += 0.2;
  }
  if (tablePreset === "Aggressive / 3-bet Heavy") openRaise -= 0.1;
  if (straddle) {
    // In a UTG straddle game, practical opens often reference the 2bb straddle.
    // Displayed in normal BB units: 2.0x straddle = 4bb.
    if (heroPos === "UTG Straddle") openRaise = 4.5;
    else if (heroPos === "SB" || heroPos === "BB") openRaise = 5.0;
    else openRaise = 4.0;
    if (tablePreset === "Soft / Passive") openRaise += 0.5;
    if (tablePreset === "Aggressive / 3-bet Heavy") openRaise -= 0.3;
  }
  openRaise = Math.max(2.0, Math.min(straddle ? 6.5 : 3.5, Number(openRaise.toFixed(1))));

  let threeBet = ip ? open * 3.0 : open * 3.8;
  if (straddle && open < 3.5) {
    // If user leaves open size at 2.2bb, reinterpret likely open as about 2.2x straddle.
    threeBet = ip ? (open * unit) * 3.0 : (open * unit) * 3.8;
  }
  if (multiway) threeBet += open * 0.7;
  if (cash && tablePreset === "High Rake") threeBet += 0.5;
  if (tournament && stack <= 30) threeBet = ip ? open * 2.6 : open * 3.1;
  if (stack <= 18) threeBet = Math.min(roundHalf(stack * 0.42), roundHalf(open * 2.7));
  if (stack <= 12) threeBet = stack;
  threeBet = roundHalf(threeBet);

  let fourBet = ip ? threeBet * 2.15 : threeBet * 2.35;
  if (stack <= 35) fourBet = stack;
  else fourBet = roundHalf(Math.min(fourBet, stack * 0.42));

  let jamThreshold = "No default jam";
  if (scenario === "Short Stack Open Jam") {
    if (stack <= 15) jamThreshold = "Open-jam is standard candidate for many playable hands";
    else if (stack <= 22) jamThreshold = "Open-jam selectively; prefer hands with blocker/equity";
    else jamThreshold = "Usually raise/fold or raise/call, not pure open-jam";
  } else if (scenario === "Facing 3-Bet") {
    if (stack <= 25) jamThreshold = "4-bet jam often replaces small 4-bet with premiums/blockers";
    else jamThreshold = "Use small 4-bet sizing; jam mainly premiums";
  } else if (scenario === "Facing 4-Bet" || has4bet) {
    jamThreshold = stack <= 60 ? "Continue mostly by jam/call-off with premiums" : "Deep: avoid punting non-premiums; call/5-bet jam only very strong hands";
  } else if (hasJam || scenario === "Facing Jam") {
    jamThreshold = "No raise sizing: decision is call/fold versus jam";
  }

  let sizingLine = "";
  const straddleNote = straddle ? " UTG straddle format: sizes are displayed in normal BB units; 4bb = 2x straddle." : "";
  if (scenario === "Unopened Pot / RFI") sizingLine = `Open around ${openRaise.toFixed(1)}bb.`;
  else if (scenario === "Facing Open") sizingLine = `If 3-betting vs ${open.toFixed(1)}bb open: ${threeBet}bb ${ip ? "in position" : "out of position"}. Calling range should be tighter OOP.`;
  else if (scenario === "Facing 3-Bet" || has3bet) sizingLine = fourBet >= stack ? `4-bet jam for ${stack}bb when continuing aggressively.` : `If 4-betting: about ${fourBet}bb.`;
  else if (scenario === "Facing 4-Bet" || has4bet) sizingLine = `Mostly jam/call-off or fold; non-all-in sizing is less important at ${stack}bb.`;
  else if (scenario === "Short Stack Open Jam") sizingLine = stack <= 22 ? `Jam size: ${stack}bb effective when choosing shove.` : `Prefer ${openRaise.toFixed(1)}bb open with selected hands; jam less often this deep.`;
  else if (scenario === "Facing Jam" || hasJam) sizingLine = `No raise size; compare hand equity/risk premium and decide call/fold.`;
  else if (scenario === "BB Defense") sizingLine = `Versus ${open.toFixed(1)}bb open, call playable hands; 3-bet value/bluffs around ${threeBet}bb OOP.`;

  let adjustment = [];
  if (straddle) adjustment.push("UTG straddle: treat 2bb straddle as live blind; effective stacks are shallower in straddle units");
  if (multiway) adjustment.push("multiway: add size and tighten continues");
  if (ip) adjustment.push("IP: can use slightly smaller 3-bets");
  else adjustment.push("OOP: use larger 3-bets");
  if (icmPressure >= 70) adjustment.push("high ICM: avoid marginal call-offs");
  else if (icmPressure >= 45) adjustment.push("medium ICM: tighten calls first");
  if (tablePreset === "High Rake") adjustment.push("high rake: prefer 3-bet/fold over flatting marginal offsuit hands");
  if (tablePreset === "Soft / Passive") adjustment.push("soft table: value-size larger");
  if (tablePreset === "Aggressive / 3-bet Heavy") adjustment.push("aggro table: open slightly smaller and defend stronger");

  return {
    openRaise,
    threeBet,
    fourBet,
    sizingLine: sizingLine + straddleNote,
    jamThreshold,
    ip,
    multiway,
    adjustmentText: adjustment.join(" · ")
  };
}

function PreflopAnalyzer() {
  const [format, setFormat] = useState("Tournament 8-Handed");
  const [heroPos, setHeroPos] = useState("LJ");
  const [villainPos, setVillainPos] = useState("HJ");
  const [villain1Action, setVillain1Action] = useState("Open");
  const [villain2Pos, setVillain2Pos] = useState("CO");
  const [villain2Action, setVillain2Action] = useState("None");
  const [scenario, setScenario] = useState("Unopened Pot / RFI");
  const [stackBB, setStackBB] = useState("25");
  const [villainCount, setVillainCount] = useState("1");
  const [heroHand, setHeroHand] = useState("AKs");
  const [openSizeFaced, setOpenSizeFaced] = useState("2.2");
  const [ante, setAnte] = useState("Yes");
  const [tablePreset, setTablePreset] = useState("Standard");
  const [icmPressureQuick, setIcmPressureQuick] = useState("0");

  const positions = positionsByFormat[format];
  const params = useMemo(() => ({ format, heroPos, villainPos, villain1Action, villain2Pos, villain2Action, scenario, stackBB, villainCount, tablePreset, icmPressureQuick }), [format, heroPos, villainPos, villain1Action, villain2Pos, villain2Action, scenario, stackBB, villainCount, tablePreset, icmPressureQuick]);
  const heroFreq = useMemo(() => normalizeFreqs(frequencies(heroHand, params)), [heroHand, params]);
  const sizing = useMemo(() => sizingEngine({ ...params, openSizeFaced, ante, tablePreset, icmPressure: Number(icmPressureQuick || 0) }), [params, openSizeFaced, ante, tablePreset, icmPressureQuick]);
  const confidence = useMemo(() => confidenceGrade(params), [params]);
  const reasons = useMemo(() => reasonBullets(heroHand, params, heroFreq, sizing), [heroHand, params, heroFreq, sizing]);
  const gridData = useMemo(() => {
    let total = 0; const items = [];
    for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) {
      const hand = handAt(r, c);
      const freq = normalizeFreqs(frequencies(hand, params));
      if (freq.raise + freq.call >= 35) total++;
      items.push({ hand, freq });
    }
    return { items, total };
  }, [params]);

  function changeFormat(next) {
    setFormat(next);
    const newPositions = positionsByFormat[next];
    if (!newPositions.includes(heroPos)) setHeroPos(newPositions[0]);
    if (!newPositions.includes(villainPos)) setVillainPos(newPositions[1] || newPositions[0]);
    if (!newPositions.includes(villain2Pos)) setVillain2Pos(newPositions[2] || newPositions[0]);
  }

  function nextHand() {
    const currentIndex = positions.indexOf(heroPos);
    const nextIndex = currentIndex >= 0 ? (currentIndex - 1 + positions.length) % positions.length : 0;

    // Rotate hero position backward through the table order.
    // Example: BTN -> CO -> HJ -> LJ.
    setHeroPos(positions[nextIndex]);
    setHeroHand("AKs");
    // Stack BB intentionally stays the same across positions.

    // Reset spot/context options.
    setScenario("Unopened Pot / RFI");
    setVillainCount("0");
    setVillain1Action("None");
    setVillain2Action("None");
    setOpenSizeFaced("2.2");
    setTablePreset("Standard");
    setIcmPressureQuick("0");
  }

  return (
    <>
      <section className="panel">
        <div className="field full"><label>Game</label><select value={format} onChange={e => changeFormat(e.target.value)}>{Object.keys(positionsByFormat).map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>Hero Position</label><select value={heroPos} onChange={e => setHeroPos(e.target.value)}>{positions.map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>Your Hand</label><select value={heroHand} onChange={e => setHeroHand(e.target.value)}>{allHands().map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>Scenario</label><select value={scenario} onChange={e => setScenario(e.target.value)}>{scenarios.map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>Stack BB</label><select value={stackBB} onChange={e => setStackBB(e.target.value)}>{stackOptions.map(x => <option key={x}>{x}bb</option>)}</select></div>
        <div className="field"><label>Open Size Faced</label><select value={openSizeFaced} onChange={e => setOpenSizeFaced(e.target.value)}>{openSizeOptions.map(x => <option key={x}>{x}bb</option>)}</select></div>
        <div className="field"><label>Ante?</label><select value={ante} onChange={e => setAnte(e.target.value)}>{anteOptions.map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>Table Preset</label><select value={tablePreset} onChange={e => setTablePreset(e.target.value)}>{tablePresetOptions.map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>ICM Pressure Quick</label><select value={icmPressureQuick} onChange={e => setIcmPressureQuick(e.target.value)}>{["0","25","50","75","100"].map(x => <option key={x}>{x}/100</option>)}</select></div>
        <div className="field"><label>Villains In Pot</label><select value={villainCount} onChange={e => setVillainCount(e.target.value)}>{["0","1","2","3+"].map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>Villain 1 Position</label><select value={villainPos} onChange={e => setVillainPos(e.target.value)}>{positions.map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>Villain 1 Action</label><select value={villain1Action} onChange={e => setVillain1Action(e.target.value)}>{["None","Open","Call","3-Bet","4-Bet","Jam"].map(x => <option key={x}>{x}</option>)}</select></div>
        {(villainCount === "2" || villainCount === "3+") && <><div className="field"><label>Villain 2 Position</label><select value={villain2Pos} onChange={e => setVillain2Pos(e.target.value)}>{positions.map(x => <option key={x}>{x}</option>)}</select></div><div className="field"><label>Villain 2 Action</label><select value={villain2Action} onChange={e => setVillain2Action(e.target.value)}>{["None","Open","Call","3-Bet","4-Bet","Jam"].map(x => <option key={x}>{x}</option>)}</select></div></>}
      </section>

      <section className="quickActionCard">
        <button type="button" onClick={nextHand}>Next Position →</button>
        <p>Moves hero position backward, keeps stack BB, and resets hand + spot.</p>
      </section>

      {isUtgStraddleFormat(format) && (
        <section className="straddleCard">
          <div>
            <p className="miniLabel">8-Handed Cash Straddle Mode</p>
            <h2>SB 0.5bb · BB 1bb · UTG straddle 2bb</h2>
            <p>Open sizes and 3-bet sizes are shown in normal BB units. In this format, 4bb = 2x the UTG straddle, and stacks play effectively half as deep in straddle units.</p>
          </div>
        </section>
      )}

      <section className="decisionCard">
        <div className="decisionTop">
          <div>
            <p className="miniLabel">Quick Output</p>
            <h2>{heroHand}: {heroFreq.primaryAction}</h2>
            <p>{actionExplanation(heroFreq)}</p>
          </div>
          <div className={`decisionBadge ${heroFreq.category}`}>{heroFreq.category}</div>
        </div>
        <div className="freqGrid">
          <div><span>Raise / 3-bet / Jam</span><strong>{heroFreq.raise}%</strong></div>
          <div><span>Call / Continue</span><strong>{heroFreq.call}%</strong></div>
          <div><span>Fold</span><strong>{heroFreq.fold}%</strong></div>
        </div>
        <p className="scoreLine">Model score: {heroFreq.score} · continuing range approx. {gridData.total}/169 hands</p>
      </section>

      <section className="sizingCard">
        <div className="sizingHeader">
          <div>
            <p className="miniLabel">Sizing Engine</p>
            <h2>{sizing.sizingLine}</h2>
            <p>{sizing.adjustmentText}</p>
          </div>
        </div>
        <div className="sizingGrid">
          <div><span>Open Raise</span><strong>{sizing.openRaise.toFixed(1)}bb</strong></div>
          <div><span>3-Bet Size</span><strong>{sizing.threeBet}bb</strong></div>
          <div><span>4-Bet Size</span><strong>{sizing.fourBet >= Number(stackBB) ? "Jam" : `${sizing.fourBet}bb`}</strong></div>
        </div>
        <div className="jamNote"><strong>Jam note:</strong> {sizing.jamThreshold}</div>
      </section>

      <section className="auditCard">
        <div className="auditTop">
          <div>
            <p className="miniLabel">Professional Review Layer</p>
            <h2>Confidence: {confidence.label} · {confidence.score}/100</h2>
            <p>{confidence.text}</p>
          </div>
        </div>
        <ul>
          {reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </section>

      <section className="stats">
        <div><Target size={17}/><span>{gridData.total}/169 continue candidates</span></div>
        <div><Layers size={17}/><span>{format}</span></div>
        <div><Sparkles size={17}/><span>{scenario}</span></div>
      </section>

      <section className="legend">
        <span><i className="primary"></i>Main continue</span>
        <span><i className="secondary"></i>Mixed / borderline</span>
        <span><i className="fold"></i>Fold</span>
      </section>

      <section className="gridCard">
        <div className="handGrid">
          {gridData.items.map(({ hand, freq }) => (
            <button key={hand} className={`hand ${freq.category} ${heroHand === hand ? "selected" : ""}`} onClick={() => setHeroHand(hand)}>{hand}</button>
          ))}
        </div>
      </section>
    </>
  );
}

function ICMAnalyzer() {
  const [playersLeft, setPlayersLeft] = useState("36");
  const [playersITM, setPlayersITM] = useState("31");
  const [currentPlace, setCurrentPlace] = useState("28");
  const [heroStackBB, setHeroStackBB] = useState("18");
  const [avgStackBB, setAvgStackBB] = useState("24");
  const [nextPayJumpPlace, setNextPayJumpPlace] = useState("27");
  const [nextPayJumpAmount, setNextPayJumpAmount] = useState("50");
  const [initialBuyIn, setInitialBuyIn] = useState("25");
  const [bubbleFactorInput, setBubbleFactorInput] = useState("");

  const icm = useMemo(() => icmPressureModel({ playersLeft, playersITM, heroStackBB, avgStackBB, currentPlace, nextPayJumpPlace, nextPayJumpAmount, initialBuyIn, bubbleFactorInput }), [playersLeft, playersITM, heroStackBB, avgStackBB, currentPlace, nextPayJumpPlace, nextPayJumpAmount, initialBuyIn, bubbleFactorInput]);

  return (
    <>
      <section className="icmHero">
        <div>
          <p className="miniLabel">Bubble / Pay-jump Estimator</p>
          <h2>ICM Pressure: {icm.label}</h2>
          <p>{icm.callingTightness}</p>
        </div>
        <div className="pressureRing"><span>{Math.round(icm.pressureScore)}</span><small>/100</small></div>
      </section>

      <section className="panel">
        <div className="field"><label>Players Left</label><input value={playersLeft} onChange={e => setPlayersLeft(e.target.value)} inputMode="numeric"/></div>
        <div className="field"><label>Players ITM</label><input value={playersITM} onChange={e => setPlayersITM(e.target.value)} inputMode="numeric"/></div>
        <div className="field"><label>Your Current Place</label><input value={currentPlace} onChange={e => setCurrentPlace(e.target.value)} inputMode="numeric"/></div>
        <div className="field"><label>Your Stack BB</label><input value={heroStackBB} onChange={e => setHeroStackBB(e.target.value)} inputMode="decimal"/></div>
        <div className="field"><label>Average Stack BB</label><input value={avgStackBB} onChange={e => setAvgStackBB(e.target.value)} inputMode="decimal"/></div>
        <div className="field"><label>Next Pay Jump Place</label><input value={nextPayJumpPlace} onChange={e => setNextPayJumpPlace(e.target.value)} inputMode="numeric"/></div>
        <div className="field"><label>Next Pay Jump Amount</label><input value={nextPayJumpAmount} onChange={e => setNextPayJumpAmount(e.target.value)} inputMode="decimal"/></div>
        <div className="field"><label>Initial Buy-in</label><input value={initialBuyIn} onChange={e => setInitialBuyIn(e.target.value)} inputMode="decimal"/></div>
        <div className="field full"><label>Manual Bubble Factor Optional</label><input placeholder="Optional, e.g. 1.5" value={bubbleFactorInput} onChange={e => setBubbleFactorInput(e.target.value)} inputMode="decimal"/></div>
      </section>

      <section className="icmCards">
        <div><span>Risk Premium Estimate</span><strong>+{icm.riskPremium.toFixed(1)}%</strong></div>
        <div><span>Players to Money</span><strong>{icm.toMoney}</strong></div>
        <div><span>Pay-jump Distance</span><strong>{icm.payJumpDistance}</strong></div>
        <div><span>Jump / Buy-in Multiple</span><strong>{icm.prizeMultiple.toFixed(1)}x</strong></div>
      </section>

      <section className="infoCard">
        <div className="infoTop">
          <Crown size={19}/>
          <div>
            <h2>Recommended Adjustment</h2>
            <p>{icm.firstIn}</p>
          </div>
        </div>
        <div className="sourceBox">
          <p><strong>Calling range adjustment:</strong> add roughly +{icm.callOffModifier.toFixed(1)} model points of tightness to call-off spots. This means marginal calls become folds first; premiums stay continues.</p>
        </div>
      </section>

      <section className="infoCard">
        <div className="infoTop">
          <AlertTriangle size={19}/>
          <div>
            <h2>Accuracy Limit</h2>
            <p>This is an ICM pressure estimator. Exact ICM needs every remaining stack and the full payout table. This tool is best for fast review: bubble danger, pay-jump pressure, and whether marginal calls should tighten.</p>
          </div>
        </div>
      </section>
    </>
  );
}

function App() {
  const [tab, setTab] = useState("preflop");

  return (
    <div className="app">
      <main className="container">
        <section className="hero">
          <div>
            <p className="eyebrow">Analyzer study model</p>
            <h1>Poker Decision Reference</h1>
            <p className="sub">Preflop + ICM pressure analyzer for tournament and cash-game review.</p>
          </div>
          <div className="heroIcon"><Trophy size={24}/></div>
        </section>

        <section className="warning">
          <ShieldAlert size={18}/>
          <p>Study/review reference only. Not an exact solver database. Do not use where real-time assistance is prohibited.</p>
        </section>

        <section className="tabBar">
          <button className={tab === "preflop" ? "active" : ""} onClick={() => setTab("preflop")}><Calculator size={16}/>Preflop</button>
          <button className={tab === "icm" ? "active" : ""} onClick={() => setTab("icm")}><BarChart3 size={16}/>ICM</button>
        </section>

        {tab === "preflop" ? <PreflopAnalyzer /> : <ICMAnalyzer />}

        <section className="infoCard">
          <div className="infoTop">
            <BookOpen size={19}/>
            <div>
              <h2>Model Notes</h2>
              <p>This version now rounds output to 5% buckets to avoid fake precision, shows confidence, explains key reasons, and uses position/stack/action/sizing/ICM adjustments. It is still a heuristic study model, not a node-locked solver.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
