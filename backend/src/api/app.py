from contextlib import asynccontextmanager
import os
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.routes import orchestrator_routes, ticket_routes, voice_routes


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup behavior:
    - Load ML models by default
    - Only skip ML if SKIP_ML_INIT=true is explicitly set
    """
    skip_ml = os.getenv("SKIP_ML_INIT", "false").lower() == "true"

    if skip_ml:
        print("Starting INSIGHT311 backend with ML loading skipped...")
        app.state.whisper_model = None
        app.state.nlu_processor = None
    else:
        print("🚀 Loading ML Models into Application State...")

        import whisper
        print("Loading Whisper STT engine (small)...")
        app.state.whisper_model = whisper.load_model("small")

        from src.ai_orchestration.nlu.nlu_processor import NLUProcessor
        print("Loading NLU Processor Engine...")
        app.state.nlu_processor = NLUProcessor(use_ml_classifier=True)

        print("✅ All ML Models loaded successfully!")

    yield

    app.state.whisper_model = None
    app.state.nlu_processor = None
    print("🛑 Backend shutdown complete.")


app = FastAPI(
    title="INSIGHT311 API",
    description="Next-generation NLU Service with Orchestration",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Transcript", "X-Response-Text", "X-Current-State"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = traceback.format_exc()
    print("GLOBAL ERROR:", error_msg)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "traceback": error_msg},
    )


@app.get("/")
def health_check():
    return {
        "service": "INSIGHT311 NLU Service",
        "version": "2.0.0",
        "status": "running",
        "phase": "phase-1-backend",
        "ml_loaded": bool(
            getattr(app.state, "whisper_model", None)
            and getattr(app.state, "nlu_processor", None)
        ),
        "skip_ml_init": os.getenv("SKIP_ML_INIT", "false").lower() == "true",
    }


app.include_router(
    orchestrator_routes.router,
    prefix="/api/orchestrator",
    tags=["Orchestrator"],
)
app.include_router(
    ticket_routes.router,
    prefix="/api/tickets",
    tags=["Tickets"],
)
app.include_router(
    voice_routes.router,
    prefix="/api/voice",
    tags=["Voice ML Processing"],
)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.api.app:app", host="0.0.0.0", port=8311, reload=True)