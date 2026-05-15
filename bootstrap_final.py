import os
from pathlib import Path

BASE_DIR = Path("c:/Users/gunda/OneDrive/Desktop/aifusion/backend")

files = {
    "app/database/mongodb.py": """from motor.motor_asyncio import AsyncIOMotorClient
from typing import List, Optional, Dict, Any
import logging
from app.config.settings import settings

logger = logging.getLogger(__name__)

class MongoDB:
    client: AsyncIOMotorClient = None
    
    @classmethod
    def connect(cls):
        try:
            cls.client = AsyncIOMotorClient(
                settings.mongodb_url,
                maxPoolSize=10,
                minPoolSize=1
            )
            logger.info("Connected to MongoDB successfully.")
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise
            
    @classmethod
    def disconnect(cls):
        if cls.client:
            cls.client.close()
            logger.info("Disconnected from MongoDB.")
            
    @classmethod
    def get_db(cls):
        if not cls.client:
            cls.connect()
        return cls.client[settings.db_name]

# Helper Proxy to allow older code doing `from app.database.mongodb import db` to work seamlessly
class DbProxy:
    def __getattr__(self, name):
        return MongoDB.get_db()[name]
db = DbProxy()

class IncidentRepository:
    def __init__(self):
        self.collection = MongoDB.get_db()["incidents"]
        
    async def create(self, incident: dict) -> str:
        result = await self.collection.insert_one(incident)
        return incident.get("incident_id", str(result.inserted_id))
        
    async def find_all(self, filters: dict = {}, limit: int = 20) -> List[dict]:
        cursor = self.collection.find(filters).limit(limit).sort("created_at", -1)
        return await cursor.to_list(length=limit)
        
    async def find_by_id(self, incident_id: str) -> Optional[dict]:
        return await self.collection.find_one({"incident_id": incident_id})
        
    async def update(self, incident_id: str, updates: dict) -> bool:
        result = await self.collection.update_one(
            {"incident_id": incident_id},
            {"$set": updates}
        )
        return result.modified_count > 0
        
    async def delete(self, incident_id: str) -> bool:
        result = await self.collection.delete_one({"incident_id": incident_id})
        return result.deleted_count > 0
        
    async def count(self, filters: dict = {}) -> int:
        return await self.collection.count_documents(filters)

class AIAnalysisRepository:
    def __init__(self):
        self.collection = MongoDB.get_db()["ai_analysis"]
        
    async def save_analysis(self, incident_id: str, analysis: dict) -> bool:
        doc = {
            "incident_id": incident_id,
            "analysis": analysis
        }
        result = await self.collection.update_one(
            {"incident_id": incident_id},
            {"$set": doc},
            upsert=True
        )
        return result.modified_count > 0 or result.upserted_id is not None
        
    async def get_analysis(self, incident_id: str) -> Optional[dict]:
        doc = await self.collection.find_one({"incident_id": incident_id})
        if doc:
            return doc.get("analysis")
        return None
""",
    "app/utils/logger.py": """import logging
import os
import sys

def setup_logger():
    logger = logging.getLogger("app")
    
    env = os.environ.get("ENV", "development")
    log_level = logging.DEBUG if env == "development" else logging.INFO
    logger.setLevel(log_level)
    
    if logger.handlers:
        return logger

    formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] [%(module)s] %(message)s")
    
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(log_level)
    ch.setFormatter(formatter)
    logger.addHandler(ch)
    
    log_dir = "logs"
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)
        
    fh = logging.FileHandler(os.path.join(log_dir, "app.log"))
    fh.setLevel(log_level)
    fh.setFormatter(formatter)
    logger.addHandler(fh)
    
    return logger

app_logger = setup_logger()

def log_incident_created(incident_id: str, severity: str, service: str):
    app_logger.info(f"New incident created: {incident_id} | Service: {service} | Severity: {severity}")

def log_ai_analysis(incident_id: str, confidence: float):
    app_logger.info(f"AI analysis completed for {incident_id} with confidence {confidence}%")

def log_error(context: str, error: Exception):
    app_logger.error(f"Error in {context}: {str(error)}", exc_info=True)
""",
    "Dockerfile": """# Stage 1: Builder
FROM python:3.11-slim as builder

WORKDIR /build
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim

WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . .

ENV PATH=/root/.local/bin:$PATH
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
""",
    "docker-compose.yml": """version: '3.8'

services:
  backend:
    build: .
    ports:
      - "8000:8000"
    env_file:
      - .env
    environment:
      - MONGODB_URL=mongodb://mongodb:27017
    depends_on:
      - mongodb
    volumes:
      - ./logs:/app/logs
      - ./app/rag/faiss_index:/app/app/rag/faiss_index

  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

volumes:
  mongodb_data:
""",
    "README.md": """# AI DevOps Incident Autopilot — Backend

FastAPI backend for an AI-driven, automated DevOps incident management system.

## Architecture Overview

```text
[ Client / Dashboard ]
       |  (REST / JSON)
       v
+-----------------------------+
|        FastAPI Router       | (incidents, chat, metrics, simulate)
+-----------------------------+
       |             |
       v             v
[ Severity ]   [ RAG Retriever ] <--> [ FAISS Index ]
[  Engine  ]         |                (kubernetes, redis, etc. docs)
       |             |
       v             v
+-----------------------------+
|    OpenAI Service Layer     | (GPT-4o-mini)
+-----------------------------+
             |
             v
      [ MongoDB ] (Incidents, AI Analysis)
```

## Quick Start

1. **Clone the repo**
2. **Setup environment variables**
   Create a `.env` file in the root directory:
   ```env
   OPENAI_API_KEY=your-openai-api-key-here
   MONGODB_URL=mongodb://mongodb:27017
   DB_NAME=devops_autopilot
   ENV=development
   ```
3. **Run with Docker Compose**
   ```bash
   docker-compose up --build
   ```
   The API will be available at `http://localhost:8000`.

## API Reference

### Incidents
- `GET /api/incidents/`
  *Returns list of incidents.*
  ```bash
  curl "http://localhost:8000/api/incidents/?limit=5"
  ```
- `POST /api/incidents/analyze`
  *Main endpoint to evaluate metrics and return AI analysis.*
  ```bash
  curl -X POST "http://localhost:8000/api/incidents/analyze" -H "Content-Type: application/json" -d '{"service": "redis", "cpu": 95.0, "memory": 90.0, "restart_count": 5, "logs": "OOMKilled"}'
  ```
- `PATCH /api/incidents/{id}/resolve`
- `DELETE /api/incidents/{id}`

### Chat
- `POST /api/chat/`
  *Chat with the AI SRE.*
  ```bash
  curl -X POST "http://localhost:8000/api/chat/" -H "Content-Type: application/json" -d '{"message": "Why is redis crashing?", "session_id": "session123"}'
  ```
- `GET /api/chat/history/{session_id}`
- `DELETE /api/chat/history/{session_id}`

### Metrics & Simulation
- `GET /api/metrics/summary/overview`
- `POST /api/simulate/`
  *Triggers a mock failure and automatically analyzes it.*
  ```bash
  curl -X POST "http://localhost:8000/api/simulate/" -H "Content-Type: application/json" -d '{"type": "redis_failure"}'
  ```

## RAG System
The Retrieval-Augmented Generation (RAG) system runs entirely locally via FAISS. On startup, it reads troubleshooting manuals from `app/rag/docs/`, chunks them into 400-token blocks, and embeds them using OpenAI's `text-embedding-3-small`.
**Indexed Docs:**
- `kubernetes_crashes.txt`
- `redis_failures.txt`
- `memory_leaks.txt`
- `deployment_rollbacks.txt`

## Severity Engine
Deterministic rules applied *before* the AI analysis. Highest matching tier wins.

| Severity | Score  | Rule triggers |
|----------|--------|---------------|
| **CRITICAL** | 90-100 | CPU>90 & Restarts>5, Restarts>10, Mem>95, OOMKilled, CrashLoopBackOff |
| **HIGH**     | 70-89  | CPU>80 or Mem>85, Restarts>5, Timeout w/ CPU>70, Connection Refused |
| **MEDIUM**   | 40-69  | CPU>60 or Mem>70, Restarts>2, Any error in logs |
| **LOW**      | 10-39  | Any restart > 0, Any log content present |

## Environment Variables
| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Your OpenAI secret key |
| `MONGODB_URL` | Connection string for MongoDB |
| `DB_NAME` | Target database name |
| `ENV` | Environment (`development` or `production`) |

## Project Structure
```text
backend/
├── app/
│   ├── ai/          (OpenAI logic and Prompts)
│   ├── config/      (Pydantic Settings)
│   ├── database/    (MongoDB logic)
│   ├── models/      (Pydantic schemas)
│   ├── rag/         (FAISS, Embeddings, Docs)
│   ├── routes/      (FastAPI Endpoints)
│   ├── services/    (Severity Engine)
│   ├── utils/       (Logging)
│   └── main.py      (App entrypoint & lifespan)
├── logs/            (Persistent log files)
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── README.md
```
""",
    "app/main.py": """from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.routes import incidents, chat, metrics, simulate
from app.rag.vector_store import init_vector_store
from app.database.mongodb import MongoDB
from app.utils.logger import app_logger

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Connect to MongoDB
    MongoDB.connect()
    
    # 2. Initialize FAISS vector store
    app_logger.info("Initializing vector store...")
    init_vector_store()
    
    # 3. Log Backend ready
    app_logger.info("Backend ready and serving requests.")
    
    yield
    
    # 4. Disconnect MongoDB on shutdown
    MongoDB.disconnect()
    app_logger.info("Backend shutdown complete.")

app = FastAPI(title="AI DevOps Incident Autopilot", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(incidents.router, prefix="/api/incidents", tags=["incidents"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(metrics.router, prefix="/api/metrics", tags=["metrics"])
app.include_router(simulate.router, prefix="/api/simulate", tags=["simulate"])

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
"""
}

for filepath, content in files.items():
    full_path = BASE_DIR / filepath
    full_path.parent.mkdir(parents=True, exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Final files generated successfully!")
