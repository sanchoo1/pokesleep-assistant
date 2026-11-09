"""Pytest test suite for FastAPI backend endpoints."""

import io
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from main import app
from data_loader import DATA_LOADER
from ocr.parser import parse_ocr_text
from optimizer.weekly_meals import solve_weekly_meal_schedule, WeeklyMealRequest

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

    res_api = client.get("/api/health")
    assert res_api.status_code == 200
    assert res_api.json()["status"] == "ok"


def test_data_loader():
    # Pokemon lookup
    pika = DATA_LOADER.get_pokemon("皮卡丘")
    assert pika is not None
    assert pika["pokedexNumber"] == 25
    assert pika["translations"]["zh-CN"] == "皮卡丘"

    # Fuzzy lookup
    pika_fuzzy = DATA_LOADER.get_pokemon("皮卡")
    assert pika_fuzzy is not None

    # Nature lookup
    adamant = DATA_LOADER.get_nature("固执")
    assert adamant is not None
    assert adamant["name"] == "Adamant"

    # Subskill lookup with alias
    bfs = DATA_LOADER.get_subskill("树果数量增加S")
    assert bfs is not None
    assert bfs["name"] == "Berry Finding S"

    # Recipe lookup
    curry = DATA_LOADER.get_recipe("特选苹果咖喱")
    assert curry is not None
    assert curry["type"] == "curry"


def test_ocr_parse_text_api():
    # Test English lines
    payload_en = {
        "lines": [
            "Pikachu Lv.25",
            "Adamant Nature",
            "Lv.10 Berry Finding S",
            "Lv.25 Helping Speed M",
            "Lv.50 Skill Trigger S",
            "Fancy Apple x2",
        ]
    }
    res = client.post("/api/ocr/parse-text", json=payload_en)
    assert res.status_code == 200
    data = res.json()
    assert data["pokemon"]["pokedexNumber"] == 25
    assert data["level"] == 25
    assert data["nature"]["name"] == "Adamant"
    assert len(data["subskills"]) >= 2
    assert data["confidence"] > 0.7

    # Test Chinese lines with typical OCR noise
    payload_zh = {
        "text": """
        喷火龙
        Lv. 35
        固执的性格
        Lv.10 帮手奖励
        Lv.25 食材几率提升M
        Lv.50 持有上限提升L
        豆制肉 2
        暖暖生姜 4
        """
    }
    res_zh = client.post("/api/ocr/parse-text", json=payload_zh)
    assert res_zh.status_code == 200
    data_zh = res_zh.json()
    assert data_zh["pokemon"]["displayName"] == "喷火龙"
    assert data_zh["level"] == 35
    assert data_zh["nature"]["displayName"] == "固执"
    assert len(data_zh["subskills"]) == 3
    assert data_zh["subskills"][0]["displayName"] == "帮手奖励"


def test_ocr_scan_image_api():
    # Create synthetic test image
    img = Image.new("RGB", (600, 200), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.text((20, 20), "Charizard Lv.40", fill=(0, 0, 0))
    draw.text((20, 60), "Adamant Nature", fill=(0, 0, 0))
    draw.text((20, 100), "Berry Finding S", fill=(0, 0, 0))

    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format="PNG")
    img_byte_arr.seek(0)

    files = {"file": ("test_scan", img_byte_arr.getvalue(), "application/octet-stream")}
    res = client.post("/api/ocr/scan-image", files=files)
    assert res.status_code == 200
    data = res.json()
    assert "parsed" in data
    assert "boxes" in data
    assert data["parsed"]["level"] == 40
    assert data["parsed"]["nature"]["name"] == "Adamant"


def test_ocr_lv70_lv80_and_real_screenshot():
    from pathlib import Path

    # 1. Verify Lv.70 and Lv.80 subskills parse cleanly
    res = client.post(
        "/api/ocr/parse-text",
        json={
            "lines": [
                "Lv.50 蜥蜴王",
                "SP 2500",
                "树果遽增 Lv.4",
                "Lv.10 技能几率提升M",
                "Lv.25 持有上限提升S",
                "Lv.50 树果数量S",
                "Lv.70 帮手奖励",
                "Lv.80 帮忙速度S",
                "性格 悠闲",
            ]
        },
    )
    assert res.status_code == 200
    parsed = res.json()
    assert parsed["pokemon"]["name"] == "SCEPTILE"
    assert parsed["level"] == 50
    assert parsed["mainSkillLevel"] == 4
    slots = {s["slot"]: s["name"] for s in parsed["subskills"]}
    assert slots == {
        "level10": "Skill Trigger M",
        "level25": "Inventory Up S",
        "level50": "Berry Finding S",
        "level70": "Helping Bonus",
        "level80": "Helping Speed S",
    }

    # 2. If local gitignored test_imgs/cew or test_imgs/蜥蜴王 exists, verify end-to-end real screenshot OCR
    test_imgs_dir = Path(__file__).resolve().parents[2] / "test_imgs"
    real_img = test_imgs_dir / "cew" if (test_imgs_dir / "cew").exists() else test_imgs_dir / "蜥蜴王"
    if real_img.exists():
        res_img = client.post(
            "/api/ocr/scan-image",
            files={"file": (real_img.name, real_img.read_bytes(), "application/octet-stream")},
        )
        assert res_img.status_code == 200
        p = res_img.json()["parsed"]
        assert p["pokemon"]["name"] == "SCEPTILE"
        assert p["level"] == 41
        assert p["rp"] == 2119
        assert p["carryLimit"] == 33
        assert p["mainSkillLevel"] == 3
        assert p["nature"]["name"] == "Relaxed"
        assert p["isShiny"] is False
        assert p["fieldConfidences"]["pokemon"] >= 0.60
        assert p["fieldConfidences"]["isShiny"] >= 0.70
        assert [s["name"] for s in p["subskills"]] == [
            "Skill Trigger M",
            "Inventory Up S",
            "Berry Finding S",
            "Helping Bonus",
            "Helping Speed S",
        ]


def test_vision_matcher_performance_and_nickname():
    """Verify VisionMatcher runs in milliseconds on CPU, extracts custom nicknames, and detects shiny status."""
    import time
    from pathlib import Path
    from ocr.vision_matcher import VisionMatcher

    vm = VisionMatcher.get_instance()
    assert len(vm.pokemon_signatures) >= 200
    assert len(vm.ingredient_signatures) >= 15

    test_img_path = Path(__file__).resolve().parents[2] / "test_imgs" / "cew"
    if test_img_path.exists():
        import cv2

        img = cv2.imread(str(test_img_path))
        t0 = time.time()
        vis_res = vm.identify_pokemon_and_shiny(
            img,
            text_candidate_species=None,
            raw_text_candidate="翠神",
        )
        elapsed_ms = (time.time() - t0) * 1000

        # CPU performance budget check: must finish within 30ms!
        assert elapsed_ms < 30.0, f"Vision matching took {elapsed_ms:.1f}ms, exceeding 30ms budget!"
        assert vis_res["species"] == "SCEPTILE"
        assert vis_res["nickname"] == "翠神"
        assert vis_res["isShiny"] is False
        assert vis_res["speciesConfidence"] >= 0.65
        assert vis_res["shinyConfidence"] >= 0.80


def test_python_rp_cross_validation_against_golden():
    import json
    from pathlib import Path
    from ocr.parser import ParsedSubskill, SUBSKILL_SLOTS_LEVELS, calculate_exact_rp_python

    golden_path = (
        Path(__file__).resolve().parents[2]
        / "packages"
        / "engine"
        / "src"
        / "__tests__"
        / "fixtures"
        / "golden-cross-validation.json"
    )
    golden = json.loads(golden_path.read_text("utf-8"))
    checked = 0
    for case in golden["cases"]:
        inp = case["input"]
        exp = case["expected"]
        mon = DATA_LOADER.get_pokemon(inp["pokemon"])
        assert mon is not None
        # Python OCR RP deducer assumes 0 ribbon speed modifier on un-evolved stages
        if inp["ribbonLevel"] >= 2 and mon.get("remainingEvolutions", 0) > 0:
            continue
        nat = DATA_LOADER.get_nature(inp["nature"])
        subs = []
        for idx, sub_name in enumerate(inp["subskills"]):
            if not sub_name:
                continue
            slot_key, unlock_lvl = SUBSKILL_SLOTS_LEVELS[idx]
            subs.append(
                ParsedSubskill(
                    slot=slot_key,
                    level=unlock_lvl,
                    name=sub_name,
                    displayName=sub_name,
                    rarity="silver",
                )
            )
        combo = inp["ingredientCombo"]
        unlocked_ings = [mon["ingredient0"][max(0, ord(combo[0]) - 65)]]
        if inp["level"] >= 30:
            valid30 = [i for i in mon["ingredient30"] if i["ingredient"] != "Locked"]
            unlocked_ings.append(valid30[max(0, ord(combo[1]) - 65)])
        if inp["level"] >= 60:
            valid60 = [i for i in mon["ingredient60"] if i["ingredient"] != "Locked"]
            unlocked_ings.append(valid60[max(0, ord(combo[2]) - 65)])

        py_rp = calculate_exact_rp_python(
            pokemon=mon,
            level=inp["level"],
            skill_level=exp["effectiveMainSkillLevel"],
            nature=nat,
            subskills=subs,
            unlocked_ingredients=unlocked_ings,
        )
        assert py_rp == exp["rp"], f"Mismatch on {case['id']}: {py_rp} != {exp['rp']}"
        checked += 1

    assert checked >= 20


def test_optimizer_weekly_meals():
    payload = {
        "mealCategory": "curry",
        "basePotCapacity": 57,
        "hasGoodCampTicket": False,
        "currentInventory": {
            "Apple": 100,
            "Sausage": 80,
            "Ginger": 50,
            "Milk": 40,
        },
        "dailyProduction": {
            "Apple": 20.0,
            "Sausage": 15.0,
            "Ginger": 10.0,
            "Milk": 10.0,
        },
        "recipeLevels": {
            "FANCY_APPLE_CURRY": 10,
        },
        "islandBonus": 20.0,
        "fillPotWithLeftovers": True,
        "weekdayCritMultiplier": 1.0,
        "sundayCritMultiplier": 2.0,
    }

    res = client.post("/api/optimize/weekly-meals", json=payload)
    assert res.status_code == 200
    plan = res.json()
    assert plan["status"] == "optimal"
    assert len(plan["schedule"]) == 21  # 21 meals
    assert plan["totalStrength"] > 0
    assert plan["solveTimeMs"] < 2000.0  # solves well under 2s

    # Verify Sunday meals have potCapacity == 2 * 57 = 114
    sunday_meals = [m for m in plan["schedule"] if m["day"] == "Sunday"]
    assert len(sunday_meals) == 3
    for sm in sunday_meals:
        assert sm["potCapacity"] == 114
        assert sm["critMultiplier"] == 2.0

    # Weekday meals have potCapacity == 57
    weekday_meals = [m for m in plan["schedule"] if m["day"] != "Sunday"]
    assert len(weekday_meals) == 18
    for wm in weekday_meals:
        assert wm["potCapacity"] == 57
        assert wm["critMultiplier"] == 1.0

    # Verify ingredient flow conservation: final inventory should be non-negative
    for ing, rem in plan["finalInventory"].items():
        assert rem >= -1e-5


def test_profiles_api():
    # 1. List profiles, hxc must exist and have 3 default pokemon
    res = client.get("/api/profiles")
    assert res.status_code == 200
    profiles = res.json()
    assert any(p["username"] == "hxc" for p in profiles)
    hxc_meta = next(p for p in profiles if p["username"] == "hxc")
    assert hxc_meta["pokemonCount"] >= 3

    # 2. Get hxc profile
    res_hxc = client.get("/api/profiles/hxc")
    assert res_hxc.status_code == 200
    hxc_data = res_hxc.json()
    assert hxc_data["username"] == "hxc"
    assert len(hxc_data["pokemonList"]) >= 3

    # 3. Create new profile 'test_member'
    res_new = client.post("/api/profiles", json={"username": "test_member"})
    assert res_new.status_code == 200
    member_data = res_new.json()
    assert member_data["username"] == "test_member"
    assert len(member_data["pokemonList"]) == 0

    # 4. Update test_member profile
    res_update = client.put(
        "/api/profiles/test_member",
        json={
            "pokemonList": [
                {
                    "id": "member_pika_01",
                    "pokemonName": "PIKACHU",
                    "level": 15,
                    "nature": "Brave",
                    "subskills": {},
                    "ingredients": {"slotA": "Apple"},
                    "createdAt": 1700000000000,
                }
            ],
            "teamIds": ["member_pika_01"],
            "locale": "en",
        },
    )
    assert res_update.status_code == 200
    updated = res_update.json()
    assert len(updated["pokemonList"]) == 1
    assert updated["locale"] == "en"

    # 5. Verify deletion safeguard on hxc
    res_del_hxc = client.delete("/api/profiles/hxc")
    assert res_del_hxc.status_code == 400

    # 6. Delete test_member
    res_del = client.delete("/api/profiles/test_member")
    assert res_del.status_code == 200


def test_ditto_debug_scan_regression():
    """Verify Ditto audit scan fixes subskills row-shifting and deduces ingredients."""
    import os, json
    scan_json_path = "data-sources/debug_scans/scan_20261108_050625_daa4a3.json"
    if not os.path.exists(scan_json_path):
        pytest.skip("Debug scan file not found")

    with open(scan_json_path) as f:
        data = json.load(f)

    res = parse_ocr_text(
        lines=data["parsed"]["rawLines"],
        boxes=data["rawBoxes"],
        image_size=(1170, 2532),
    )

    assert res.pokemon["name"] == "DITTO"
    assert res.level == 36
    assert res.rp == 1453
    assert res.nature["name"] == "Docile"

    # Subskills should be correctly placed in all 5 slots without shifting or fake skills
    slots_map = {s.slot: s.name for s in res.subskills}
    assert slots_map.get("level10") == "Ingredient Finder M"
    assert slots_map.get("level25") == "Helping Bonus"
    assert slots_map.get("level50") == "Inventory Up S"
    assert slots_map.get("level70") == "Skill Level Up S"
    assert slots_map.get("level80") == "Skill Trigger M"

    # Ingredients deduced correctly: Oil (x2), Leek (x3), Leek (x5)
    ing_map = {i.slot: (i.name, i.amount) for i in res.ingredients}
    assert ing_map.get("slotA") == ("Oil", 2)
    assert ing_map.get("slotB") == ("Leek", 3)
    assert ing_map.get("slotC") == ("Leek", 5)


def test_honchkrow_debug_scan_regression():
    """Verify Honchkrow scan handles nickname, OCR glyph confusion (鷄->鴉), and ingredient previews."""
    import os, json
    scan_json_path = "data-sources/debug_scans/scan_20261108_054556_67245e.json"
    if not os.path.exists(scan_json_path):
        pytest.skip("Debug scan file not found")

    with open(scan_json_path) as f:
        data = json.load(f)

    res = parse_ocr_text(
        lines=data["parsed"]["rawLines"],
        boxes=data["rawBoxes"],
        image_size=(1170, 2532),
    )

    assert res.pokemon["name"] == "HONCHKROW"
    assert res.level == 20
    assert res.rp == 1136
    assert res.nature["name"] == "Sassy"
    assert res.carryLimit == 23
    assert res.mainSkillLevel == 2
    assert res.nickname == "扁鷄頭頭"

    # Subskills
    slots_map = {s.slot: s.name for s in res.subskills}
    assert slots_map.get("level10") == "Helping Speed M"
    assert slots_map.get("level25") == "Inventory Up S"
    assert slots_map.get("level50") == "Skill Trigger S"
    assert slots_map.get("level70") == "Skill Level Up M"
    assert slots_map.get("level80") == "Helping Speed S"

    # Ingredients
    ing_map = {i.slot: (i.name, i.amount) for i in res.ingredients}
    assert ing_map.get("slotA") == ("Coffee", 1)
    assert ing_map.get("slotB") == ("Soybean", 3)


def test_wigglytuff_nickname_evolution_regression():
    """
    Verify scan_20261109_144315_7cd32b:
    Player named evolved Wigglytuff '宝宝丁99'.
    The engine should use exact RP (4522), carry limit (38), main skill Lv.6,
    level 53, and Sassy nature to disambiguate the true evolved species as
    WIGGLYTUFF (胖可丁) instead of pre-evolution IGGLYBUFF (宝宝丁),
    and successfully recover the player's custom nickname '寶寶丁99'.
    """
    import os, json
    scan_json_path = "data-sources/debug_scans/scan_20261109_144315_7cd32b.json"
    if not os.path.exists(scan_json_path):
        pytest.skip("Debug scan file not found")

    with open(scan_json_path) as f:
        data = json.load(f)

    res = parse_ocr_text(
        lines=data["parsed"]["rawLines"],
        boxes=data["rawBoxes"],
        image_size=(1170, 2532),
    )

    # Species disambiguated from exact RP=4522
    assert res.pokemon["name"] == "WIGGLYTUFF"
    assert res.pokemon["displayName"] == "胖可丁"
    # Player's custom nickname recovered
    assert res.nickname == "寶寶丁99"
    assert res.level == 53
    assert res.rp == 4522
    assert res.nature["name"] == "Sassy"
    assert res.nature["displayName"] == "自大"
    assert res.carryLimit == 38
    assert res.mainSkillLevel == 6

    # Subskills
    slots_map = {s.slot: s.name for s in res.subskills}
    assert slots_map.get("level10") == "Helping Bonus"
    assert slots_map.get("level25") == "Skill Trigger M"
    assert slots_map.get("level50") == "Ingredient Finder S"
    assert slots_map.get("level70") == "Helping Speed S"
    assert slots_map.get("level80") == "Skill Level Up S"

    # Ingredients
    ing_map = {i.slot: (i.name, i.amount) for i in res.ingredients}
    assert ing_map.get("slotA") == ("Honey", 1)
    assert ing_map.get("slotB") == ("Honey", 2)
    assert ing_map.get("slotC") == ("Cacao", 2)




