import os
from pathlib import Path

BASE_DIR = Path("c:/Users/gunda/OneDrive/Desktop/aifusion/backend")

files = {
    "app/__init__.py": "",
    "app/main.py": """from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import incidents, chat, metrics, simulate
from app.rag.vector_store import init_vector_store

app = FastAPI(title="AI DevOps Incident Autopilot")

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

@app.on_event("startup")
async def startup_event():
    await init_vector_store()

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
""",
    "app/routes/__init__.py": "",
    "app/routes/incidents.py": """from fastapi import APIRouter
from app.models.request_models import IncidentCreate
from app.services.incident_service import handle_new_incident

router = APIRouter()

@router.post("/")
async def create_incident(incident: IncidentCreate):
    return await handle_new_incident(incident)
""",
    "app/routes/chat.py": """from fastapi import APIRouter
from app.models.request_models import ChatRequest
from app.ai.openai_service import get_chat_response

router = APIRouter()

@router.post("/")
async def chat_with_autopilot(request: ChatRequest):
    response = await get_chat_response(request.message)
    return {"response": response}
""",
    "app/routes/metrics.py": """from fastapi import APIRouter
from app.services.metrics_service import get_system_metrics

router = APIRouter()

@router.get("/")
async def get_metrics():
    return await get_system_metrics()
""",
    "app/routes/simulate.py": """from fastapi import APIRouter
from app.models.request_models import SimulateRequest
from app.services.incident_service import simulate_incident

router = APIRouter()

@router.post("/")
async def trigger_simulation(request: SimulateRequest):
    return await simulate_incident(request.type)
""",
    "app/ai/__init__.py": "",
    "app/ai/openai_service.py": """import os
from openai import AsyncOpenAI
from app.config.settings import settings

client = AsyncOpenAI(api_key=settings.openai_api_key)

async def get_chat_response(prompt: str) -> str:
    response = await client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content
""",
    "app/ai/prompts.py": """INCIDENT_ANALYSIS_PROMPT = "Analyze the following incident: {incident_data}"
CHAT_SYSTEM_PROMPT = "You are an AI DevOps Incident Autopilot helping to resolve system issues."
""",
    "app/ai/summarizer.py": """from app.ai.openai_service import get_chat_response

async def summarize_incident(details: str) -> str:
    prompt = f"Summarize this incident briefly: {details}"
    return await get_chat_response(prompt)
""",
    "app/rag/__init__.py": "",
    "app/rag/vector_store.py": """from app.rag.embeddings import get_embeddings
from langchain_community.vectorstores import FAISS

vector_store = None

async def init_vector_store():
    global vector_store
    embeddings = get_embeddings()
    texts = ["Sample kubernetes crash log", "Sample redis failure", "Sample memory leak", "Sample rollback"]
    vector_store = FAISS.from_texts(texts, embeddings)
""",
    "app/rag/embeddings.py": """from langchain_openai import OpenAIEmbeddings
from app.config.settings import settings

def get_embeddings():
    return OpenAIEmbeddings(openai_api_key=settings.openai_api_key)
""",
    "app/rag/retriever.py": """from app.rag.vector_store import vector_store

def retrieve_similar_docs(query: str):
    if vector_store:
        return vector_store.similarity_search(query)
    return []
""",
    "app/rag/docs/kubernetes_crashes.txt": "Kubernetes pod crash due to OOMKilled event.",
    "app/rag/docs/redis_failures.txt": "Redis connection timeout due to high load.",
    "app/rag/docs/memory_leaks.txt": "NodeJS application memory leak causing degraded performance.",
    "app/rag/docs/deployment_rollbacks.txt": "Deployment rolled back due to failed health checks.",
    "app/services/__init__.py": "",
    "app/services/severity_engine.py": """def calculate_severity(incident_data: dict) -> str:
    if "crash" in incident_data.get("description", "").lower():
        return "HIGH"
    return "MEDIUM"
""",
    "app/services/incident_service.py": """from app.models.request_models import IncidentCreate
from app.services.severity_engine import calculate_severity
from app.ai.summarizer import summarize_incident

async def handle_new_incident(incident: IncidentCreate):
    severity = calculate_severity(incident.dict())
    summary = await summarize_incident(incident.description)
    return {"status": "created", "severity": severity, "summary": summary}

async def simulate_incident(incident_type: str):
    return {"status": "simulated", "type": incident_type}
""",
    "app/services/metrics_service.py": """async def get_system_metrics():
    return {"cpu_usage": "45%", "memory_usage": "60%", "active_incidents": 2}
""",
    "app/services/recommendation_engine.py": """def get_recommendations(incident_type: str):
    return ["Check logs", "Restart service"]
""",
    "app/models/__init__.py": "",
    "app/models/incident_model.py": """from pydantic import BaseModel

class Incident(BaseModel):
    id: str
    title: str
    description: str
    severity: str
    status: str
""",
    "app/models/request_models.py": """from pydantic import BaseModel

class IncidentCreate(BaseModel):
    title: str
    description: str

class ChatRequest(BaseModel):
    message: str

class SimulateRequest(BaseModel):
    type: str
""",
    "app/database/__init__.py": "",
    "app/database/mongodb.py": """from motor.motor_asyncio import AsyncIOMotorClient
from app.config.settings import settings

client = AsyncIOMotorClient(settings.mongodb_url)
db = client[settings.db_name]
""",
    "app/utils/__init__.py": "",
    "app/utils/logger.py": """import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
""",
    "app/config/__init__.py": "",
    "app/config/settings.py": """from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    openai_api_key: str = "your_key_here"
    mongodb_url: str = "mongodb://localhost:27017"
    db_name: str = "devops_autopilot"

    class Config:
        env_file = ".env"

settings = Settings()
""",
    "requirements.txt": """fastapi
uvicorn
openai
langchain
faiss-cpu
pymongo
motor
python-dotenv
pydantic
pydantic-settings
tiktoken
langchain-openai
langchain-community
""",
    ".env": """OPENAI_API_KEY=your_key_here
MONGODB_URL=mongodb://localhost:27017
DB_NAME=devops_autopilot
""",
    "Dockerfile": """FROM python:3.10-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
""",
    "README.md": """# AI DevOps Incident Autopilot

FastAPI backend for AI-driven incident management.

## Setup
1. Create virtual environment
2. Install dependencies: `pip install -r requirements.txt`
3. Run: `uvicorn app.main:app --reload`
"""
}

for filepath, content in files.items():
    full_path = BASE_DIR / filepath
    full_path.parent.mkdir(parents=True, exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Project structure created successfully!")
