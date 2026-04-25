from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import traceback

# Import our new consolidated services
from ticket_service.main import router as ticket_router
from ticket_service.duplicates import router as duplicates_router
from ticket_service.monitoring import router as monitoring_router
from orchestrator.main import orchestrator_router, voice_router
from nlp_service.main import NLUProcessor
from orchestrator.main import initialize_directories
from stt_service.main import initialize_stt_dirs
from orchestrator.test_router import test_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 0. Initialize necessary directories
    initialize_directories()
    initialize_stt_dirs()
    
    # Load ML Models once on startup
    print("🚀 Loading ML Models into Application State...")
    
    # 1. Load Whisper
    import whisper
    print("Loading Whisper STT engine (small)...")
    app.state.whisper_model = whisper.load_model("small")
    
    # 2. Load NLU Processor (DistilBERT + Pipelines)
    print("Loading NLU Processor Engine...")
    app.state.nlu_processor = NLUProcessor(use_ml_classifier=True)

    # 3. Pre-warm ML sentiment model (RoBERTa twitter-sentiment)
    print("Pre-warming ML sentiment model...")
    app.state.nlu_processor.sentiment_analyzer.ml_model._load()

    # 4. Pre-warm NER confidence model (bert-base-NER)
    print("Pre-warming NER confidence model...")
    app.state.nlu_processor.entity_extractor.ner_confidence._load()

    print("✅ All ML Models loaded successfully!")
    print("\n" + "="*50)
    print("🌐 Server is running! Click the links below to test:")
    print("👉 http://localhost:8311/docs         ← Swagger API")
    print("👉 http://localhost:8311/api/test/ui  ← Call Test UI")
    print("="*50 + "\n")
    yield
    # Cleanup on shutdown
    app.state.whisper_model = None
    app.state.nlu_processor = None
    print("🛑 ML Models cleaned up.")

app = FastAPI(
    title="INSIGHT311 API",
    description="Next-generation NLU Service with Orchestration",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Transcript", "X-Response-Text", "X-Current-State",
                    "Content-Range", "Content-Length", "Accept-Ranges"]
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
        "status": "running"
    }

# Registering Routers from our new consolidated services
app.include_router(orchestrator_router, prefix="/api/orchestrator", tags=["Orchestrator"])
app.include_router(ticket_router, prefix="/api/tickets", tags=["Tickets"])
app.include_router(duplicates_router, prefix="/api/duplicates", tags=["Duplicates"])
app.include_router(voice_router, prefix="/api/voice", tags=["Voice ML Processing"])
app.include_router(monitoring_router, prefix="/api/monitoring", tags=["Monitoring"])
app.include_router(test_router, prefix="/api/test", tags=["Test UI"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8311, reload=False)
