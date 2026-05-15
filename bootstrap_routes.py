import os
from pathlib import Path

BASE_DIR = Path("c:/Users/gunda/OneDrive/Desktop/aifusion/backend")

files = {
    "app/models/request_models.py": """from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

class AnalyzeRequest(BaseModel):
    service: str
    cpu: float
    memory: float
    restart_count: int
    logs: str

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None
    session_id: str = "default"

class ChatResponse(BaseModel):
    response: str
    incident_id: Optional[str] = None

class SimulateRequest(BaseModel):
    type: Literal["redis_failure", "memory_leak", "pod_crash", "deployment_failure"]

class MetricsResponse(BaseModel):
    service: str
    cpu: float
    memory: float
    restart_count: int
    timestamp: datetime
""",
    "app/routes/incidents.py": """from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from datetime import datetime
from app.models.request_models import AnalyzeRequest
from app.models.incident_model import IncidentResponse
from app.database.mongodb import db
from app.services.severity_engine import SeverityEngine
from app.rag.retriever import RAGRetriever
from app.rag.vector_store import vector_store
from app.ai.openai_service import OpenAIService

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

@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(incident_id: str):
    doc = await db.incidents.find_one({"incident_id": incident_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Incident not found")
    return IncidentResponse(**doc)

@router.post("/analyze", response_model=IncidentResponse)
async def analyze_incident_endpoint(request: AnalyzeRequest):
    # 1. Run SeverityEngine.evaluate()
    severity_result = severity_engine.evaluate(
        request.cpu, request.memory, request.restart_count, request.logs
    )
    
    # 2. Run RAGRetriever.retrieve() with logs as query
    retriever = RAGRetriever(vector_store)
    retrieved_docs = retriever.retrieve(request.logs)
    
    # 3. Run OpenAIService.analyze_incident()
    analysis = await ai_service.analyze_incident(
        service=request.service,
        cpu=request.cpu,
        memory=request.memory,
        restart_count=request.restart_count,
        logs=request.logs,
        severity=severity_result.level.value,
        retrieved_docs=retrieved_docs
    )
    
    # 4. Build IncidentResponse
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
        created_at=datetime.utcnow()
    )
    
    # 5. Save to MongoDB
    await db.incidents.insert_one(incident.dict())
    
    # 6. Return IncidentResponse
    return incident

@router.patch("/{incident_id}/resolve", response_model=IncidentResponse)
async def resolve_incident(incident_id: str):
    result = await db.incidents.find_one_and_update(
        {"incident_id": incident_id},
        {"$set": {"status": "RESOLVED"}},
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
    "app/routes/chat.py": """from fastapi import APIRouter, HTTPException
from typing import Dict, List
from app.models.request_models import ChatRequest, ChatResponse
from app.ai.openai_service import OpenAIService

router = APIRouter()
ai_service = OpenAIService()

# In-memory dictionary for session state: session_id -> list of messages
sessions: Dict[str, List[Dict[str, str]]] = {}

@router.post("/", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    session_id = request.session_id
    
    if session_id not in sessions:
        sessions[session_id] = []
        
    history = sessions[session_id]
    
    # Handle optional context integration cleanly
    if request.context:
         history.append({"role": "system", "content": f"Context update: {request.context}"})
    
    # Process Chat Request
    response_text = await ai_service.chat(request.message, history)
    
    # Save conversation state
    history.append({"role": "user", "content": request.message})
    history.append({"role": "assistant", "content": response_text})
    
    return ChatResponse(response=response_text, incident_id=None)

@router.get("/history/{session_id}")
async def get_history(session_id: str):
    if session_id not in sessions:
        return {"history": []}
    return {"history": sessions[session_id]}

@router.delete("/history/{session_id}")
async def clear_history(session_id: str):
    if session_id in sessions:
        del sessions[session_id]
    return {"deleted": True}
""",
    "app/routes/metrics.py": """from fastapi import APIRouter, HTTPException
from typing import List
import random
from datetime import datetime
from app.models.request_models import MetricsResponse

router = APIRouter()

SERVICES = ["payment-service", "auth-service", "order-service", "notification-service"]

def generate_mock_metrics(service: str) -> MetricsResponse:
    return MetricsResponse(
        service=service,
        cpu=round(random.uniform(10.0, 95.0), 2),
        memory=round(random.uniform(20.0, 98.0), 2),
        restart_count=random.randint(0, 15),
        timestamp=datetime.utcnow()
    )

@router.get("/", response_model=List[MetricsResponse])
async def get_all_metrics():
    return [generate_mock_metrics(svc) for svc in SERVICES]

@router.get("/summary/overview")
async def get_metrics_summary():
    metrics = [generate_mock_metrics(svc) for svc in SERVICES]
    
    total_incidents = sum(m.restart_count for m in metrics)
    critical_count = sum(1 for m in metrics if m.cpu > 85 or m.memory > 90)
    avg_cpu = sum(m.cpu for m in metrics) / len(metrics)
    avg_memory = sum(m.memory for m in metrics) / len(metrics)
    
    most_affected = max(metrics, key=lambda x: x.restart_count).service
    
    return {
        "total_incidents": total_incidents,
        "critical_count": critical_count,
        "avg_cpu": round(avg_cpu, 2),
        "avg_memory": round(avg_memory, 2),
        "most_affected_service": most_affected
    }

@router.get("/{service}", response_model=MetricsResponse)
async def get_service_metrics(service: str):
    if service not in SERVICES:
        raise HTTPException(status_code=404, detail="Service not found")
    return generate_mock_metrics(service)
""",
    "app/routes/simulate.py": """from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from app.models.request_models import SimulateRequest, AnalyzeRequest
from app.models.incident_model import IncidentResponse
from app.routes.incidents import analyze_incident_endpoint

router = APIRouter()

SIMULATIONS = {
    "redis_failure": {
        "service": "payment-service", 
        "cpu": 78.0, 
        "memory": 82.0,
        "restart_count": 8, 
        "logs": "FATAL Redis connection refused ECONNREFUSED 127.0.0.1:6379\\nError: connect ECONNREFUSED\\nRedis client lost connection"
    },
    "memory_leak": {
        "service": "order-service", 
        "cpu": 45.0, 
        "memory": 96.0,
        "restart_count": 3, 
        "logs": "OOMKilled: Container exceeded memory limit 512Mi\\nJava heap space OutOfMemoryError"
    },
    "pod_crash": {
        "service": "auth-service", 
        "cpu": 91.0, 
        "memory": 88.0,
        "restart_count": 12, 
        "logs": "CrashLoopBackOff: Back-off restarting failed container\\nLiveness probe failed: HTTP probe failed with statuscode: 503"
    },
    "deployment_failure": {
        "service": "notification-service", 
        "cpu": 65.0, 
        "memory": 71.0,
        "restart_count": 2, 
        "logs": "Deployment rollout failed: deadline exceeded\\nImagePullBackOff: Back-off pulling image nginx:broken-tag"
    }
}

@router.post("/", response_model=IncidentResponse)
async def simulate_incident(request: SimulateRequest):
    if request.type not in SIMULATIONS:
        raise HTTPException(status_code=400, detail="Invalid simulation type")
        
    sim_data = SIMULATIONS[request.type]
    
    analyze_req = AnalyzeRequest(
        service=sim_data["service"],
        cpu=sim_data["cpu"],
        memory=sim_data["memory"],
        restart_count=sim_data["restart_count"],
        logs=sim_data["logs"]
    )
    
    return await analyze_incident_endpoint(analyze_req)

@router.get("/types", response_model=List[Dict[str, Any]])
async def get_simulation_types():
    return [
        {"type": "redis_failure", "description": "Simulates a Redis connection refusal"},
        {"type": "memory_leak", "description": "Simulates an OOMKilled event with Java heap space error"},
        {"type": "pod_crash", "description": "Simulates a CrashLoopBackOff due to liveness probe failure"},
        {"type": "deployment_failure", "description": "Simulates an ImagePullBackOff and rollout failure"}
    ]
"""
}

for filepath, content in files.items():
    full_path = BASE_DIR / filepath
    full_path.parent.mkdir(parents=True, exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Route files created successfully!")
