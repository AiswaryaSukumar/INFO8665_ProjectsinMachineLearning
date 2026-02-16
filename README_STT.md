# INSIGHT-311 Speech-to-Text System

Real-time speech-to-text system integrated with INFO8665_ProjectsinMachineLearning

## 📁 File Structure (Aligned with Team Repository)

```
INFO8665_ProjectsinMachineLearning/
│
├── config/
│   ├── __init__.py
│   └── stt_config.py                    # ✅ STT configuration
│
├── src/
│   ├── database/
│   │   └── models/
│   │       ├── __init__.py
│   │       └── session_model.py         # ✅ Session data models
│   │
│   └── voice-conversion/
│       ├── __init__.py
│       └── speech-to-text/              # ✅ STT system
│           ├── __init__.py
│           ├── audio_capture.py         # Microphone capture
│           ├── stt_processor.py         # Whisper STT
│           ├── audio_merger.py          # Segment merging
│           ├── storage_manager.py       # Storage upload
│           └── session_manager.py       # Session lifecycle
│
├── scripts/
│   └── run_stt_demo.py                  # ✅ Demo execution
│
├── data/
│   ├── temp/sessions/                   # Temporary segments
│   └── processed/audio/                 # Final merged files
│
└── logs/
    └── stt_system.log                   # System logs
```

## 🚀 Installation

### 1. Install ffmpeg (Required)

**Windows:**
```powershell
choco install ffmpeg
# Restart terminal after installation
```

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu:**
```bash
sudo apt-get install ffmpeg
```

### 2. Install Python dependencies

```bash
# Merge requirements_stt.txt into your existing requirements.txt
# Then install:
pip install -r requirements.txt
```

Or install STT dependencies directly:
```bash
pip install openai-whisper SpeechRecognition PyAudio pydub requests python-dotenv
```

### 3. Update .gitignore

Add the contents of `gitignore_additions.txt` to your `.gitignore` file.

## ▶️ Usage

```bash
# Run STT demo
python scripts/run_stt_demo.py
```

**What happens:**
1. System initializes Whisper model
2. Microphone calibrates for background noise
3. You speak → audio captured as segments
4. Each segment is transcribed immediately
5. Press **Ctrl+C** to end call
6. All segments merge into final files
7. Files upload to storage (local by default)
8. Temporary files cleaned up

## 🎯 Features

✅ Real-time audio capture from microphone  
✅ Segment-based storage (each utterance saved separately)  
✅ Whisper AI transcription (>85% accuracy)  
✅ Automatic merging on call completion  
✅ Cloud storage support (S3/Azure/GCS)  
✅ NLU integration ready  
✅ Session management with UUID tracking  
✅ Comprehensive logging  

## 🔧 Configuration

Edit `config/stt_config.py`:

```python
# Whisper model size (affects accuracy & speed)
WHISPER_MODEL_SIZE = "small.en"  # tiny, base, small, medium, large

# Storage type
STORAGE_TYPE = "local"  # s3, azure, gcs, local

# NLU integration
NLU_ENABLED = False  # Set True when NLU service is ready
NLU_SERVICE_URL = "http://localhost:8001/api/nlu/analyze"
```

## 📊 Workflow Integration

This implements **Step 2** of the INSIGHT-311 workflow:

```
1. TTS greeting
2. 👉 Citizen speaks → Audio → STT → Transcript ← YOU ARE HERE
3. NLU analyzes transcript
4. Orchestrator processes information
5. ...
```

## 🔗 Next Steps (Integration)

### Connect to NLU Service

1. Enable NLU in config:
```python
# config/stt_config.py
NLU_ENABLED = True
NLU_SERVICE_URL = "http://localhost:8001/api/nlu/analyze"
```

2. NLU will receive:
```json
POST /api/nlu/analyze
{
  "session_id": "uuid",
  "transcript": "There is a pothole on Main Street",
  "timestamp": "2026-02-16T14:20:00"
}
```

### Add API Endpoints

Create `src/api/routes/stt_routes.py`:
```python
from src.voice_conversion.speech_to_text import STTProcessor

@app.post("/api/stt/transcribe")
async def transcribe_audio(file: UploadFile):
    processor = STTProcessor()
    result = processor.transcribe_file(file.filename)
    return result
```

## 🐛 Troubleshooting

### "FFmpeg not found"
```bash
# Install ffmpeg (see Installation section)
# Restart terminal
ffmpeg -version
```

### "PyAudio import error"
**Windows:**
```bash
pip install pipwin
pipwin install pyaudio
```

**macOS:**
```bash
brew install portaudio
pip install pyaudio
```

### Low transcription accuracy
- Use better microphone
- Reduce background noise
- Upgrade model: `WHISPER_MODEL_SIZE = "medium"`

### "No module named 'src'"
```bash
# Make sure you're running from repository root
cd INFO8665_ProjectsinMachineLearning
python scripts/run_stt_demo.py
```

## 📝 Team Collaboration

### File Locations (Follow Team Structure)
- **Config**: `config/stt_config.py`
- **Models**: `src/database/models/session_model.py`
- **STT Core**: `src/voice-conversion/speech-to-text/`
- **Scripts**: `scripts/run_stt_demo.py`

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/stt-integration

# Add files
git add config/stt_config.py
git add src/database/models/session_model.py
git add src/voice-conversion/speech-to-text/
git add scripts/run_stt_demo.py

# Commit
git commit -m "feat(stt): Add speech-to-text system with Whisper

- Implement audio capture and segment storage
- Add STT processor with Whisper integration
- Create audio/transcript merger
- Add session management
- Configure storage manager

Implements Workflow Step 2"

# Push
git push origin feature/stt-integration
```

## 📞 Support

For questions or issues, contact the team or refer to project documentation in `docs/`.

---

**Version**: 1.0.0  
**Last Updated**: February 16, 2026  
**Team**: INSIGHT-311 ML Project
