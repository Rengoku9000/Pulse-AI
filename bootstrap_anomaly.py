import os
from pathlib import Path

BASE_DIR = Path("c:/Users/gunda/OneDrive/Desktop/aifusion/backend")

files = {
    "app/services/anomaly_detector.py": """import numpy as np
from sklearn.ensemble import IsolationForest
from datetime import datetime, timedelta
import asyncio
import logging
from app.database.mongodb import db

logger = logging.getLogger(__name__)

class AnomalyDetector:
    def __init__(self):
        self.model = None
        self.is_ready = False
        self.stats = {}

    async def train_model(self):
        logger.info("Training Anomaly Detector...")
        try:
            twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)
            cursor = db.metrics_history.find({"timestamp": {"$gte": twenty_four_hours_ago}})
            docs = await cursor.to_list(length=10000)
            
            if len(docs) < 50:
                logger.warning(f"Insufficient data for anomaly detection training: {len(docs)} points (need 50)")
                self.is_ready = False
                return

            data = []
            for d in docs:
                data.append([d.get("cpu", 0), d.get("memory", 0), d.get("restart_count", 0)])
                
            X = np.array(data)
            
            self.stats = {
                "cpu_mean": np.mean(X[:,0]), "cpu_std": np.std(X[:,0]) + 1e-9,
                "mem_mean": np.mean(X[:,1]), "mem_std": np.std(X[:,1]) + 1e-9,
                "res_mean": np.mean(X[:,2]), "res_std": np.std(X[:,2]) + 1e-9,
            }
            
            clf = IsolationForest(contamination=0.05, random_state=42)
            clf.fit(X)
            
            self.model = clf
            self.is_ready = True
            logger.info("Anomaly Detector trained successfully.")
        except Exception as e:
            logger.error(f"Failed to train Anomaly Detector: {str(e)}")

    def detect(self, cpu: float, memory: float, restart_count: int) -> dict:
        if not self.is_ready or self.model is None:
            return {"status": "degraded", "message": "Insufficient historical data for anomaly detection (<50 points)."}
            
        X = np.array([[cpu, memory, restart_count]])
        
        prediction = self.model.predict(X)[0]
        score = self.model.score_samples(X)[0] 
        
        is_anomaly = bool(prediction == -1)
        
        contributors = []
        if is_anomaly:
            z_cpu = (cpu - self.stats["cpu_mean"]) / self.stats["cpu_std"]
            z_mem = (memory - self.stats["mem_mean"]) / self.stats["mem_std"]
            z_res = (restart_count - self.stats["res_mean"]) / self.stats["res_std"]
            
            scores = {"cpu": z_cpu, "memory": z_mem, "restarts": z_res}
            for k, v in sorted(scores.items(), key=lambda item: item[1], reverse=True):
                if v > 1.5:
                    contributors.append(k)
            if not contributors:
                contributors = [max(scores, key=scores.get)]
                    
        return {
            "status": "active",
            "is_anomaly": is_anomaly,
            "anomaly_score": round(float(score), 4),
            "contributors": contributors
        }

    async def background_retraining(self):
        while True:
            await asyncio.sleep(1800)
            await self.train_model()

anomaly_detector = AnomalyDetector()
""",
    "app/models/incident_model.py": """import uuid
from typing import Optional, List, Dict, Any
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
    anomaly_result: Optional[Dict[str, Any]] = None

class AnalysisResult(BaseModel):
    root_cause: str
    recommendation: str
    confidence: float
    severity_explanation: str
""",
    "app/models/request_models.py": """from pydantic import BaseModel
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
    incident_id: Optional[str] = None

class AnomalyRequest(BaseModel):
    service: str
    cpu: float
    memory: float
    restart_count: int
""",
    "app/routes/metrics.py": """from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
import random
from datetime import datetime, timedelta
from app.models.request_models import MetricsResponse, AnomalyRequest
from app.database.mongodb import db
from app.services.anomaly_detector import anomaly_detector

router = APIRouter()

SERVICES = ["payment-service", "auth-service", "order-service", "notification-service"]

async def generate_and_save_mock_metrics(service: str, incident_id: Optional[str] = None) -> MetricsResponse:
    metric = MetricsResponse(
        service=service,
        cpu=round(random.uniform(10.0, 95.0), 2),
        memory=round(random.uniform(20.0, 98.0), 2),
        restart_count=random.randint(0, 15),
        timestamp=datetime.utcnow(),
        incident_id=incident_id
    )
    await db.metrics_history.insert_one(metric.dict())
    return metric

@router.get("/", response_model=List[MetricsResponse])
async def get_all_metrics():
    metrics = []
    for svc in SERVICES:
        metrics.append(await generate_and_save_mock_metrics(svc))
    return metrics

@router.get("/summary/overview")
async def get_metrics_summary():
    metrics = []
    for svc in SERVICES:
        metrics.append(await generate_and_save_mock_metrics(svc))
    
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

@router.get("/history", response_model=List[MetricsResponse])
async def get_metrics_history(
    service: Optional[str] = None, 
    limit: int = Query(100, ge=1, le=1000)
):
    query = {}
    if service:
        query["service"] = service
        
    cursor = db.metrics_history.find(query).sort("timestamp", -1).limit(limit)
    records = await cursor.to_list(length=limit)
    return [MetricsResponse(**doc) for doc in records]

@router.get("/history/summary")
async def get_history_summary(
    service: str, 
    window: str = Query("1h", regex="^(1h|6h|24h)$")
):
    now = datetime.utcnow()
    if window == "1h":
        start_time = now - timedelta(hours=1)
    elif window == "6h":
        start_time = now - timedelta(hours=6)
    else:
        start_time = now - timedelta(hours=24)
        
    pipeline = [
        {"$match": {"service": service, "timestamp": {"$gte": start_time}}},
        {"$group": {
            "_id": "$service",
            "min_cpu": {"$min": "$cpu"},
            "max_cpu": {"$max": "$cpu"},
            "avg_cpu": {"$avg": "$cpu"},
            "min_memory": {"$min": "$memory"},
            "max_memory": {"$max": "$memory"},
            "avg_memory": {"$avg": "$memory"},
            "count": {"$sum": 1}
        }}
    ]
    
    result = await db.metrics_history.aggregate(pipeline).to_list(length=1)
    if not result:
        return {"message": "No data found for the given window."}
        
    res = result[0]
    return {
        "service": res["_id"],
        "window": window,
        "data_points": res["count"],
        "cpu": {
            "min": round(res["min_cpu"], 2),
            "max": round(res["max_cpu"], 2),
            "avg": round(res["avg_cpu"], 2)
        },
        "memory": {
            "min": round(res["min_memory"], 2),
            "max": round(res["max_memory"], 2),
            "avg": round(res["avg_memory"], 2)
        }
    }

@router.post("/anomaly")
async def detect_anomaly(request: AnomalyRequest):
    return anomaly_detector.detect(request.cpu, request.memory, request.restart_count)

@router.get("/{service}", response_model=MetricsResponse)
async def get_service_metrics(service: str):
    if service not in SERVICES:
        raise HTTPException(status_code=404, detail="Service not found")
    return await generate_and_save_mock_metrics(service)
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
from app.services.anomaly_detector import anomaly_detector

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

    # Anomaly Detection
    anomaly = anomaly_detector.detect(request.cpu, request.memory, request.restart_count)
            
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
        runbook_steps=runbook_steps,
        anomaly_result=anomaly
    )
    
    await db.incidents.insert_one(incident.dict())
    
    ws_payload = {
        "event": "new_incident",
        "incident_id": incident.incident_id,
        "severity": incident.severity,
        "summary": incident.root_cause or "Pending analysis",
        "runbook_steps": runbook_steps,
        "is_anomaly": anomaly.get("is_anomaly", False)
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
    "app/main.py": """import asyncio
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.routes import incidents, chat, metrics, simulate, auth, ws, admin, runbooks
from app.rag.vector_store import init_vector_store
from app.database.mongodb import MongoDB
from app.utils.logger import app_logger
from app.auth.dependencies import get_current_user
from app.services.anomaly_detector import anomaly_detector

@asynccontextmanager
async def lifespan(app: FastAPI):
    MongoDB.connect()
    app_logger.info("Skipping vector store init (OpenAI quota reached)")
    
    # Train anomaly detection model
    await anomaly_detector.train_model()
    asyncio.create_task(anomaly_detector.background_retraining())
    
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

# Update requirements.txt
req_path = BASE_DIR / "requirements.txt"
with open(req_path, "a") as f:
    f.write("scikit-learn\\n")

print("Anomaly Detection layer generated successfully!")
