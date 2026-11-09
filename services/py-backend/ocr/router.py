"""FastAPI router for OCR endpoints."""

import io
from typing import List, Optional
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

from ocr.parser import ParsedPokemonResult, parse_ocr_text
from ocr.scanner import scan_pokemon_image
from ocr.audit_logger import save_ocr_scan_record

router = APIRouter(prefix="/api/ocr", tags=["ocr"])


class ParseTextRequest(BaseModel):
    text: Optional[str] = None
    lines: Optional[List[str]] = None


class ScanImageResponse(BaseModel):
    parsed: ParsedPokemonResult
    boxes: List[dict]


@router.post("/parse-text", response_model=ParsedPokemonResult)
async def api_parse_text(request: ParseTextRequest):
    """Parse text lines from OCR into structured Pokemon Sleep profile with fuzzy correction."""
    lines: List[str] = []
    if request.lines:
        lines = request.lines
    elif request.text:
        lines = [line.strip() for line in request.text.splitlines() if line.strip()]

    if not lines:
        raise HTTPException(status_code=400, detail="Either 'text' or 'lines' must be provided.")

    return parse_ocr_text(lines)


@router.post("/scan-image", response_model=ScanImageResponse)
async def api_scan_image(file: UploadFile = File(...)):
    """
    Accept an uploaded image file (even without a file extension / with octet-stream MIME),
    validate via PIL, run RapidOCR, and return parsed Pokemon data.
    """
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        with Image.open(io.BytesIO(content)) as im:
            im.verify()
    except (UnidentifiedImageError, Exception):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.")

    try:
        parsed_result, boxes = scan_pokemon_image(content)
        # Automatically record uploaded screenshot and OCR diagnostic logs locally for annotation
        save_ocr_scan_record(
            image_bytes=content,
            parsed_result=parsed_result,
            boxes=boxes,
            original_filename=file.filename,
        )
        return ScanImageResponse(parsed=parsed_result, boxes=boxes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR scan failed: {str(e)}")
