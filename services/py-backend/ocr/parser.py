"""OCR text parser, 2D layout analyzer, RP cross-checker, and fuzzy dictionary normalizer for Pokémon Sleep."""

from __future__ import annotations

import math
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np
from pydantic import BaseModel, Field

from data_loader import DATA_LOADER


SUBSKILL_SLOTS_LEVELS: List[Tuple[str, int]] = [
    ("level10", 10),
    ("level25", 25),
    ("level50", 50),
    ("level70", 70),
    ("level80", 80),
]


class ParsedSubskill(BaseModel):
    slot: str  # level10, level25, level50, level70, level80
    level: int
    name: str  # Canonical English/ID name, e.g. "Berry Finding S"
    displayName: str  # Localized display name, e.g. "树果数量S"
    rarity: str  # gold, silver, white


class ParsedIngredient(BaseModel):
    slot: str  # slotA, slotB, slotC
    level: int  # 1, 30, 60
    name: str  # Canonical name, e.g. "Apple"
    displayName: str  # Localized display name, e.g. "特选苹果"
    amount: int
    confidence: float = 1.0


class ParsedPokemonResult(BaseModel):
    pokemon: Optional[Dict[str, Any]] = None
    nickname: Optional[str] = None
    isShiny: bool = False
    level: Optional[int] = None
    rp: Optional[int] = None
    nature: Optional[Dict[str, Any]] = None
    subskills: List[ParsedSubskill] = Field(default_factory=list)
    ingredients: List[ParsedIngredient] = Field(default_factory=list)
    carryLimit: Optional[int] = None
    mainSkillLevel: Optional[int] = None
    confidence: float = 0.0
    fieldConfidences: Dict[str, float] = Field(default_factory=dict)
    matchedFields: List[str] = Field(default_factory=list)
    rawLines: List[str] = Field(default_factory=list)


# OCR common noise words to ignore when scanning for Pokémon names
NOISE_KEYWORDS = {
    "lv", "level", "rp", "sp", "hp", "exp", "max", "box",
    "樹果", "树果", "主技能", "副技能", "食材", "性格", "等级", "等級", "持有上限", "最大持有数",
    "帮手间隔", "帮忙间隔", "幫忙間隔", "睡眠类型", "睡眠類型", "睡姿", "图鉴", "圖鑑", "研究", "营地",
    "能力详情", "能力詳情", "帮忙能力", "幫忙能力",
    "main skill", "sub skill", "nature", "ingredients", "carry limit",
    "helping frequency", "sleep type", "pokedex",
    "せいかく", "サブスキル", "メインスキル", "おてつだい", "とくちょう",
}

VARIANT_STRING_REPLACES = [
    ("悠閑", "悠閒"),
    ("悠闲", "悠闲"),
    ("固執", "固执"),
    ("大膽", "大胆"),
    ("調皮", "调皮"),
    ("勇敢", "勇敢"),
    ("淘氣", "淘气"),
    ("樂天", "乐天"),
    ("內斂", "内敛"),
    ("慢吞吞", "慢吞吞"),
    ("馬虎", "马虎"),
    ("冷靜", "冷静"),
    ("溫和", "温和"),
    ("溫順", "温顺"),
    ("慎重", "慎重"),
    ("自大", "自大"),
    ("膽小", "胆小"),
    ("急躁", "急躁"),
    ("爽朗", "爽朗"),
    ("天真", "天真"),
    ("害羞", "害羞"),
    ("勤奮", "勤奋"),
    ("坦率", "坦率"),
    ("浮躁", "浮躁"),
    ("認真", "认真"),
]

# RP ingredient growth table (levels 1-70) matching in-game & Neroli's Lab RP formula
RP_ING_GROWTH: Dict[int, float] = {
    1: 1.0, 2: 1.003, 3: 1.007, 4: 1.011, 5: 1.016, 6: 1.021, 7: 1.027, 8: 1.033, 9: 1.039, 10: 1.046,
    11: 1.053, 12: 1.061, 13: 1.069, 14: 1.077, 15: 1.085, 16: 1.094, 17: 1.104, 18: 1.114, 19: 1.124, 20: 1.134,
    21: 1.145, 22: 1.156, 23: 1.168, 24: 1.18, 25: 1.192, 26: 1.205, 27: 1.218, 28: 1.231, 29: 1.245, 30: 1.259,
    31: 1.274, 32: 1.288, 33: 1.303, 34: 1.319, 35: 1.335, 36: 1.351, 37: 1.368, 38: 1.385, 39: 1.402, 40: 1.42,
    41: 1.439, 42: 1.457, 43: 1.477, 44: 1.496, 45: 1.517, 46: 1.537, 47: 1.558, 48: 1.58, 49: 1.602, 50: 1.625,
    51: 1.648, 52: 1.671, 53: 1.696, 54: 1.72, 55: 1.745, 56: 1.771, 57: 1.798, 58: 1.824, 59: 1.852, 60: 1.88,
    61: 1.927, 62: 1.975, 63: 2.024, 64: 2.075, 65: 2.127, 66: 2.18, 67: 2.235, 68: 2.29, 69: 2.348, 70: 2.406,
}

RP_MISC_SUBSKILLS: Dict[str, float] = {
    "Dream Shard Bonus": 0.221,
    "Energy Recovery Bonus": 0.221,
    "Helping Bonus": 0.221,
    "Research EXP Bonus": 0.221,
    "Sleep EXP Bonus": 0.221,
    "Inventory Up S": 0.071,
    "Inventory Up M": 0.139,
    "Inventory Up L": 0.181,
}


def _floor_ieee(num: float, decimals: int = 0) -> float:
    factor = 10 ** decimals
    shifted = num * factor
    rounded = round(shifted) if abs(shifted - round(shifted)) < 1e-10 else shifted
    return math.floor(rounded) / factor


def calculate_exact_rp_python(
    pokemon: Dict[str, Any],
    level: int,
    skill_level: int,
    nature: Optional[Dict[str, Any]],
    subskills: List[ParsedSubskill],
    unlocked_ingredients: List[Dict[str, Any]],
) -> int:
    """Exact in-game RP formula used to cross-check & deduce off-screen ingredient slots from visible SP."""
    lvl = max(1, min(70, level))
    active_names = {s.name for s in subskills if s.level <= lvl}

    level_factor = 1.0 - 0.002 * (lvl - 1)
    nat_pos = nature.get("positiveModifier") if nature else None
    nat_neg = nature.get("negativeModifier") if nature else None
    nat_freq = 0.9 if nat_pos == "speed" else (1.075 if nat_neg == "speed" else 1.0)

    help_m = 0.14 if "Helping Speed M" in active_names else 0.0
    help_s = 0.07 if "Helping Speed S" in active_names else 0.0
    help_sub = max(0.65, round(1.0 - help_m - help_s, 2))

    help_factor = 5.0 * _floor_ieee(
        3600.0 / (pokemon["frequency"] * _floor_ieee(level_factor * nat_freq * help_sub, 4)),
        2,
    )

    ing_m = 0.36 if "Ingredient Finder M" in active_names else 0.0
    ing_s = 0.18 if "Ingredient Finder S" in active_names else 0.0
    nat_ing = (nature.get("modifiers", {}).get("ingredient", 1.0)) if nature else 1.0
    ing_chance = _floor_ieee((pokemon["ingredientPercentage"] / 100.0) * nat_ing * round(1.0 + ing_m + ing_s, 2), 4)

    trig_m = 0.36 if "Skill Trigger M" in active_names else 0.0
    trig_s = 0.18 if "Skill Trigger S" in active_names else 0.0
    nat_skill = (nature.get("modifiers", {}).get("skill", 1.0)) if nature else 1.0
    skill_chance = _floor_ieee((pokemon["skillPercentage"] / 100.0) * nat_skill * round(1.0 + trig_m + trig_s, 2), 4)

    ing_growth = RP_ING_GROWTH.get(lvl, 1.0)
    total_ing_val = 0
    for slot in unlocked_ingredients:
        ing_obj = DATA_LOADER.get_ingredient(slot["ingredient"])
        val = ing_obj["value"] if ing_obj else 100
        total_ing_val += slot["amount"] * val
    ing_value = math.floor(total_ing_val / max(1, len(unlocked_ingredients)))
    ing_factor = _floor_ieee(help_factor * ing_chance * ing_value * ing_growth, 2)

    is_berry = pokemon.get("specialty") in ("berry", "all")
    berries_per_drop = (2 if is_berry else 1) + (1 if "Berry Finding S" in active_names else 0)
    berry_name = pokemon.get("berry", "GREPA")
    berry_val_base = 25
    for b in DATA_LOADER.raw_data.get("berries", []):
        if b["name"].upper() == berry_name.upper():
            berry_val_base = b["value"]
            break
    berry_val = berries_per_drop * max(
        berry_val_base + lvl - 1,
        int(math.floor(0.5 + (1.025 ** (lvl - 1)) * berry_val_base)),
    )
    berry_factor = _floor_ieee(help_factor * (1.0 - ing_chance) * berry_val, 2)

    rp_table = pokemon.get("skill", {}).get("RP", [400])
    s_lvl = max(1, min(skill_level, len(rp_table)))
    skill_rp_val = rp_table[s_lvl - 1]
    skill_factor = _floor_ieee(help_factor * skill_chance * skill_rp_val, 2)

    nat_energy = (nature.get("modifiers", {}).get("energy", 1.0)) if nature else 1.0
    conv_energy = 0.92 if nat_energy < 1 else (1.08 if nat_energy > 1 else 1.0)
    sub_misc = 1.0 + sum(RP_MISC_SUBSKILLS.get(n, 0.0) for n in active_names)
    misc_factor = _floor_ieee(conv_energy * sub_misc, 2)

    return int(math.floor(0.5 + misc_factor * (ing_factor + berry_factor + skill_factor)))


def clean_text_line(line: str) -> str:
    """Normalize line whitespace, NFKC width, and common OCR CJK glyph variants."""
    line = unicodedata.normalize("NFKC", line).strip()
    line = line.replace("閑", "閒")
    line = re.sub(r"[\|•·\t\r]+", " ", line)
    return line.strip()


def _group_boxes_into_rows(boxes: List[Dict[str, Any]]) -> List[str]:
    """Merge horizontally aligned OCR boxes (e.g. '持有上限' + '33個', '樹果遽增' + 'Lv.3', 'SP' + '2,119')."""
    if not boxes:
        return []
    items = []
    for b in boxes:
        coords = b.get("box", [])
        txt = clean_text_line(str(b.get("text", "")))
        if not coords or not txt:
            continue
        xs = [p[0] for p in coords]
        ys = [p[1] for p in coords]
        cy = 0.5 * (min(ys) + max(ys))
        h = max(1.0, max(ys) - min(ys))
        items.append({"x": min(xs), "cy": cy, "h": h, "text": txt})

    items.sort(key=lambda d: (d["cy"], d["x"]))
    rows: List[List[Dict[str, Any]]] = []
    for it in items:
        placed = False
        for row in rows:
            avg_cy = sum(r["cy"] for r in row) / len(row)
            avg_h = sum(r["h"] for r in row) / len(row)
            if abs(it["cy"] - avg_cy) <= max(18.0, 0.65 * avg_h):
                row.append(it)
                placed = True
                break
        if not placed:
            rows.append([it])

    merged = []
    for row in rows:
        row.sort(key=lambda r: r["x"])
        merged.append(" ".join(r["text"] for r in row))
    return merged


def extract_level(lines: List[str], row_lines: Optional[List[str]] = None) -> Optional[int]:
    """Extract Pokémon level from header lines (1-70), ignoring subskill badge levels & main skill Lv."""
    subskill_lv_set = {10, 25, 50, 70, 75, 80, 100}
    search_pool = (row_lines or []) + lines

    # Priority 1: Header line containing both Lv.XX and a Pokémon name or near top before 主技能
    level_patterns = [
        re.compile(r"(?:lv|1v|等級|等级|レベル)[\.:\s]*(\d{1,2})(?!\d)", re.IGNORECASE),
        re.compile(r"(?<!\d)(\d{1,2})\s*(?:级|級|lv)(?!\d)", re.IGNORECASE),
    ]

    for idx, line in enumerate(search_pool):
        if any(k in line for k in ("主技能", "メインスキル", "遽增", "邃增", "填充", "療癒", "疗愈", "獲取", "获取", "強化", "强化", "支援", "鼓舞", "揮指", "挥指")):
            continue
        # Skip ingredient unlock milestone previews e.g. "sP 1,136 Lv.30 LV.60" or "Lv.30 LV.60"
        if re.search(r"(?i)lv\.?\s*30.*lv\.?\s*60", line) or re.search(r"(?i)lv\.?\s*60.*lv\.?\s*30", line):
            continue
        for pat in level_patterns:
            m = pat.search(line)
            if m:
                lvl = int(m.group(1))
                if 1 <= lvl <= 70:
                    rest = pat.sub("", line).strip()
                    # Skip subskill unlock header rows like "Lv.50 Lv.70" or "Lv.80"
                    if lvl in subskill_lv_set and idx > 3 and (not rest or re.fullmatch(r"(?i)(?:lv\.?\s*\d+\s*)+", line.strip())):
                        continue
                    return lvl

    for i, line in enumerate(lines[:6]):
        if re.fullmatch(r"(?i)lv\.?", line.strip()) and i + 1 < len(lines):
            nxt = lines[i + 1].strip()
            if nxt.isdigit() and 1 <= int(nxt) <= 70:
                return int(nxt)

    return None


def extract_rp(lines: List[str], row_lines: Optional[List[str]] = None) -> Optional[int]:
    """Extract SP / RP integer e.g. 'SP 2,119' or 'RP 3450'."""
    pat = re.compile(r"\b(?:sp|rp)[\s:：]*([0-9][0-9,]{2,6})\b", re.IGNORECASE)
    for line in (row_lines or []) + lines:
        m = pat.search(line)
        if m:
            val_str = m.group(1).replace(",", "").strip()
            if val_str.isdigit():
                val = int(val_str)
                if 100 <= val <= 20000:
                    return val
    return None


def _identify_stat_modifier_trait(text: str) -> Optional[str]:
    t = text.lower()
    if any(k in t for k in ("幫忙速度", "帮忙速度", "speed of help", "おてつだいスピード")):
        return "speed"
    if any(k in t for k in ("活力回復", "活力回复", "energy recovery", "げんき回復")):
        return "energy"
    if any(k in t for k in ("食材發現", "食材发现", "ingredient finding", "食材おてつだい")):
        return "ingredient"
    if any(k in t for k in ("主技能發動", "主技能发动", "main skill chance", "メインスキル発生")):
        return "skill"
    if any(k in t for k in ("exp獲得", "exp获得", "exp gains", "exp獲得量", "exp")):
        return "exp"
    return None


def extract_nature(lines: List[str], row_lines: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
    """Extract Pokémon nature using keyword lookup, CJK variant normalization, and ▲▲/▼▼ stat modifier cross-check."""
    all_lines = (row_lines or []) + lines

    def lookup_nat(cand: str) -> Optional[Dict[str, Any]]:
        c = cand.replace("的", "").replace("性格", "").strip()
        if not c:
            return None
        for src, dst in VARIANT_STRING_REPLACES:
            if c == src:
                nat = DATA_LOADER.get_nature(dst)
                if nat:
                    return nat
        return DATA_LOADER.get_nature(c)

    # Pattern 1: Explicit "性格 悠閒" / "Nature: Adamant"
    nature_line_pat = re.compile(r"(?:性格|nature|せいかく)[\s:：]+([^\s,，。]+)", re.IGNORECASE)
    for line in all_lines:
        m = nature_line_pat.search(line)
        if m:
            nat = lookup_nat(m.group(1))
            if nat:
                return nat

    # Pattern 2: Standalone "性格" line followed immediately by nature name
    for i, line in enumerate(lines):
        if line.strip() in ("性格", "せいかく", "Nature") and i + 1 < len(lines):
            nat = lookup_nat(lines[i + 1].strip())
            if nat:
                return nat

    # Pattern 3: "...的性格"
    suffix_pat = re.compile(r"([^\s:：]{2,4})的性格")
    for line in all_lines:
        m = suffix_pat.search(line)
        if m:
            nat = lookup_nat(m.group(1))
            if nat:
                return nat

    # Pattern 4: Exact token match against all 25 natures (zh-CN, zh-TW, ja, en)
    for line in lines:
        for token in re.split(r"[\s,:：/]+", line):
            t = token.strip()
            if len(t) >= 2:
                nat = lookup_nat(t)
                if nat:
                    trans = nat.get("translations", {})
                    exact_set = {
                        nat["name"],
                        trans.get("zh-CN", ""),
                        trans.get("zh-TW", ""),
                        trans.get("ja", ""),
                        trans.get("en", ""),
                    }
                    if t in exact_set or any(t == src for src, _ in VARIANT_STRING_REPLACES):
                        return nat

    # Pattern 5: Deduce from ▲▲ (up) and ▼▼ (down) stat lines at bottom of screenshot!
    pos_trait = None
    neg_trait = None
    for idx, line in enumerate(all_lines):
        trait = _identify_stat_modifier_trait(line)
        if not trait:
            continue
        if any(sym in line for sym in ("▲", "△", "↑", "+")):
            pos_trait = trait
        elif any(sym in line for sym in ("▼", "▽", "↓", "-")):
            neg_trait = trait
        elif pos_trait is None:
            pos_trait = trait
        elif neg_trait is None and trait != pos_trait:
            neg_trait = trait

    if pos_trait and neg_trait and pos_trait != neg_trait:
        for n in DATA_LOADER.raw_data.get("natures", []):
            if n.get("positiveModifier") == pos_trait and n.get("negativeModifier") == neg_trait:
                return n

    return None


def extract_pokemon_species(lines: List[str], row_lines: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
    """Extract Pokémon species name from lines or row_lines."""
    best_candidate: Optional[Dict[str, Any]] = None
    best_score = 0.0

    search_pool = (row_lines or []) + lines
    for idx, line in enumerate(search_pool[:18]):
        clean = line.strip()
        if not clean or len(clean) < 2:
            continue

        lower = clean.lower()
        if any(noise in lower for noise in NOISE_KEYWORDS):
            clean = re.sub(r"(?i)(?:lv|1v|等级|等級|レベル)[\.:\s]*\d{1,2}", "", clean).strip()
            if not clean or any(noise in clean.lower() for noise in NOISE_KEYWORDS):
                continue

        # Exact or normalized match check first!
        direct = DATA_LOADER.get_pokemon(clean)
        if direct:
            score = 120.0 - (idx * 2)
            if score > best_score:
                best_score = score
                best_candidate = direct
                continue

        # Token check
        tokens = re.split(r"[\s\(\)\[\]（）]+", clean)
        for token in tokens:
            t = token.strip()
            # Strip embedded Lv prefix like "LV.20扁鷄頭頭" -> "扁鷄頭頭"
            t = re.sub(r"(?i)(?:lv|1v|等级|等級|レベル)[\.:\s]*\d{1,2}", "", t).strip()
            if len(t) >= 2:
                pkmn = DATA_LOADER.get_pokemon(t)
                if pkmn:
                    score = 110.0 - (idx * 2)
                    if score > best_score:
                        best_score = score
                        best_candidate = pkmn

    return best_candidate


def _match_subskill_fuzzy_or_partial(text: str, in_subskill_grid: bool = False) -> Optional[Dict[str, Any]]:
    """
    Match subskill name, tolerating RapidOCR GB2312 dropped Traditional glyphs on locked pills:
      - '幫手獎勵' -> '手' (unique across all 17 subskills inside the subskill grid!)
      - '幫忙速度S/M' -> '忙速度S/M'
      - '睡眠EXP獎勵' -> '睡眠EXP', '研究EXP獎勵' -> '研究EXP', '夢之碎片獎勵' -> '之碎片'
    """
    clean = re.sub(r"(?i)(?:lv|1v|等级|等級|レベル)[\.:\s]*\d{1,3}", "", text).strip()
    clean = re.sub(r"^[:：\-\s🔒]+", "", clean).strip()
    if not clean:
        return None

    # Descriptions with sentence-ending punctuation or commas are never subskill names
    if any(p in clean for p in ("。", "，", "！", "!", "?", "？", "：", "...", "…")):
        return None

    # Never match UI headers or labels as subskills!
    UI_BLACKLIST = (
        "樹果", "树果", "持有上限", "最大持有数", "主技能", "副技能", "食材",
        "幫忙間隔", "帮忙间隔", "能力詳情", "能力详情", "性格", "せいかく",
        "相遇的日子", "相遇的營地", "睡覺的時間", "睡觉的时间", "返回",
    )
    if clean in UI_BLACKLIST or any(clean.startswith(b) for b in ("相遇", "睡覺", "睡觉")):
        return None

    # Never match nature stat modifier lines as subskills!
    if any(k in clean for k in ("回復量", "回复量", "獲得量", "获得量", "發現率", "发现率", "發動率", "发动率", "無性格", "无性格")):
        return None

    if in_subskill_grid:
        if clean in ("手", "幫手", "帮手"):
            return DATA_LOADER.get_subskill("Helping Bonus")
        if "睡眠EXP" in clean.upper():
            return DATA_LOADER.get_subskill("Sleep EXP Bonus")
        if "研究EXP" in clean.upper():
            return DATA_LOADER.get_subskill("Research EXP Bonus")
        if "之碎片" in clean:
            return DATA_LOADER.get_subskill("Dream Shard Bonus")
        if clean.startswith("活力回"):
            return DATA_LOADER.get_subskill("Energy Recovery Bonus")

    if len(clean) < 2:
        return None

    sub = DATA_LOADER.get_subskill(clean)
    if sub:
        return sub

    # Suffix match for faded 1-char clipped CJK subskill names (>= 3 chars remaining, e.g. '忙速度S', '手獎勵')
    if len(clean) >= 3:
        cl = clean.lower()
        for s in DATA_LOADER.raw_data.get("subskills", []):
            for trans in s.get("translations", {}).values():
                if trans and len(trans) >= 4 and trans.lower().endswith(cl):
                    return s
    return None


def extract_subskills_2d(
    boxes: List[Dict[str, Any]],
    image_size: Tuple[int, int],
) -> Optional[List[ParsedSubskill]]:
    """
    Extract subskills using Pokémon Sleep's 2D 3x2 grid layout above '能力詳情'/'性格':
      (row 0, col 0) -> level10   (row 0, col 1) -> level25
      (row 1, col 0) -> level50   (row 1, col 1) -> level70
      (row 2, col 0) -> level80
    """
    if not boxes or image_size[0] <= 0:
        return None

    img_w, img_h = image_size
    y_top = 0.0
    y_bottom = float(img_h)
    badge_lv50_y: Optional[float] = None

    for b in boxes:
        txt = clean_text_line(str(b.get("text", "")))
        ys = [p[1] for p in b["box"]]
        cy = 0.5 * (min(ys) + max(ys))
        if any(k in txt for k in ("副技能", "サブスキル", "Sub Skills", "Subskill")):
            if "主技能" not in txt:
                y_top = cy
        elif re.fullmatch(r"(?i)lv\.?\s*(?:25|50|70|80)", txt) and badge_lv50_y is None:
            badge_lv50_y = min(ys)
        elif any(k in txt for k in ("能力詳情", "能力详情", "能力情", "性格", "せいかく")) and cy > img_h * 0.35:
            y_bottom = min(y_bottom, min(ys))

    if y_top <= 0.0 and badge_lv50_y is not None:
        # Row 0 (Lv.10 / Lv.25) sits ~100-140px (~img_h * 0.07) above the Lv.50 badge in a 3x2 grid
        y_top = max(0.0, badge_lv50_y - img_h * 0.08)

    if y_top <= 0.0:
        return None

    candidates = []
    for b in boxes:
        xs = [p[0] for p in b["box"]]
        ys = [p[1] for p in b["box"]]
        cy = 0.5 * (min(ys) + max(ys))
        cx = 0.5 * (min(xs) + max(xs))
        if cy <= y_top or cy >= y_bottom - 5:
            continue
        txt = clean_text_line(str(b.get("text", "")))
        sub = _match_subskill_fuzzy_or_partial(txt, in_subskill_grid=True)
        if sub:
            col = 0 if cx < (img_w * 0.5) else 1
            candidates.append({"cy": cy, "cx": cx, "col": col, "sub": sub, "h": max(1.0, max(ys) - min(ys))})

    if not candidates:
        return None

    # Cluster candidate y-centers into up to 3 grid rows
    candidates.sort(key=lambda c: c["cy"])
    row_centers: List[float] = []
    for c in candidates:
        matched_r = None
        for r_idx, rc in enumerate(row_centers):
            if abs(c["cy"] - rc) <= max(45.0, 1.8 * c["h"]):
                matched_r = r_idx
                break
        if matched_r is None:
            row_centers.append(c["cy"])
            c["row"] = len(row_centers) - 1
        else:
            c["row"] = matched_r

    grid_slot_map = {
        (0, 0): ("level10", 10),
        (0, 1): ("level25", 25),
        (1, 0): ("level50", 50),
        (1, 1): ("level70", 70),
        (2, 0): ("level80", 80),
    }

    found_by_slot: Dict[str, ParsedSubskill] = {}
    used_names = set()
    for c in candidates:
        key_pair = (c["row"], c["col"])
        if key_pair in grid_slot_map:
            slot_key, slot_lvl = grid_slot_map[key_pair]
            sub = c["sub"]
            if slot_key not in found_by_slot and sub["name"] not in used_names:
                used_names.add(sub["name"])
                found_by_slot[slot_key] = ParsedSubskill(
                    slot=slot_key,
                    level=slot_lvl,
                    name=sub["name"],
                    displayName=sub.get("translations", {}).get("zh-CN", sub["name"]),
                    rarity=sub.get("rarity", "white"),
                )

    res = [found_by_slot[sk] for sk, _ in SUBSKILL_SLOTS_LEVELS if sk in found_by_slot]
    return res if res else None


def extract_subskills(
    lines: List[str],
    boxes: Optional[List[Dict[str, Any]]] = None,
    image_size: Optional[Tuple[int, int]] = None,
) -> List[ParsedSubskill]:
    """Extract up to 5 subskills associated with Lv10, Lv25, Lv50, Lv70, Lv80."""
    found_by_slot: Dict[str, ParsedSubskill] = {}
    found_unordered: List[Dict[str, Any]] = []

    # 1. Seed found_by_slot with 2D spatial grid extractions if available
    if boxes and image_size:
        res_2d = extract_subskills_2d(boxes, image_size)
        if res_2d:
            for s in res_2d:
                found_by_slot[s.slot] = s

    # If all 5 slots are already confidently filled by 2D grid, return immediately
    if len(found_by_slot) == 5:
        return [found_by_slot[sk] for sk, _ in SUBSKILL_SLOTS_LEVELS if sk in found_by_slot]

    def norm_slot_lvl(raw_lvl: int) -> int:
        if raw_lvl == 75:
            return 70
        if raw_lvl == 100:
            return 80
        return raw_lvl

    lv_subskill_pat = re.compile(
        r"(?:lv|1v|等級|等级|レベル)[\.:\s]*(10|25|50|70|75|80|100)\s*[:：\s-]?\s*(.+)",
        re.IGNORECASE,
    )

    # Stop scanning lines once we enter the Nature / Capability Details section
    effective_lines: List[str] = []
    for line in lines:
        if line.strip() in ("能力詳情", "能力详情"):
            break
        effective_lines.append(line)

    used_subskill_names = {s.name for s in found_by_slot.values()}

    for i, line in enumerate(effective_lines):
        m = lv_subskill_pat.search(line)
        if m:
            lvl_val = norm_slot_lvl(int(m.group(1)))
            cand_name = m.group(2).strip()
            sub = _match_subskill_fuzzy_or_partial(cand_name)
            if sub and sub["name"] not in used_subskill_names:
                slot_key = f"level{lvl_val}"
                if slot_key not in found_by_slot:
                    used_subskill_names.add(sub["name"])
                    found_by_slot[slot_key] = ParsedSubskill(
                        slot=slot_key,
                        level=lvl_val,
                        name=sub["name"],
                        displayName=sub.get("translations", {}).get("zh-CN", sub["name"]),
                        rarity=sub.get("rarity", "white"),
                    )
                continue

        # Only use adjacent line fallback if 2D spatial extraction was NOT available
        if not (boxes and image_size):
            m_just_lv = re.fullmatch(
                r"(?i)(?:lv|1v|等级|等級|🔒lv)[\.:\s]*(10|25|50|70|75|80|100)",
                line.strip(),
            )
            if m_just_lv and i + 1 < len(effective_lines):
                lvl_val = norm_slot_lvl(int(m_just_lv.group(1)))
                cand_name = effective_lines[i + 1].strip()
                sub = _match_subskill_fuzzy_or_partial(cand_name)
                if sub and sub["name"] not in used_subskill_names:
                    slot_key = f"level{lvl_val}"
                    if slot_key not in found_by_slot:
                        used_subskill_names.add(sub["name"])
                        found_by_slot[slot_key] = ParsedSubskill(
                            slot=slot_key,
                            level=lvl_val,
                            name=sub["name"],
                            displayName=sub.get("translations", {}).get("zh-CN", sub["name"]),
                            rarity=sub.get("rarity", "white"),
                        )

    for line in effective_lines:
        sub = _match_subskill_fuzzy_or_partial(line)
        if sub and sub["name"] not in used_subskill_names:
            already_have = any(
                p.name == sub["name"] for p in found_by_slot.values()
            ) or any(s["name"] == sub["name"] for s in found_unordered)
            if not already_have:
                found_unordered.append(sub)

    for slot_key, lvl in SUBSKILL_SLOTS_LEVELS:
        if slot_key not in found_by_slot and found_unordered:
            sub = found_unordered.pop(0)
            if sub["name"] not in used_subskill_names:
                used_subskill_names.add(sub["name"])
                found_by_slot[slot_key] = ParsedSubskill(
                    slot=slot_key,
                    level=lvl,
                    name=sub["name"],
                    displayName=sub.get("translations", {}).get("zh-CN", sub["name"]),
                    rarity=sub.get("rarity", "white"),
                )

    return [found_by_slot[sk] for sk, _ in SUBSKILL_SLOTS_LEVELS if sk in found_by_slot]


def extract_ingredients(
    lines: List[str],
    pokemon: Optional[Dict[str, Any]],
    level: Optional[int] = None,
    rp: Optional[int] = None,
    nature: Optional[Dict[str, Any]] = None,
    subskills: Optional[List[ParsedSubskill]] = None,
    main_skill_level: Optional[int] = None,
) -> List[ParsedIngredient]:
    """
    Extract ingredient slots (Lv1, Lv30, Lv60).
    When ingredients are off-screen (e.g. scrolled down to subskills/nature) and SP/RP is visible,
    uses exact in-game RP cross-checking to deduce the unlocked ingredient combination!
    """
    results: List[ParsedIngredient] = []

    slots = [
        ("slotA", 1, pokemon.get("ingredient0", []) if pokemon else []),
        ("slotB", 30, pokemon.get("ingredient30", []) if pokemon else []),
        ("slotC", 60, pokemon.get("ingredient60", []) if pokemon else []),
    ]

    ing_pat = re.compile(r"([^\d\s\+x]+)\s*[\*xX×\+:\s]*(\d{1,2})?")
    detected_ings: List[Dict[str, Any]] = []

    for line in lines:
        clean = line.strip()
        # Avoid matching pokemon name, subskills, or nature lines as ingredients
        if any(k in clean for k in ("機率", "几率", "速度", "獎勵", "奖励", "上限", "回復", "回复", "遽增", "填充")):
            continue
        m = ing_pat.search(clean)
        if m:
            cand = m.group(1).strip()
            amt_str = m.group(2)
            # Require exact dictionary hit when no explicit multiplier count is present
            if amt_str:
                ing = DATA_LOADER.get_ingredient(cand)
            else:
                ing = DATA_LOADER.ingredient_map.get(cand.lower())
            if ing:
                detected_ings.append({
                    "ing": ing,
                    "amount": int(amt_str) if amt_str else None,
                })

    # 1. Try matching candidate ingredient amounts via visible multiplier counts (e.g. 'x2 x3 x5')
    multiplier_counts: List[int] = []
    for l in lines:
        for m in re.finditer(r"(?:[xX×]\s*(\d{1,2})|(\d{1,2})\s*個)", l):
            cnt = int(m.group(1) or m.group(2))
            if cnt <= 9:
                multiplier_counts.append(cnt)

    inferred_combo: Optional[Tuple[Dict[str, Any], ...]] = None
    if multiplier_counts and pokemon and not detected_ings:
        slots_data = [
            pokemon.get("ingredient0", []),
            pokemon.get("ingredient30", []),
            pokemon.get("ingredient60", []),
        ]
        matched_from_counts = []
        for s_cands, cnt in zip(slots_data, multiplier_counts):
            hit = next((c for c in s_cands if c.get("amount") == cnt and c.get("ingredient") != "Locked"), None)
            if hit:
                matched_from_counts.append(hit)
            else:
                break
        if len(matched_from_counts) >= 2:
            inferred_combo = tuple(matched_from_counts)

    # 2. If no ingredients were matched from text/multipliers AND we have SP/RP + pokemon + level + nature, deduce from RP!
    if not detected_ings and not inferred_combo and pokemon and level and rp and nature:
        s0_list = [c for c in pokemon.get("ingredient0", []) if c["ingredient"] != "Locked"]
        s30_list = [c for c in pokemon.get("ingredient30", []) if c["ingredient"] != "Locked"]
        s60_list = [c for c in pokemon.get("ingredient60", []) if c["ingredient"] != "Locked"]
        eff_skill_lvl = main_skill_level or (1 + int(pokemon.get("previousEvolutions", 0)))

        candidate_sets: List[Tuple[Dict[str, Any], ...]] = []
        if level < 30 or not s30_list:
            if s0_list:
                candidate_sets = [(s0_list[0],)]
        elif level < 60 or not s60_list:
            for c30 in s30_list:
                candidate_sets.append((s0_list[0], c30))
        else:
            for c30 in s30_list:
                for c60 in s60_list:
                    candidate_sets.append((s0_list[0], c30, c60))

        best_diff = 999999
        for cset in candidate_sets:
            calc_rp = calculate_exact_rp_python(
                pokemon=pokemon,
                level=level,
                skill_level=eff_skill_lvl,
                nature=nature,
                subskills=subskills or [],
                unlocked_ingredients=list(cset),
            )
            diff = abs(calc_rp - rp)
            if diff < best_diff and diff <= 3:
                best_diff = diff
                inferred_combo = cset

    for idx, (slot_key, lvl, candidates) in enumerate(slots):
        valid_cands = [c for c in candidates if c["ingredient"] != "Locked"]
        if inferred_combo and idx < len(inferred_combo):
            cand = inferred_combo[idx]
            ing_data = DATA_LOADER.get_ingredient(cand["ingredient"])
            results.append(
                ParsedIngredient(
                    slot=slot_key,
                    level=lvl,
                    name=cand["ingredient"],
                    displayName=(
                        ing_data.get("translations", {}).get("zh-CN", cand["ingredient"])
                        if ing_data
                        else cand["ingredient"]
                    ),
                    amount=cand["amount"],
                )
            )
            continue

        assigned = False
        if valid_cands:
            for det in list(detected_ings):
                det_name = det["ing"]["name"]
                for cand in valid_cands:
                    if cand["ingredient"].lower() == det_name.lower():
                        results.append(
                            ParsedIngredient(
                                slot=slot_key,
                                level=lvl,
                                name=cand["ingredient"],
                                displayName=det["ing"].get("translations", {}).get("zh-CN", cand["ingredient"]),
                                amount=cand["amount"],
                            )
                        )
                        detected_ings.remove(det)
                        assigned = True
                        break
                if assigned:
                    break

            if not assigned and slot_key == "slotA" and len(valid_cands) == 1:
                cand = valid_cands[0]
                ing_data = DATA_LOADER.get_ingredient(cand["ingredient"])
                results.append(
                    ParsedIngredient(
                        slot=slot_key,
                        level=lvl,
                        name=cand["ingredient"],
                        displayName=(
                            ing_data.get("translations", {}).get("zh-CN", cand["ingredient"])
                            if ing_data
                            else cand["ingredient"]
                        ),
                        amount=cand["amount"],
                    )
                )
        elif detected_ings:
            det = detected_ings.pop(0)
            results.append(
                ParsedIngredient(
                    slot=slot_key,
                    level=lvl,
                    name=det["ing"]["name"],
                    displayName=det["ing"].get("translations", {}).get("zh-CN", det["ing"]["name"]),
                    amount=det["amount"] or 1,
                )
            )

    return results


def extract_carry_limit(lines: List[str], row_lines: Optional[List[str]] = None) -> Optional[int]:
    """Extract carry limit / inventory size e.g. '持有上限 33個'."""
    pat = re.compile(
        r"(?:持有上限|最大持有数|最大所持数|carry\s*limit|inventory)[\s:：]*(\d{1,3})",
        re.IGNORECASE,
    )
    for line in (row_lines or []) + lines:
        m = pat.search(line)
        if m:
            return int(m.group(1))
    return None


def extract_main_skill_level(lines: List[str], row_lines: Optional[List[str]] = None) -> Optional[int]:
    """Extract main skill level e.g. '主技能 Lv.3' or '樹果遽增 Lv.3'."""
    pat_header = re.compile(
        r"(?:主技能|メインスキル|main\s*skill).*?(?:lv|1v|等级|等級)[\.:\s]*(\d)",
        re.IGNORECASE,
    )
    all_pool = (row_lines or []) + lines
    for line in all_pool:
        m = pat_header.search(line)
        if m:
            return int(m.group(1))

    # Also check any known mainskill name (exact or fuzzy >= 0.7) paired horizontally with Lv.X (1..8)
    lv_single = re.compile(r"(?:lv|1v)[\.:\s]*([1-8])(?!\d)", re.IGNORECASE)
    mainskill_names = []
    for p in DATA_LOADER.raw_data.get("pokemon", []):
        sk = p.get("skill", {})
        if sk.get("name"):
            mainskill_names.append(sk["name"])
        for tr in sk.get("translations", {}).values():
            if tr:
                mainskill_names.append(tr)

    for line in row_lines or []:
        m = lv_single.search(line)
        if m:
            prefix = line[: m.start()].strip()
            if len(prefix) >= 2 and prefix not in ("SP", "RP"):
                # Make sure prefix isn't the Pokémon species header line
                if not DATA_LOADER.pokemon_map.get(prefix.lower()):
                    return int(m.group(1))

    for line in all_pool:
        m = lv_single.search(line)
        if m and any(ms and ms in line for ms in mainskill_names):
            return int(m.group(1))

    return None


def get_evolution_family(pokemon_name: str) -> List[Dict[str, Any]]:
    """Return the full evolution family (root down to all branching leaves) for a given Pokémon name."""
    root = pokemon_name.upper()
    visited = set()
    curr = DATA_LOADER.get_pokemon(root)
    while curr and curr.get("evolvesFrom"):
        prev = DATA_LOADER.get_pokemon(curr["evolvesFrom"])
        if not prev or prev["name"] in visited:
            break
        visited.add(prev["name"])
        curr = prev

    family = []
    queue = [curr["name"] if curr else root]
    seen = set()
    while queue:
        p_name = queue.pop(0)
        if p_name in seen:
            continue
        seen.add(p_name)
        pk = DATA_LOADER.get_pokemon(p_name)
        if pk:
            family.append(pk)
            for child in pk.get("evolvesInto", []):
                if child not in seen:
                    queue.append(child)
    return family


def disambiguate_pokemon_by_rp_and_stats(
    pokemon: Optional[Dict[str, Any]],
    rp: Optional[int],
    level: Optional[int],
    nature: Optional[Dict[str, Any]],
    subskills: Optional[List[ParsedSubskill]],
    main_skill_level: Optional[int] = None,
    carry_limit: Optional[int] = None,
    ingredients: Optional[List[ParsedIngredient]] = None,
    raw_name_cand: Optional[str] = None,
    lines: Optional[List[str]] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Disambiguate Pokémon species within its evolution family using exact RP, level, nature,
    subskills, carry limit, and main skill level. When a player gives a Pokémon a custom
    nickname (e.g. naming an evolved Wigglytuff '宝宝丁99' or '胖丁99'), OCR only sees the nickname
    and mistakes it for the pre-evolution. This function uses mathematically exact RP matching to:
      1. Determine the true evolved form (e.g. Wigglytuff with RP=4522 diff=0 vs Igglybuff diff=2243).
      2. Recover the player's custom nickname (e.g. '宝宝丁99') without losing it.
    """
    if not pokemon or not rp or not level or not nature:
        return pokemon, None

    pk_full = DATA_LOADER.get_pokemon(pokemon["name"]) or pokemon
    family = get_evolution_family(pk_full["name"])
    if len(family) <= 1:
        return pk_full, None

    unlocked_ings = []
    if ingredients:
        for ing in ingredients:
            ing_lvl = getattr(ing, "level", 1)
            if ing_lvl <= level:
                unlocked_ings.append({
                    "ingredient": getattr(ing, "name", ""),
                    "amount": getattr(ing, "amount", 1),
                })

    scored_candidates = []
    for pk in family:
        max_sl = pk["skill"]["maxLevel"]
        if main_skill_level and 1 <= main_skill_level <= max_sl:
            sl_list = [main_skill_level]
        else:
            base_sl = 1 + int(pk.get("previousEvolutions", 0))
            sl_list = list(range(base_sl, max_sl + 1))

        # Carry limit feasibility:
        carry_pen = 0
        if carry_limit:
            base_carry = pk["carrySize"] + (5 * int(pk.get("previousEvolutions", 0)))
            # Max possible carry: base_carry + ribbon(6) + Inventory subskills(up to 42)
            if carry_limit < base_carry - 2 or carry_limit > base_carry + 45:
                carry_pen = 50000

        best_diff = 999999
        for sl in sl_list:
            try:
                calc_rp = calculate_exact_rp_python(
                    pokemon=pk,
                    level=level,
                    skill_level=sl,
                    nature=nature,
                    subskills=subskills or [],
                    unlocked_ingredients=unlocked_ings,
                )
                diff = abs(calc_rp - rp) + carry_pen
                if diff < best_diff:
                    best_diff = diff
            except Exception:
                pass
        scored_candidates.append((pk, best_diff))

    scored_candidates.sort(key=lambda x: x[1])
    best_pk, best_diff = scored_candidates[0]

    orig_diff = next((d for p, d in scored_candidates if p["name"] == pk_full["name"]), 999999)

    # If best candidate is different from original, has a clean match (diff <= 5 or diff <= 2% of RP),
    # and is substantially better than the original candidate:
    if best_pk["name"] != pk_full["name"] and best_diff <= max(5, int(rp * 0.02)) and best_diff < orig_diff:
        recovered_nick = None
        if raw_name_cand:
            cleaned = re.sub(r"(?i)(?:lv|1v|等级|等級|レベル)[\.:\s]*\d{1,3}", "", raw_name_cand).strip()
            tokens = [t.strip() for t in re.split(r"[\s\(\)\[\]（）]+", cleaned) if t.strip()]
            deduped = []
            for t in tokens:
                if not deduped or t != deduped[-1]:
                    deduped.append(t)

            pk_names = {best_pk["name"].lower(), best_pk.get("displayName", "").lower()}
            for tr in best_pk.get("translations", {}).values():
                if tr:
                    pk_names.add(tr.lower())

            custom = []
            for t in deduped:
                tl = t.lower()
                norm_tl = tl.replace("鷄", "鴉").replace("鸡", "鸦")
                if tl in pk_names or norm_tl in pk_names:
                    continue
                if re.search(r"^\d{1,2}[:：]\d{2}", t):
                    continue
                custom.append(t)
            if custom:
                recovered_nick = " ".join(custom)

        return best_pk, recovered_nick

    return pk_full, None


def parse_ocr_text(
    lines: List[str],
    boxes: Optional[List[Dict[str, Any]]] = None,
    image_size: Optional[Tuple[int, int]] = None,
    image_np: Optional[np.ndarray] = None,
) -> ParsedPokemonResult:
    """Parse OCR raw text lines (and optional 2D boxes / image array) into structured Pokemon Sleep profile."""
    from ocr.vision_matcher import VisionMatcher

    cleaned_lines = [clean_text_line(l) for l in lines if clean_text_line(l)]
    row_lines = _group_boxes_into_rows(boxes) if boxes else []

    # 1. Base text extractions
    pokemon = extract_pokemon_species(cleaned_lines, row_lines=row_lines)
    level = extract_level(cleaned_lines, row_lines=row_lines)
    rp = extract_rp(cleaned_lines, row_lines=row_lines)
    nature = extract_nature(cleaned_lines, row_lines=row_lines)
    subskills = extract_subskills(cleaned_lines, boxes=boxes, image_size=image_size)
    carry_limit = extract_carry_limit(cleaned_lines, row_lines=row_lines)
    main_skill_level = extract_main_skill_level(cleaned_lines, row_lines=row_lines)

    # Extract possible raw name line from row_lines or cleaned_lines (e.g. "LV.20扁鷄頭頭 烏鷄頭頭" or "LV.53寶寶丁99 寶寶丁99")
    raw_name_cand = None
    for rl in (row_lines or []):
        tokens = rl.split()
        if any(DATA_LOADER.get_pokemon(re.sub(r"(?i)(?:lv|1v|等级|等級|レベル)[\.:\s]*\d{1,2}", "", t).strip()) is not None for t in tokens):
            raw_name_cand = re.sub(r"(?i)(?:lv|1v|等级|等級|レベル)[\.:\s]*\d{1,2}", "", rl).strip()
            break

    if not raw_name_cand:
        name_search_pool = (row_lines or []) + cleaned_lines
        for cl in name_search_pool[:10]:
            if re.search(r"^\d{1,2}[:：]\d{2}", cl) and not any(k in cl for k in ("lv", "LV", "sp", "SP", "等级")):
                continue
            m_sub = re.sub(r"(?i)(?:lv|1v|等级|等級|レベル)[\.:\s]*\d{1,2}", "", cl).strip()
            if m_sub and len(m_sub) >= 2 and not any(noise in m_sub.lower() for noise in NOISE_KEYWORDS):
                raw_name_cand = m_sub
                break

    # 2. High-performance visual intelligence (when image array is available)
    nickname = None
    is_shiny = False
    conf_pokemon = 0.95 if pokemon else 0.0
    conf_shiny = 0.5
    conf_ing = 0.0
    ingredients: List[ParsedIngredient] = []

    if image_np is not None:
        vm = VisionMatcher.get_instance()
        img_bgr = cv2.cvtColor(image_np, cv2.COLOR_RGB2BGR) if image_np.shape[2] == 3 else image_np

        # (a) Visual Pokémon ID & Shiny discrimination
        vis_pkmn = vm.identify_pokemon_and_shiny(
            img_bgr,
            text_candidate_species=pokemon.get("name") if pokemon else None,
            raw_text_candidate=raw_name_cand,
            text_boxes=boxes,
        )

        if vis_pkmn.get("species"):
            if not pokemon:
                pokemon = DATA_LOADER.get_pokemon(vis_pkmn["species"])
            conf_pokemon = vis_pkmn.get("speciesConfidence", 0.8)
            conf_shiny = vis_pkmn.get("shinyConfidence", 0.8)
            is_shiny = vis_pkmn.get("isShiny", False)
            nickname = vis_pkmn.get("nickname")

        # (b) Visual ingredient detection
        vis_ings, ing_score = vm.detect_ingredients_visually(img_bgr, text_boxes=boxes)
        if ing_score >= 0.58 and len(vis_ings) >= 2:
            conf_ing = ing_score
            for vi in vis_ings:
                ing_data = DATA_LOADER.get_ingredient(vi["name"])
                ingredients.append(
                    ParsedIngredient(
                        slot=vi["slot"],
                        level=vi["level"],
                        name=vi["name"],
                        displayName=(
                            ing_data.get("translations", {}).get("zh-CN", vi["name"])
                            if ing_data
                            else vi["name"]
                        ),
                        amount=vi["amount"],
                        confidence=vi["confidence"],
                    )
                )
        else:
            # If visual ingredient matching is inconclusive / scrolled off screen:
            has_explicit_ing_text = any(
                any(ing_word in l for ing_word in ("苹果", "蘋果", "生姜", "香草", "番茄", "蛋", "牛奶", "油", "肉", "葱", "蔥", "尾巴", "蘑菇", "可可", "咖啡", "玉米", "大豆"))
                for l in cleaned_lines
            )
            has_multipliers = any(re.search(r"(?:[xX×]\s*\d{1,2}|\d{1,2}\s*個)", l) for l in cleaned_lines)
            can_deduce_from_rp = (pokemon is not None and level is not None and rp is not None and nature is not None)

            if has_explicit_ing_text or has_multipliers or can_deduce_from_rp:
                deduced_ings = extract_ingredients(
                    row_lines or cleaned_lines,
                    pokemon,
                    level=level,
                    rp=rp,
                    nature=nature,
                    subskills=subskills,
                    main_skill_level=main_skill_level,
                )
                if deduced_ings:
                    ingredients = deduced_ings
                    conf_ing = 0.92 if (has_multipliers or has_explicit_ing_text) else 0.85
                else:
                    ingredients = []
                    conf_ing = 0.0
            else:
                # Deliberately leave empty with 0.0 confidence so UI highlights for user entry!
                ingredients = []
                conf_ing = 0.0

        # (c) Micro-crop refinement for main skill level
        if main_skill_level is None and boxes:
            for b in boxes:
                tx = b.get("text", "")
                if any(k in tx for k in ("主技能", "main skill", "樹果", "树果", "能量", "活力", "美味", "大成功", "料理")):
                    refined_lvl, refined_conf = vm.refine_main_skill_level_micro_ocr(img_bgr, b["box"])
                    if refined_lvl is not None:
                        main_skill_level = refined_lvl
                        break
    else:
        # Fallback pure text API path
        ingredients = extract_ingredients(
            cleaned_lines,
            pokemon,
            level=level,
            rp=rp,
            nature=nature,
            subskills=subskills,
            main_skill_level=main_skill_level,
        )
        conf_ing = 0.80 if ingredients else 0.0

    # Fallback nickname extraction from text row lines if not already extracted
    if nickname is None and pokemon is not None and row_lines:
        pkmn_meta = pokemon
        known_names = {pkmn_meta["name"].lower(), pkmn_meta.get("displayName", "").lower()}
        for tr in pkmn_meta.get("translations", {}).values():
            if tr:
                known_names.add(tr.lower())
        for rl in row_lines:
            tokens = rl.split()
            custom_parts = []
            has_species = False
            for t in tokens:
                clean_t = re.sub(r"(?i)(?:lv|1v|等级|等級|レベル)[\.:\s]*\d{1,2}", "", t).strip()
                norm_t = clean_t.replace("鷄", "鴉").replace("鸡", "鸦").lower()
                if norm_t in known_names:
                    has_species = True
                elif clean_t and not clean_t.isdigit() and not any(noise in clean_t.lower() for noise in NOISE_KEYWORDS):
                    custom_parts.append(clean_t)
            if has_species and custom_parts:
                nickname = " ".join(custom_parts)
                break

    # 2.5 Evolution Family Cross-Validation & Disambiguation via exact RP / SP and physical stats
    if pokemon and rp and level and nature:
        disambiguated_pk, recovered_nick = disambiguate_pokemon_by_rp_and_stats(
            pokemon=pokemon,
            rp=rp,
            level=level,
            nature=nature,
            subskills=subskills,
            main_skill_level=main_skill_level,
            carry_limit=carry_limit,
            ingredients=ingredients,
            raw_name_cand=raw_name_cand,
            lines=cleaned_lines,
        )
        if disambiguated_pk and disambiguated_pk["name"] != pokemon["name"]:
            pokemon = disambiguated_pk
            conf_pokemon = 0.98
            if recovered_nick:
                nickname = recovered_nick
            # Re-check ingredients with the correct evolved pokemon species if needed
            if not ingredients or conf_ing < 0.85:
                re_ings = extract_ingredients(
                    row_lines or cleaned_lines,
                    pokemon,
                    level=level,
                    rp=rp,
                    nature=nature,
                    subskills=subskills,
                    main_skill_level=main_skill_level,
                )
                if re_ings:
                    ingredients = re_ings
                    conf_ing = 0.92

    # 3. Match flags and confidence calculation
    matched_fields = []
    if pokemon and conf_pokemon >= 0.60:
        matched_fields.append("pokemon")
    if nickname:
        matched_fields.append("nickname")
    if is_shiny:
        matched_fields.append("isShiny")
    if level is not None:
        matched_fields.append("level")
    if rp is not None:
        matched_fields.append("rp")
    if nature:
        matched_fields.append("nature")
    if len(subskills) >= 1:
        matched_fields.append(f"subskills({len(subskills)})")
    if len(ingredients) >= 1 and conf_ing >= 0.58:
        matched_fields.append(f"ingredients({len(ingredients)})")
    if main_skill_level is not None:
        matched_fields.append("mainSkillLevel")
    if carry_limit is not None:
        matched_fields.append("carryLimit")

    field_confidences = {
        "pokemon": conf_pokemon,
        "nickname": 0.95 if nickname else 0.0,
        "isShiny": conf_shiny,
        "level": 0.95 if level is not None else 0.0,
        "rp": 0.95 if rp is not None else 0.0,
        "nature": 0.90 if nature else 0.0,
        "subskills": round(min(1.0, len(subskills) / 5.0), 2) if subskills else 0.0,
        "ingredients": conf_ing,
        "mainSkillLevel": 0.95 if main_skill_level is not None else 0.0,
        "carryLimit": 0.90 if carry_limit is not None else 0.0,
    }

    score = 0.0
    if pokemon:
        score += 0.35 * conf_pokemon
    if nature:
        score += 0.25
    if level is not None:
        score += 0.15
    if subskills:
        score += min(0.25, len(subskills) * 0.05)

    res_pokemon = None
    if pokemon:
        res_pokemon = {
            "name": pokemon["name"],
            "displayName": pokemon.get("translations", {}).get("zh-CN", pokemon.get("displayName", pokemon["name"])),
            "pokedexNumber": pokemon["pokedexNumber"],
            "specialty": pokemon.get("specialty"),
            "frequency": pokemon.get("frequency"),
            "carrySize": pokemon.get("carrySize"),
        }

    res_nature = None
    if nature:
        res_nature = {
            "name": nature["name"],
            "displayName": nature.get("translations", {}).get("zh-CN", nature["name"]),
            "positiveModifier": nature.get("positiveModifier"),
            "negativeModifier": nature.get("negativeModifier"),
        }

    return ParsedPokemonResult(
        pokemon=res_pokemon,
        nickname=nickname,
        isShiny=is_shiny,
        level=level or 1,
        rp=rp,
        nature=res_nature,
        subskills=subskills,
        ingredients=ingredients,
        carryLimit=carry_limit,
        mainSkillLevel=main_skill_level,
        confidence=round(score, 2),
        fieldConfidences=field_confidences,
        matchedFields=matched_fields,
        rawLines=row_lines if row_lines else cleaned_lines,
    )
