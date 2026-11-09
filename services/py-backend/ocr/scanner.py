"""Image OCR pipeline wrapper using RapidOCR with multi-pass contrast enhancement for faded locked subskills."""

import io
from typing import Any, Dict, List, Optional, Tuple, Union
import cv2
import numpy as np
from PIL import Image

try:
    from rapidocr_onnxruntime import RapidOCR
    _OCR_ENGINE: Optional[RapidOCR] = RapidOCR()
except Exception:
    _OCR_ENGINE = None

from ocr.parser import ParsedPokemonResult, parse_ocr_text


def _box_bounds(box: List[List[float]]) -> Tuple[float, float, float, float]:
    xs = [pt[0] for pt in box]
    ys = [pt[1] for pt in box]
    return min(xs), min(ys), max(xs), max(ys)


def _boxes_overlap_same_text_region(b1: List[List[float]], b2: List[List[float]]) -> bool:
    x1_min, y1_min, x1_max, y1_max = _box_bounds(b1)
    x2_min, y2_min, x2_max, y2_max = _box_bounds(b2)

    h1 = max(1.0, y1_max - y1_min)
    h2 = max(1.0, y2_max - y2_min)
    y_overlap = max(0.0, min(y1_max, y2_max) - max(y1_min, y2_min))
    if y_overlap / min(h1, h2) < 0.5:
        return False

    w1 = max(1.0, x1_max - x1_min)
    w2 = max(1.0, x2_max - x2_min)
    x_overlap = max(0.0, min(x1_max, x2_max) - max(x1_min, x2_min))
    # Either overlapping horizontally or one box is contained inside the wider enhanced text box
    return (x_overlap / min(w1, w2)) >= 0.4


def _enhance_faded_ui_contrast(img_rgb: np.ndarray) -> np.ndarray:
    """
    Locked subskills in Pokémon Sleep are rendered with ~35-40% contrast grey text on white/pale pills.
    Applying CLAHE + gamma darkening brings faded glyphs out clearly for RapidOCR.
    """
    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    # Gamma > 1 darkens mid-grey faded strokes against white background
    lut = np.array([((i / 255.0) ** 1.45) * 255 for i in range(256)], dtype=np.uint8)
    darkened = cv2.LUT(enhanced, lut)
    return cv2.cvtColor(darkened, cv2.COLOR_GRAY2RGB)


def scan_pokemon_image(
    image_input: Union[bytes, Image.Image, np.ndarray]
) -> Tuple[ParsedPokemonResult, List[Dict[str, Any]]]:
    """
    Run multi-pass OCR on image and parse Pokemon Sleep profile using 2D bounding box geometry.
    Returns:
        (ParsedPokemonResult, list of detected text boxes [{"box": ..., "text": ..., "score": ...}])
    """
    if _OCR_ENGINE is None:
        raise RuntimeError("RapidOCR is not available.")

    if isinstance(image_input, bytes):
        pil_img = Image.open(io.BytesIO(image_input)).convert("RGB")
        img_np = np.array(pil_img)
    elif isinstance(image_input, Image.Image):
        img_np = np.array(image_input.convert("RGB"))
    elif isinstance(image_input, np.ndarray):
        img_np = image_input
    else:
        raise ValueError(f"Unsupported image type: {type(image_input)}")

    # Pass 1: Standard RGB pass
    ocr_result_1, _ = _OCR_ENGINE(img_np)
    boxes: List[Dict[str, Any]] = []
    if ocr_result_1:
        for item in ocr_result_1:
            box_coords, text, score = item[0], item[1], item[2]
            boxes.append({
                "box": box_coords,
                "text": str(text),
                "score": float(score),
            })

    # Pass 2: Contrast-enhanced pass for faded locked subskills (only if image is tall enough like a game card)
    h, w = img_np.shape[:2]
    if h >= 400 and w >= 300:
        enhanced_np = _enhance_faded_ui_contrast(img_np)
        ocr_result_2, _ = _OCR_ENGINE(enhanced_np)
        if ocr_result_2:
            for item in ocr_result_2:
                b2, t2, s2 = item[0], str(item[1]).strip(), float(item[2])
                if not t2 or s2 < 0.45:
                    continue
                matched_idx = None
                for idx, existing in enumerate(boxes):
                    if _boxes_overlap_same_text_region(existing["box"], b2):
                        matched_idx = idx
                        break
                if matched_idx is None:
                    boxes.append({"box": b2, "text": t2, "score": s2})
                else:
                    # Prefer enhanced pass when raw pass truncated faded text (e.g. "手" -> "幫手獎勵", "忙速度S" -> "幫忙速度S")
                    old_t = boxes[matched_idx]["text"].strip()
                    if len(t2) > len(old_t) and s2 >= 0.55:
                        boxes[matched_idx] = {"box": b2, "text": t2, "score": s2}

    # Sort boxes top-to-bottom, left-to-right
    boxes.sort(key=lambda b: (_box_bounds(b["box"])[1], _box_bounds(b["box"])[0]))
    lines = [b["text"] for b in boxes]

    parsed_result = parse_ocr_text(lines, boxes=boxes, image_size=(w, h), image_np=img_np)
    return parsed_result, boxes
