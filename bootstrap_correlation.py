import os
from pathlib import Path

BASE_DIR = Path("c:/Users/gunda/OneDrive/Desktop/aifusion/backend")

files = {
    "app/models/incident_model.py": """import uuid
from typing import Optional
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

class AnalysisResult(BaseModel):
    root_cause: str
    recommendation: str
    confidence: float
    severity_explanation: str
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
        occurrence_count=1
    )
    
    await db.incidents.insert_one(incident.dict())
    
    ws_payload = {
        "event": "new_incident",
        "incident_id": incident.incident_id,
        "severity": incident.severity,
        "summary": incident.root_cause or "Pending analysis"
    }
    asyncio.create_task(manager.broadcast(ws_payload))
    
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
"""
}

for filepath, content in files.items():
    full_path = BASE_DIR / filepath
    full_path.parent.mkdir(parents=True, exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Incident correlation system generated successfully!")
