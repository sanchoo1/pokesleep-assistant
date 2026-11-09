"""Automatic audit & diagnostic shadow logger for OCR uploads.

Saves real-world user screenshots and full OCR output JSON to a local, gitignored folder
(data-sources/debug_scans/) so they can be reviewed, annotated, and converted into
authoritative regression test fixtures.
"""

from __future__ import annotations

from datetime import datetime
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[2].parent
SCAN_LOG_DIR = PROJECT_ROOT / "data-sources" / "debug_scans"


def save_ocr_scan_record(
    image_bytes: bytes,
    parsed_result: Any,
    boxes: List[Dict[str, Any]],
    original_filename: Optional[str] = None,
) -> Optional[str]:
    """
    Save the uploaded screenshot and detailed OCR JSON diagnostics locally.
    Returns the generated scan_id (or None if logging encountered any non-fatal issue).
    """
    try:
        SCAN_LOG_DIR.mkdir(parents=True, exist_ok=True)

        now_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        content_hash = hashlib.md5(image_bytes[:4096]).hexdigest()[:6]
        base_name = f"scan_{now_str}_{content_hash}"

        img_path = SCAN_LOG_DIR / f"{base_name}.png"
        json_path = SCAN_LOG_DIR / f"{base_name}.json"

        # 1. Save raw image file
        with open(img_path, "wb") as f:
            f.write(image_bytes)

        # 2. Serialize parsed result
        parsed_dict: Dict[str, Any] = {}
        if hasattr(parsed_result, "model_dump"):
            parsed_dict = parsed_result.model_dump()
        elif hasattr(parsed_result, "dict"):
            parsed_dict = parsed_result.dict()
        elif isinstance(parsed_result, dict):
            parsed_dict = parsed_result

        # 3. Save comprehensive diagnostic log
        log_data = {
            "scanId": base_name,
            "timestamp": datetime.now().isoformat(),
            "originalFilename": original_filename,
            "imagePath": str(img_path.relative_to(PROJECT_ROOT)),
            "imageSizeBytes": len(image_bytes),
            "parsed": parsed_dict,
            "rawBoxesCount": len(boxes),
            "rawBoxes": boxes,
        }

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(log_data, f, ensure_ascii=False, indent=2)

        return base_name
    except Exception as e:
        # Non-fatal: Never fail the user request if local disk logging hits an error
        print(f"[AuditLogger] Warning: failed to save debug scan: {e}")
        return None
