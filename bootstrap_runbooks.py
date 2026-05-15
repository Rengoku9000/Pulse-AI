import os
from pathlib import Path

BASE_DIR = Path("c:/Users/gunda/OneDrive/Desktop/aifusion/backend")

files = {
    "app/models/runbook_model.py": """from pydantic import BaseModel, Field
from typing import List, Optional
from bson import ObjectId

class PyObjectId(str):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate
    @classmethod
    def validate(cls, v):
        return str(v)

class RunbookBase(BaseModel):
    pattern: str
    steps: List[str]

class RunbookCreate(RunbookBase):
    pass

class RunbookResponse(RunbookBase):
    id: PyObjectId = Field(alias="_id")
    
    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}
""",
    "app/models/incident_model.py": """import uuid
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field

def generate_incident_id() -> str:
    return f"INC-{uuid.uuid4().hex[:6].upper()}"

class IncidentBase(BaseModel):
    service: str
    cpu_usage: float
    memory_usage: float
    restart_count: int
    logs: str

class IncidentCreate(IncidentBase):
    pass

class IncidentResponse(IncidentBase):
    incident_id: str = Field(default_factory=generate_incident_id)
    severity: str
    status: str = "ACTIVE"
    root_cause: Optional[str] = None
    recommendation: Optional[str] = None
    confidence: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    occurrence_count: int = 1
    resolved_at: Optional[datetime] = None
    runbook_steps: Optional[List[str]] = None

class AnalysisResult(BaseModel):
    root_cause: str
    recommendation: str
    confidence: float
    severity_explanation: str
""",
    "app/routes/runbooks.py": """from fastapi import APIRouter, HTTPException, Depends
from typing import List
from bson import ObjectId
from app.models.runbook_model import RunbookCreate, RunbookResponse
from app.database.mongodb import db

router = APIRouter()

@router.get("/", response_model=List[RunbookResponse])
async def get_runbooks():
    cursor = db.runbooks.find()
    runbooks = await cursor.to_list(length=100)
    # Convert _id to string manually for Pydantic V2 alias parsing if needed
    for r in runbooks:
        r["_id"] = str(r["_id"])
    return [RunbookResponse(**r) for r in runbooks]

@router.post("/", response_model=RunbookResponse)
async def create_runbook(runbook: RunbookCreate):
    existing = await db.runbooks.find_one({"pattern": runbook.pattern})
    if existing:
        raise HTTPException(status_code=400, detail="Runbook for this pattern already exists.")
        
    doc = runbook.dict()
    result = await db.runbooks.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return RunbookResponse(**doc)

@router.get("/{runbook_id}", response_model=RunbookResponse)
async def get_runbook(runbook_id: str):
    try:
        doc = await db.runbooks.find_one({"_id": ObjectId(runbook_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID")
        
    if not doc:
        raise HTTPException(status_code=404, detail="Runbook not found")
    doc["_id"] = str(doc["_id"])
    return RunbookResponse(**doc)

@router.put("/{runbook_id}", response_model=RunbookResponse)
async def update_runbook(runbook_id: str, runbook: RunbookCreate):
    try:
        result = await db.runbooks.find_one_and_update(
            {"_id": ObjectId(runbook_id)},
            {"$set": runbook.dict()},
            return_document=True
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID")
        
    if not result:
        raise HTTPException(status_code=404, detail="Runbook not found")
    result["_id"] = str(result["_id"])
    return RunbookResponse(**result)

@router.delete("/{runbook_id}")
async def delete_runbook(runbook_id: str):
    try:
        result = await db.runbooks.delete_one({"_id": ObjectId(runbook_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID")
        
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Runbook not found")
    return {"deleted": True}
""",
    "app/routes/incidents.py": """from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from datetime import datetime, timedelta
import asyncio
from app.models.request_models import AnalyzeRequest
from app.models.incident_model import IncidentResponse
from app.database.mongodb import db
from app.services.severity_engine import SeverityEngine
from app.rag.retriever import RAGRetriever
from app.rag.vector_store import vector_store
from app.ai.openai_service import OpenAIService
from app.ws.manager import manager
from app.services.notifications import notification_service

router = APIRouter()
severity_engine = SeverityEngine()
ai_service = OpenAIService()

@router.get("/", response_model=List[IncidentResponse])
async def list_incidents(
    status: Optional[str] = None, 
    severity: Optional[str] = None, 
    limit: int = Query(20, ge=1, le=100)
):
    query = {}
    if status:
        query["status"] = status
    if severity:
        query["severity"] = severity
    
    cursor = db.incidents.find(query).limit(limit).sort("created_at", -1)
    incidents = await cursor.to_list(length=limit)
    return [IncidentResponse(**doc) for doc in incidents]

@router.get("/groups")
async def get_incident_groups():
    pipeline = [
        {"$sort": {"created_at": 1}},
        {"$group": {
            "_id": "$service",
            "total_occurrences": {"$sum": {"$ifNull": ["$occurrence_count", 1]}},
            "latest_severity": {"$last": "$severity"},
            "open_incidents": {
                "$sum": {"$cond": [{"$ne": ["$status", "RESOLVED"]}, 1, 0]}
            }
        }}
    ]
    result = await db.incidents.aggregate(pipeline).to_list(length=100)
    return [
        {
            "service": doc["_id"],
            "total_occurrences": doc["total_occurrences"],
            "latest_severity": doc["latest_severity"],
            "open_incidents": doc["open_incidents"]
        } for doc in result
    ]

@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(incident_id: str):
    doc = await db.incidents.find_one({"incident_id": incident_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Incident not found")
    return IncidentResponse(**doc)

@router.post("/analyze", response_model=IncidentResponse)
async def analyze_incident_endpoint(request: AnalyzeRequest):
    thirty_mins_ago = datetime.utcnow() - timedelta(minutes=30)
    existing_incident = await db.incidents.find_one({
        "service": request.service,
        "status": {"$ne": "RESOLVED"},
        "created_at": {"$gte": thirty_mins_ago}
    })
    
    if existing_incident:
        new_logs = existing_incident.get("logs", "") + f"\\n--- New Log at {datetime.utcnow().isoformat()} ---\\n{request.logs}"
        new_count = existing_incident.get("occurrence_count", 1) + 1
        
        await db.incidents.update_one(
            {"_id": existing_incident["_id"]},
            {"$set": {"logs": new_logs, "occurrence_count": new_count}}
        )
        updated = await db.incidents.find_one({"_id": existing_incident["_id"]})
        return IncidentResponse(**updated)

    severity_result = severity_engine.evaluate(
        request.cpu, request.memory, request.restart_count, request.logs
    )
    
    retriever = RAGRetriever(vector_store)
    retrieved_docs = retriever.retrieve(request.logs)
    
    analysis = await ai_service.analyze_incident(
        service=request.service,
        cpu=request.cpu,
        memory=request.memory,
        restart_count=request.restart_count,
        logs=request.logs,
        severity=severity_result.level.value,
        retrieved_docs=retrieved_docs
    )
    
    # Check for matching Runbook
    runbook_steps = None
    root_cause_str = str(analysis.get("root_cause", "")).lower()
    logs_str = request.logs.lower()
    
    runbooks = await db.runbooks.find().to_list(length=100)
    for rb in runbooks:
        pattern = rb["pattern"].lower()
        if pattern in root_cause_str or pattern in logs_str:
            runbook_steps = rb["steps"]
            break
            
    incident = IncidentResponse(
        service=request.service,
        cpu_usage=request.cpu,
        memory_usage=request.memory,
        restart_count=request.restart_count,
        logs=request.logs,
        severity=severity_result.level.value,
        root_cause=analysis.get("root_cause"),
        recommendation=analysis.get("recommendation"),
        confidence=analysis.get("confidence"),
        created_at=datetime.utcnow(),
        occurrence_count=1,
        runbook_steps=runbook_steps
    )
    
    await db.incidents.insert_one(incident.dict())
    
    ws_payload = {
        "event": "new_incident",
        "incident_id": incident.incident_id,
        "severity": incident.severity,
        "summary": incident.root_cause or "Pending analysis",
        "runbook_steps": runbook_steps
    }
    asyncio.create_task(manager.broadcast(ws_payload))
    asyncio.create_task(notification_service.notify(incident))
    
    return incident

@router.patch("/{incident_id}/resolve", response_model=IncidentResponse)
async def resolve_incident(incident_id: str):
    result = await db.incidents.find_one_and_update(
        {"incident_id": incident_id},
        {"$set": {
            "status": "RESOLVED", 
            "resolved_at": datetime.utcnow()
        }},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Incident not found")
    return IncidentResponse(**result)

@router.delete("/{incident_id}")
async def delete_incident(incident_id: str):
    result = await db.incidents.delete_one({"incident_id": incident_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"deleted": True}
""",
    "app/main.py": """from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.routes import incidents, chat, metrics, simulate, auth, ws, admin, runbooks
from app.rag.vector_store import init_vector_store
from app.database.mongodb import MongoDB
from app.utils.logger import app_logger
from app.auth.dependencies import get_current_user

@asynccontextmanager
async def lifespan(app: FastAPI):
    MongoDB.connect()
    app_logger.info("Skipping vector store init (OpenAI quota reached)")
    app_logger.info("Backend ready and serving requests.")
    yield
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

# Open routes
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(ws.router, prefix="/ws", tags=["websocket"])

# Protected routes
app.include_router(
    incidents.router, 
    prefix="/api/incidents", 
    tags=["incidents"],
    dependencies=[Depends(get_current_user)]
)
app.include_router(
    runbooks.router, 
    prefix="/api/runbooks", 
    tags=["runbooks"],
    dependencies=[Depends(get_current_user)]
)
app.include_router(
    chat.router, 
    prefix="/api/chat", 
    tags=["chat"],
    dependencies=[Depends(get_current_user)]
)
app.include_router(
    metrics.router, 
    prefix="/api/metrics", 
    tags=["metrics"],
    dependencies=[Depends(get_current_user)]
)
app.include_router(
    simulate.router, 
    prefix="/api/simulate", 
    tags=["simulate"],
    dependencies=[Depends(get_current_user)]
)
app.include_router(
    admin.router, 
    prefix="/api/admin", 
    tags=["admin"],
    dependencies=[Depends(get_current_user)]
)

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

print("Runbooks feature generated successfully!")
