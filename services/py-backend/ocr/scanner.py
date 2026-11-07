"""Image OCR pipeline wrapper using RapidOCR."""

import io
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
from PIL import Image

try:
    from rapidocr_onnxruntime import RapidOCR
    _OCR_ENGINE: Optional[RapidOCR] = RapidOCR()
except Exception:
    _OCR_ENGINE = None

from ocr.parser import ParsedPokemonResult, parse_ocr_text


def scan_pokemon_image(
    image_input: Union[bytes, Image.Image, np.ndarray]
) -> Tuple[ParsedPokemonResult, List[Dict[str, Any]]]:
    """
    Run OCR on image and parse Pokemon Sleep profile.
    Returns:
        (ParsedPokemonResult, list of detected text boxes [{"box": ..., "text": ..., "score": ...}])
    """
    if _OCR_ENGINE is None:
        raise RuntimeError("RapidOCR is not available.")

    # Convert input to numpy array RGB
    if isinstance(image_input, bytes):
        pil_img = Image.open(io.BytesIO(image_input)).convert("RGB")
        img_np = np.array(pil_img)
    elif isinstance(image_input, Image.Image):
        img_np = np.array(image_input.convert("RGB"))
    elif isinstance(image_input, np.ndarray):
        img_np = image_input
    else:
        raise ValueError(f"Unsupported image type: {type(image_input)}")

    ocr_result, elapse_list = _OCR_ENGINE(img_np)

    boxes: List[Dict[str, Any]] = []
    lines: List[str] = []

    if ocr_result:
        for item in ocr_result:
            box_coords, text, score = item[0], item[1], item[2]
            boxes.append({
                "box": box_coords,
                "text": text,
                "score": float(score),
            })
            lines.append(text)

    parsed_result = parse_ocr_text(lines)
    return parsed_result, boxes
