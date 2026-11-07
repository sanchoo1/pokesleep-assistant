"""OCR text parser and fuzzy dictionary normalizer for Pokémon Sleep."""

import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from data_loader import DATA_LOADER


class ParsedSubskill(BaseModel):
    slot: str  # level10, level25, level50, level75, level100
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


class ParsedPokemonResult(BaseModel):
    pokemon: Optional[Dict[str, Any]] = None
    level: Optional[int] = None
    nature: Optional[Dict[str, Any]] = None
    subskills: List[ParsedSubskill] = Field(default_factory=list)
    ingredients: List[ParsedIngredient] = Field(default_factory=list)
    carryLimit: Optional[int] = None
    mainSkillLevel: Optional[int] = None
    confidence: float = 0.0
    matchedFields: List[str] = Field(default_factory=list)
    rawLines: List[str] = Field(default_factory=list)


# OCR common noise words to ignore when scanning for Pokémon names
NOISE_KEYWORDS = {
    "lv", "level", "rp", "sp", "hp", "exp", "max", "box",
    "主技能", "副技能", "食材", "性格", "等级", "等級", "持有上限", "最大持有数",
    "帮手间隔", "帮忙间隔", "睡眠类型", "睡姿", "图鉴", "研究", "营地",
    "main skill", "sub skill", "nature", "ingredients", "carry limit",
    "helping frequency", "sleep type", "pokedex",
    "せいかく", "サブスキル", "メインスキル", "おてつだい", "とくちょう"
}


def clean_text_line(line: str) -> str:
    """Normalize line whitespace and remove common OCR symbol noise."""
    line = line.strip()
    # Replace common symbol confusions
    line = re.sub(r"[\|•·\t\r]+", " ", line)
    return line.strip()


def extract_level(lines: List[str]) -> Optional[int]:
    """Extract Pokémon level from lines (1-70)."""
    # Patterns like "Lv. 25", "Lv25", "LV: 30", "等级 15", "レベル 50"
    level_patterns = [
        re.compile(r"(?:lv|1v|等級|等级|レベル)[\.:\s]*(\d{1,2})\b", re.IGNORECASE),
        re.compile(r"\b(\d{1,2})\s*(?:级|級|lv)\b", re.IGNORECASE),
    ]

    for line in lines:
        for pat in level_patterns:
            m = pat.search(line)
            if m:
                lvl = int(m.group(1))
                if 1 <= lvl <= 70:
                    return lvl

    # Secondary check for standalone "Lv" followed by number on next line
    for i, line in enumerate(lines):
        if re.fullmatch(r"(?i)lv\.?", line.strip()) and i + 1 < len(lines):
            nxt = lines[i + 1].strip()
            if nxt.isdigit() and 1 <= int(nxt) <= 70:
                return int(nxt)

    return None


def extract_nature(lines: List[str]) -> Optional[Dict[str, Any]]:
    """Extract Pokémon nature from lines using exact & fuzzy dictionary lookup."""
    # Pattern 1: Explicit keyword e.g. "性格: 固执", "性格 固执", "固执的性格", "Nature: Adamant"
    nature_line_pat = re.compile(
        r"(?:性格|nature|せいかく)[\s:：]*([^\s,，。]+)", re.IGNORECASE
    )
    for line in lines:
        m = nature_line_pat.search(line)
        if m:
            candidate = m.group(1).replace("的", "").replace("性格", "").strip()
            nat = DATA_LOADER.get_nature(candidate)
            if nat:
                return nat

    # Pattern 2: "...的性格" e.g. "坦率的性格", "冷静的性格"
    suffix_pat = re.compile(r"([^\s:：]{2,4})的性格")
    for line in lines:
        m = suffix_pat.search(line)
        if m:
            nat = DATA_LOADER.get_nature(m.group(1).strip())
            if nat:
                return nat

    # Pattern 3: Scan all words in all lines directly against nature dictionary
    for line in lines:
        # Split line by space or punctuation
        tokens = re.split(r"[\s,:：/]+", line)
        for token in tokens:
            t = token.strip()
            if len(t) >= 2:
                nat = DATA_LOADER.get_nature(t)
                if nat:
                    # Double check if token matches an exact nature translation
                    zh = nat.get("translations", {}).get("zh-CN", "")
                    en = nat.get("translations", {}).get("en", "")
                    ja = nat.get("translations", {}).get("ja", "")
                    if t in [zh, en, ja, nat["name"]]:
                        return nat

    return None


def extract_pokemon_species(lines: List[str]) -> Optional[Dict[str, Any]]:
    """Extract Pokémon species name from lines."""
    best_candidate: Optional[Dict[str, Any]] = None
    best_score = 0.0

    # Scan lines (especially the upper half of lines)
    for idx, line in enumerate(lines):
        clean = line.strip()
        if not clean or len(clean) < 2:
            continue

        lower = clean.lower()
        if any(noise in lower for noise in NOISE_KEYWORDS):
            # If line also has a level, strip "Lv. XX" and check remainder
            clean = re.sub(r"(?i)(?:lv|1v|等级|等級|レベル)[\.:\s]*\d{1,2}", "", clean).strip()
            if not clean:
                continue

        # Try exact match on whole line
        pkmn = DATA_LOADER.get_pokemon(clean)
        if pkmn:
            score = 100.0 - (idx * 2)  # earlier lines get higher priority
            if score > best_score:
                best_score = score
                best_candidate = pkmn
                continue

        # Try tokens in line
        tokens = re.split(r"[\s\(\)\[\]（）]+", clean)
        for token in tokens:
            t = token.strip()
            if len(t) >= 2:
                pkmn = DATA_LOADER.get_pokemon(t)
                if pkmn:
                    score = 80.0 - (idx * 2)
                    if score > best_score:
                        best_score = score
                        best_candidate = pkmn

    return best_candidate


def extract_subskills(lines: List[str]) -> List[ParsedSubskill]:
    """Extract 5 subskills associated with Lv10, Lv25, Lv50, Lv75, Lv100."""
    slots_levels = [
        ("level10", 10),
        ("level25", 25),
        ("level50", 50),
        ("level75", 75),
        ("level100", 100),
    ]
    found_by_slot: Dict[str, ParsedSubskill] = {}
    found_unordered: List[Dict[str, Any]] = []

    # First pass: Look for lines explicitly mentioning Lv 10, 25, 50, 75, 100
    lv_subskill_pat = re.compile(
        r"(?:lv|1v|等級|等级|レベル)[\.:\s]*(10|25|50|75|100)\s*[:：\s-]?\s*(.+)",
        re.IGNORECASE,
    )

    for i, line in enumerate(lines):
        m = lv_subskill_pat.search(line)
        if m:
            lvl_val = int(m.group(1))
            cand_name = m.group(2).strip()
            sub = DATA_LOADER.get_subskill(cand_name)
            if sub:
                slot_key = f"level{lvl_val}"
                found_by_slot[slot_key] = ParsedSubskill(
                    slot=slot_key,
                    level=lvl_val,
                    name=sub["name"],
                    displayName=sub.get("translations", {}).get("zh-CN", sub["name"]),
                    rarity=sub.get("rarity", "white"),
                )
                continue

        # Check if line is just "Lv. 10" and next line is subskill
        m_just_lv = re.fullmatch(r"(?i)(?:lv|1v|等级|等級)[\.:\s]*(10|25|50|75|100)", line.strip())
        if m_just_lv and i + 1 < len(lines):
            lvl_val = int(m_just_lv.group(1))
            cand_name = lines[i + 1].strip()
            sub = DATA_LOADER.get_subskill(cand_name)
            if sub:
                slot_key = f"level{lvl_val}"
                found_by_slot[slot_key] = ParsedSubskill(
                    slot=slot_key,
                    level=lvl_val,
                    name=sub["name"],
                    displayName=sub.get("translations", {}).get("zh-CN", sub["name"]),
                    rarity=sub.get("rarity", "white"),
                )

    # Second pass: Find any lines that match subskills in DATA_LOADER
    for line in lines:
        clean = line.strip()
        # Remove any leading "Lv.XX"
        clean_no_lv = re.sub(r"(?i)(?:lv|1v|等级|等級)[\.:\s]*\d{1,3}", "", clean).strip()
        if not clean_no_lv:
            continue

        sub = DATA_LOADER.get_subskill(clean_no_lv)
        if sub:
            # Check if already added
            already_have = any(
                p.name == sub["name"] for p in found_by_slot.values()
            ) or any(s["name"] == sub["name"] for s in found_unordered)
            if not already_have:
                found_unordered.append(sub)

    # Fill unassigned slots from found_unordered
    for slot_key, lvl in slots_levels:
        if slot_key not in found_by_slot and found_unordered:
            sub = found_unordered.pop(0)
            found_by_slot[slot_key] = ParsedSubskill(
                slot=slot_key,
                level=lvl,
                name=sub["name"],
                displayName=sub.get("translations", {}).get("zh-CN", sub["name"]),
                rarity=sub.get("rarity", "white"),
            )

    # Return list sorted by slot level
    res: List[ParsedSubskill] = []
    for slot_key, _ in slots_levels:
        if slot_key in found_by_slot:
            res.append(found_by_slot[slot_key])

    return res


def extract_ingredients(
    lines: List[str], pokemon: Optional[Dict[str, Any]]
) -> List[ParsedIngredient]:
    """Extract ingredient slots (Lv1, Lv30, Lv60) matching pokemon valid ingredient choices."""
    results: List[ParsedIngredient] = []

    # If pokemon is known, we can match against its specific ingredient slots
    slots = [
        ("slotA", 1, pokemon.get("ingredient0", []) if pokemon else []),
        ("slotB", 30, pokemon.get("ingredient30", []) if pokemon else []),
        ("slotC", 60, pokemon.get("ingredient60", []) if pokemon else []),
    ]

    matched_names: List[str] = []

    # First pass: find ingredients mentioned in lines with counts (e.g. "特选苹果 x2", "玉米 5")
    # or just ingredient names
    ing_pat = re.compile(r"([^\d\s\+x]+)\s*[\*xX×\+:\s]*(\d{1,2})?")
    detected_ings: List[Dict[str, Any]] = []

    for line in lines:
        clean = line.strip()
        m = ing_pat.search(clean)
        if m:
            cand = m.group(1).strip()
            amt_str = m.group(2)
            ing = DATA_LOADER.get_ingredient(cand)
            if ing:
                detected_ings.append({
                    "ing": ing,
                    "amount": int(amt_str) if amt_str else None,
                })

    # For each slot, match best candidate
    for slot_key, lvl, candidates in slots:
        assigned = False
        if candidates:
            # Try to match detected_ings in order
            for det in detected_ings:
                det_name = det["ing"]["name"]
                for cand in candidates:
                    if cand["ingredient"].lower() == det_name.lower():
                        results.append(
                            ParsedIngredient(
                                slot=slot_key,
                                level=lvl,
                                name=cand["ingredient"],
                                displayName=det["ing"].get("translations", {}).get(
                                    "zh-CN", cand["ingredient"]
                                ),
                                amount=cand["amount"],
                            )
                        )
                        detected_ings.remove(det)
                        assigned = True
                        break
                if assigned:
                    break

            if not assigned:
                # Default to first candidate for this slot if slot 0 (always fixed!)
                cand = candidates[0]
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
            # Fallback when pokemon is not known
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


def extract_carry_limit(lines: List[str]) -> Optional[int]:
    """Extract carry limit / inventory size e.g. '持有上限 19'."""
    pat = re.compile(r"(?:持有上限|最大持有数|最大所持数|carry\s*limit|inventory)[\s:：]*(\d{1,3})", re.IGNORECASE)
    for line in lines:
        m = pat.search(line)
        if m:
            return int(m.group(1))
    return None


def extract_main_skill_level(lines: List[str]) -> Optional[int]:
    """Extract main skill level e.g. '主技能 Lv. 3'."""
    pat = re.compile(r"(?:主技能|メインスキル|main\s*skill).*?(?:lv|1v|等级|等級)[\.:\s]*(\d)", re.IGNORECASE)
    for line in lines:
        m = pat.search(line)
        if m:
            return int(m.group(1))
    return None


def parse_ocr_text(lines: List[str]) -> ParsedPokemonResult:
    """Parse OCR raw text lines into structured Pokemon Sleep profile."""
    cleaned_lines = [clean_text_line(l) for l in lines if clean_text_line(l)]

    pokemon = extract_pokemon_species(cleaned_lines)
    level = extract_level(cleaned_lines)
    nature = extract_nature(cleaned_lines)
    subskills = extract_subskills(cleaned_lines)
    ingredients = extract_ingredients(cleaned_lines, pokemon)
    carry_limit = extract_carry_limit(cleaned_lines)
    main_skill_level = extract_main_skill_level(cleaned_lines)

    matched_fields = []
    if pokemon:
        matched_fields.append("pokemon")
    if level is not None:
        matched_fields.append("level")
    if nature:
        matched_fields.append("nature")
    if len(subskills) >= 1:
        matched_fields.append(f"subskills({len(subskills)})")
    if len(ingredients) >= 1:
        matched_fields.append(f"ingredients({len(ingredients)})")

    # Confidence calculation:
    # Essential: pokemon (0.35), nature (0.25), subskills (0.25), level (0.15)
    score = 0.0
    if pokemon:
        score += 0.35
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
        level=level or 1,
        nature=res_nature,
        subskills=subskills,
        ingredients=ingredients,
        carryLimit=carry_limit,
        mainSkillLevel=main_skill_level,
        confidence=round(score, 2),
        matchedFields=matched_fields,
        rawLines=cleaned_lines,
    )
