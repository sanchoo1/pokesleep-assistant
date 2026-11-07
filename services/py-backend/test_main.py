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

    files = {"file": ("test_scan.png", img_byte_arr.getvalue(), "image/png")}
    res = client.post("/api/ocr/scan-image", files=files)
    assert res.status_code == 200
    data = res.json()
    assert "parsed" in data
    assert "boxes" in data
    assert data["parsed"]["level"] == 40
    assert data["parsed"]["nature"]["name"] == "Adamant"


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
