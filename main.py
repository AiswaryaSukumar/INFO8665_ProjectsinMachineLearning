import time
import uuid as _uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

# Logging & metrics setup — must be called before any logger is created
from logging_config import setup_logging, get_logger
setup_logging()

from metrics import active_sessions  # noqa: E402
from prometheus_fastapi_instrumentator import Instrumentator  # noqa: E402
from config import WHISPER_MODEL_SIZE, APP_PORT  # noqa: E402

# Import our new consolidated services
from ticket_service.main import router as ticket_router
from orchestrator.main import orchestrator_router, voice_router
from nlp_service.main import NLUProcessor
from orchestrator.main import initialize_directories
from stt_service.main import initialize_stt_dirs

logger = get_logger("insight311.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 0. Initialize necessary directories
    initialize_directories()
    initialize_stt_dirs()

    # Load ML Models once on startup
    logger.info("loading_ml_models")

    # 1. Load Whisper
    import whisper
    logger.info("loading_whisper_stt model_size=%s", WHISPER_MODEL_SIZE)
    app.state.whisper_model = whisper.load_model(WHISPER_MODEL_SIZE)

    # 2. Load NLU Processor (DistilBERT + Pipelines)
    logger.info("loading_nlu_processor")
    app.state.nlu_processor = NLUProcessor(use_ml_classifier=True)

    logger.info("ml_models_loaded docs_url=http://localhost:%d/docs", APP_PORT)
    yield
    # Cleanup on shutdown
    app.state.whisper_model = None
    app.state.nlu_processor = None
    logger.info("ml_models_cleaned_up")

app = FastAPI(
    title="INSIGHT311 API",
    description="Next-generation NLU Service with Orchestration",
    version="2.0.0",
    lifespan=lifespan,
)

# --- Prometheus auto-instrumentation ---
Instrumentator(
    should_group_status_codes=True,
    should_ignore_untemplated=True,
    excluded_handlers=["/metrics", "/health"],
).instrument(app).expose(app, include_in_schema=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Transcript", "X-Response-Text", "X-Current-State"],
)


# --- Correlation-ID middleware ---
@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(_uuid.uuid4()))

    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)

    logger.info(
        "http_request method=%s path=%s status=%s duration_ms=%s",
        request.method, request.url.path, response.status_code, duration_ms,
    )
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("unhandled_exception path=%s error=%s", request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
    )

@app.get("/")
def health_check():
    return {
        "service": "INSIGHT311 NLU Service",
        "version": "2.0.0",
        "status": "running",
    }

# Registering Routers from our new consolidated services
app.include_router(orchestrator_router, prefix="/api/orchestrator", tags=["Orchestrator"])
app.include_router(ticket_router, prefix="/api/tickets", tags=["Tickets"])
app.include_router(voice_router, prefix="/api/voice", tags=["Voice ML Processing"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=APP_PORT, reload=False)
