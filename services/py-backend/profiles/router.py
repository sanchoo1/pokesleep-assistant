"""Profiles router for multi-user family support with passwordless registration and persistence."""

import json
import re
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/profiles", tags=["profiles"])

PROFILES_DIR = Path(__file__).resolve().parents[3] / "data_storage" / "profiles"
PROFILES_DIR.mkdir(parents=True, exist_ok=True)

def sanitize_username(raw: str) -> str:
    cleaned = raw.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="用户名不能为空")
    # Allow alphanumeric, Chinese, Japanese, Korean, underscores, dashes
    if len(cleaned) > 32:
        raise HTTPException(status_code=400, detail="用户名长度不能超过32个字符")
    if "/" in cleaned or "\\" in cleaned or ".." in cleaned:
        raise HTTPException(status_code=400, detail="用户名包含非法字符")
    return cleaned


def get_profile_path(username: str) -> Path:
    safe = sanitize_username(username)
    return PROFILES_DIR / f"{safe}.json"


def ensure_hxc_profile():
    hxc_path = PROFILES_DIR / "hxc.json"
    if not hxc_path.exists():
        initial_data = {
            "username": "hxc",
            "displayName": "hxc",
            "pokemonList": [],
            "teamIds": [],
            "inventory": {
                "Apple": 0,
            },
            "potSize": 57,
            "goodCampTicket": False,
            "islandBonus": 20,
            "locale": "zh-CN",
            "updatedAt": int(time.time() * 1000),
        }
        hxc_path.write_text(json.dumps(initial_data, ensure_ascii=False, indent=2), encoding="utf-8")


class ProfileSummary(BaseModel):
    username: str
    displayName: str
    pokemonCount: int = 0
    updatedAt: int


class CreateProfileRequest(BaseModel):
    username: str


class ProfilePayload(BaseModel):
    displayName: Optional[str] = None
    pokemonList: Optional[List[Dict[str, Any]]] = None
    teamIds: Optional[List[str]] = None
    inventory: Optional[Dict[str, int]] = None
    potSize: Optional[int] = None
    goodCampTicket: Optional[bool] = None
    islandBonus: Optional[int] = None
    locale: Optional[str] = None


@router.get("", response_model=List[ProfileSummary])
def list_profiles():
    """List all registered family member profiles (default hxc created on demand)."""
    ensure_hxc_profile()
    profiles: List[ProfileSummary] = []
    for file in sorted(PROFILES_DIR.glob("*.json")):
        try:
            content = json.loads(file.read_text("utf-8"))
            profiles.append(
                ProfileSummary(
                    username=content.get("username", file.stem),
                    displayName=content.get("displayName") or content.get("username", file.stem),
                    pokemonCount=len(content.get("pokemonList", [])),
                    updatedAt=content.get("updatedAt", int(file.stat().st_mtime * 1000)),
                )
            )
        except Exception:
            continue

    # Keep hxc at the front
    profiles.sort(key=lambda p: (0 if p.username == "hxc" else 1, p.username.lower()))
    return profiles


@router.post("", response_model=Dict[str, Any])
def create_profile(req: CreateProfileRequest):
    """Create a new profile with passwordless instant onboarding."""
    username = sanitize_username(req.username)
    path = get_profile_path(username)
    if path.exists():
        # Already exists, return existing profile
        return json.loads(path.read_text("utf-8"))

    new_profile = {
        "username": username,
        "displayName": username,
        "pokemonList": [],
        "teamIds": [],
        "inventory": {
            "Apple": 30,
            "Sausage": 20,
            "Ginger": 15,
            "Milk": 15,
            "Honey": 15,
        },
        "potSize": 57,
        "goodCampTicket": False,
        "islandBonus": 0,
        "locale": "zh-CN",
        "updatedAt": int(time.time() * 1000),
    }
    path.write_text(json.dumps(new_profile, ensure_ascii=False, indent=2), encoding="utf-8")
    return new_profile


@router.get("/{username}", response_model=Dict[str, Any])
def get_profile(username: str):
    """Get full profile data."""
    if username == "hxc":
        ensure_hxc_profile()
    path = get_profile_path(username)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"未找到用户档案: {username}")
    return json.loads(path.read_text("utf-8"))


@router.put("/{username}", response_model=Dict[str, Any])
def update_profile(username: str, payload: ProfilePayload):
    """Update profile data (Pokemon box, team, preferences)."""
    if username == "hxc":
        ensure_hxc_profile()
    path = get_profile_path(username)
    existing: Dict[str, Any] = {}
    if path.exists():
        try:
            existing = json.loads(path.read_text("utf-8"))
        except Exception:
            existing = {}

    existing["username"] = username
    if payload.displayName is not None:
        existing["displayName"] = payload.displayName
    elif "displayName" not in existing:
        existing["displayName"] = username

    if payload.pokemonList is not None:
        existing["pokemonList"] = payload.pokemonList
    if payload.teamIds is not None:
        existing["teamIds"] = payload.teamIds
    if payload.inventory is not None:
        existing["inventory"] = payload.inventory
    if payload.potSize is not None:
        existing["potSize"] = payload.potSize
    if payload.goodCampTicket is not None:
        existing["goodCampTicket"] = payload.goodCampTicket
    if payload.islandBonus is not None:
        existing["islandBonus"] = payload.islandBonus
    if payload.locale is not None:
        existing["locale"] = payload.locale

    existing["updatedAt"] = int(time.time() * 1000)
    path.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    return existing


@router.delete("/{username}")
def delete_profile(username: str):
    """Delete a profile (hxc cannot be deleted)."""
    if username == "hxc":
        raise HTTPException(status_code=400, detail="默认用户 hxc 不允许删除")
    path = get_profile_path(username)
    if path.exists():
        path.unlink()
        return {"status": "ok", "deleted": username}
    raise HTTPException(status_code=404, detail="用户不存在")
