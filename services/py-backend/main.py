"""FastAPI Backend microservice for Pokémon Sleep Assistant."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ocr.router import router as ocr_router
from optimizer.router import router as optimizer_router

app = FastAPI(
    title="Pokémon Sleep Assistant API",
    version="0.1.0",
    description="Microservice providing OCR scanning, text parsing, and LP meal optimization.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ocr_router)
app.include_router(optimizer_router)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "pokesleep-backend", "version": "0.1.0"}


@app.get("/api/health")
def api_health_check():
    return {"status": "ok", "service": "pokesleep-backend", "version": "0.1.0"}
