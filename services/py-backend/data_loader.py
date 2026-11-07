"""Game data loader and entity indexing for Python backend service."""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional
import difflib

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent.parent
GAME_DATA_PATH = PROJECT_ROOT / "packages" / "data" / "src" / "generated" / "game-data.json"
LOCALES_DIR = PROJECT_ROOT / "packages" / "data" / "src" / "generated" / "locales"


class DataLoader:
    def __init__(self, data_path: Optional[Path] = None):
        self.data_path = data_path or GAME_DATA_PATH
        self.raw_data: Dict[str, Any] = {}
        self.pokemon_map: Dict[str, Dict[str, Any]] = {}
        self.pokemon_by_dex: Dict[int, Dict[str, Any]] = {}
        self.nature_map: Dict[str, Dict[str, Any]] = {}
        self.subskill_map: Dict[str, Dict[str, Any]] = {}
        self.ingredient_map: Dict[str, Dict[str, Any]] = {}
        self.recipe_map: Dict[str, Dict[str, Any]] = {}
        self.reload()

    def reload(self):
        if not self.data_path.exists():
            raise FileNotFoundError(f"Game data file not found at: {self.data_path}")

        with open(self.data_path, "r", encoding="utf-8") as f:
            self.raw_data = json.load(f)

        # 1. Index Pokémon
        self.pokemon_map.clear()
        self.pokemon_by_dex.clear()
        for p in self.raw_data.get("pokemon", []):
            self.pokemon_map[p["name"].lower()] = p
            self.pokemon_map[p["displayName"].lower()] = p
            if p["pokedexNumber"] not in self.pokemon_by_dex:
                self.pokemon_by_dex[p["pokedexNumber"]] = p
            for trans in p.get("translations", {}).values():
                if trans:
                    self.pokemon_map[trans.lower()] = p

        # 2. Index Natures
        self.nature_map.clear()
        for n in self.raw_data.get("natures", []):
            self.nature_map[n["name"].lower()] = n
            for trans in n.get("translations", {}).values():
                if trans:
                    self.nature_map[trans.lower()] = n

        # 3. Index Subskills
        self.subskill_map.clear()
        for s in self.raw_data.get("subskills", []):
            self.subskill_map[s["name"].lower()] = s
            self.subskill_map[s["shortName"].lower()] = s
            for trans in s.get("translations", {}).values():
                if trans:
                    self.subskill_map[trans.lower()] = s
            for al in s.get("aliases", []):
                self.subskill_map[al.lower()] = s

        # 4. Index Ingredients
        self.ingredient_map.clear()
        for ing in self.raw_data.get("ingredients", []):
            self.ingredient_map[ing["name"].lower()] = ing
            self.ingredient_map[ing["longName"].lower()] = ing
            for trans in ing.get("translations", {}).values():
                if trans:
                    self.ingredient_map[trans.lower()] = ing
            for al in ing.get("aliases", []):
                self.ingredient_map[al.lower()] = ing

        # 5. Index Recipes
        self.recipe_map.clear()
        for r in self.raw_data.get("recipes", []):
            self.recipe_map[r["name"].lower()] = r
            self.recipe_map[r["displayName"].lower()] = r
            for trans in r.get("translations", {}).values():
                if trans:
                    self.recipe_map[trans.lower()] = r
            for al in r.get("aliases", []):
                self.recipe_map[al.lower()] = r

    def get_pokemon(self, name_or_query: str) -> Optional[Dict[str, Any]]:
        clean = name_or_query.strip().lower()
        if clean in self.pokemon_map:
            return self.pokemon_map[clean]
        # Fuzzy fallback
        matches = difflib.get_close_matches(clean, self.pokemon_map.keys(), n=1, cutoff=0.7)
        if matches:
            return self.pokemon_map[matches[0]]
        return None

    def get_nature(self, name_or_query: str) -> Optional[Dict[str, Any]]:
        clean = name_or_query.strip().lower()
        if clean in self.nature_map:
            return self.nature_map[clean]
        matches = difflib.get_close_matches(clean, self.nature_map.keys(), n=1, cutoff=0.7)
        if matches:
            return self.nature_map[matches[0]]
        return None

    def get_subskill(self, name_or_query: str) -> Optional[Dict[str, Any]]:
        clean = name_or_query.strip().lower()
        if clean in self.subskill_map:
            return self.subskill_map[clean]
        matches = difflib.get_close_matches(clean, self.subskill_map.keys(), n=1, cutoff=0.65)
        if matches:
            return self.subskill_map[matches[0]]
        return None

    def get_ingredient(self, name_or_query: str) -> Optional[Dict[str, Any]]:
        clean = name_or_query.strip().lower()
        if clean in self.ingredient_map:
            return self.ingredient_map[clean]
        matches = difflib.get_close_matches(clean, self.ingredient_map.keys(), n=1, cutoff=0.65)
        if matches:
            return self.ingredient_map[matches[0]]
        return None

    def get_recipe(self, name_or_query: str) -> Optional[Dict[str, Any]]:
        clean = name_or_query.strip().lower()
        if clean in self.recipe_map:
            return self.recipe_map[clean]
        matches = difflib.get_close_matches(clean, self.recipe_map.keys(), n=1, cutoff=0.7)
        if matches:
            return self.recipe_map[matches[0]]
        return None


# Global singleton
DATA_LOADER = DataLoader()
