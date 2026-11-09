#!/usr/bin/env python3
"""
Sync and optimize official Pokémon Sleep sprite assets from .cache/nerolis-lab
into apps/web/public/images/ for local/non-commercial UI display.
"""
from __future__ import annotations

import shutil
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT / ".cache" / "nerolis-lab" / "frontend" / "public" / "images"
DST_DIR = ROOT / "apps" / "web" / "public" / "images"


def copy_and_resize_dir(
    sub_dir: str,
    max_size: tuple[int, int] | None = None,
    exclude_suffix: str | None = None,
    exclude_prefix: str | None = None,
) -> tuple[int, int]:
    src = SRC_DIR / sub_dir
    dst = DST_DIR / sub_dir
    if not src.exists():
        return 0, 0
    dst.mkdir(parents=True, exist_ok=True)
    count = 0
    total_bytes = 0
    for f in sorted(src.glob("*.png")):
        if exclude_suffix and f.name.endswith(exclude_suffix):
            continue
        if exclude_prefix and f.name.startswith(exclude_prefix):
            continue
        out_path = dst / f.name
        if max_size is None:
            shutil.copy2(f, out_path)
        else:
            with Image.open(f) as im:
                im = im.convert("RGBA")
                im.thumbnail(max_size, Image.Resampling.LANCZOS)
                im.save(out_path, format="PNG", optimize=True)
        count += 1
        total_bytes += out_path.stat().st_size
    return count, total_bytes


def main() -> None:
    if not SRC_DIR.exists():
        raise SystemExit(f"Source image directory not found: {SRC_DIR}")

    total_files = 0
    total_bytes = 0

    # Direct copy small icon sets
    for folder in ("berries", "ingredient", "mainskill", "type", "unit"):
        c, b = copy_and_resize_dir(folder, max_size=(96, 96))
        print(f"[Images] {folder}: {c} files ({b / 1024:.1f} KB)")
        total_files += c
        total_bytes += b

    # Island icons (skip large background-*.png files)
    c, b = copy_and_resize_dir("island", max_size=(128, 128), exclude_prefix="background-")
    print(f"[Images] island: {c} files ({b / 1024:.1f} KB)")
    total_files += c
    total_bytes += b

    # Recipes (128x128 Retina crisp)
    c, b = copy_and_resize_dir("recipe", max_size=(128, 128))
    print(f"[Images] recipe: {c} files ({b / 1024:.1f} KB)")
    total_files += c
    total_bytes += b

    # Pokémon sprites (both normal and shiny, 160x160 Retina crisp)
    c, b = copy_and_resize_dir("pokemon", max_size=(160, 160))
    print(f"[Images] pokemon (normal + shiny): {c} files ({b / 1024:.1f} KB)")
    total_files += c
    total_bytes += b

    print(f"[Images] Done! Synced {total_files} sprites ({total_bytes / (1024 * 1024):.2f} MB total) -> {DST_DIR}")


if __name__ == "__main__":
    main()

