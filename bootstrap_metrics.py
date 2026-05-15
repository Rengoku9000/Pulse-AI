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
    incident_id: Optional[str] = None
""",
    "app/routes/metrics.py": """from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
import random
from datetime import datetime, timedelta
from app.models.request_models import MetricsResponse
from app.database.mongodb import db

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
    # Save the snapshot to MongoDB metrics_history collection
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

@router.get("/{service}", response_model=MetricsResponse)
async def get_service_metrics(service: str):
    if service not in SERVICES:
        raise HTTPException(status_code=404, detail="Service not found")
    return await generate_and_save_mock_metrics(service)
"""
}

for filepath, content in files.items():
    full_path = BASE_DIR / filepath
    full_path.parent.mkdir(parents=True, exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Metrics persistence layer generated successfully!")
