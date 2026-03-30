# ── INSIGHT-311 Docker Image ──────────────────────────────
# ML models are mounted as volumes; NOT baked into the image.

FROM python:3.11-slim

# System dependencies for Whisper (ffmpeg), soundfile (libsndfile),
# pyttsx3 (espeak), and psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    espeak \
    libespeak-dev \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install CPU-only PyTorch first (avoids downloading ~700 MB of CUDA libs)
RUN pip install --no-cache-dir torch==2.10.0 --index-url https://download.pytorch.org/whl/cpu

# Install remaining Python dependencies (torch already satisfied)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy language model
RUN python -m spacy download en_core_web_md

# Copy application code (models excluded via .dockerignore)
COPY . .

EXPOSE 8311

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8311"]
