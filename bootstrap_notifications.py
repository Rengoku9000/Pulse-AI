import os
from pathlib import Path

BASE_DIR = Path("c:/Users/gunda/OneDrive/Desktop/aifusion/backend")

files = {
    "app/services/notifications.py": """import os
import aiohttp
import asyncio
import logging
from app.models.incident_model import IncidentResponse

logger = logging.getLogger(__name__)

SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL")
PAGERDUTY_ROUTING_KEY = os.getenv("PAGERDUTY_ROUTING_KEY")

class NotificationService:
    @staticmethod
    def get_severity_emoji(severity: str) -> str:
        mapping = {
            "CRITICAL": "🔥",
            "HIGH": "🚨",
            "MEDIUM": "⚠️",
            "LOW": "ℹ️"
        }
        return mapping.get(severity.upper(), "❓")

    async def send_slack_alert(self, incident: IncidentResponse):
        if not SLACK_WEBHOOK_URL:
            logger.warning("SLACK_WEBHOOK_URL not set. Skipping Slack notification.")
            return

        emoji = self.get_severity_emoji(incident.severity)
        payload = {
            "text": f"{emoji} *New Incident: {incident.service}*",
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"{emoji} *New Incident: {incident.service}*\\n*Severity:* {incident.severity}\\n*Incident ID:* `{incident.incident_id}`\\n*Root Cause:* {incident.root_cause or 'Pending analysis'}"
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"<{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/incidents/{incident.incident_id}|View Incident Details>"
                    }
                }
            ]
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(SLACK_WEBHOOK_URL, json=payload, timeout=5) as response:
                    if response.status >= 400:
                        logger.error(f"Slack notification failed: {response.status}")
                    else:
                        logger.info("Slack notification sent successfully.")
        except Exception as e:
            logger.error(f"Error sending Slack notification: {str(e)}")

    async def send_pagerduty_alert(self, incident: IncidentResponse):
        if incident.severity.upper() not in ["HIGH", "CRITICAL"]:
            return
            
        if not PAGERDUTY_ROUTING_KEY:
            logger.warning("PAGERDUTY_ROUTING_KEY not set. Skipping PagerDuty alert.")
            return

        payload = {
            "routing_key": PAGERDUTY_ROUTING_KEY,
            "event_action": "trigger",
            "payload": {
                "summary": f"{incident.severity} Incident on {incident.service}",
                "source": incident.service,
                "severity": "critical" if incident.severity == "CRITICAL" else "error",
                "custom_details": {
                    "incident_id": incident.incident_id,
                    "root_cause": incident.root_cause,
                    "metrics": f"CPU: {incident.cpu_usage}%, Mem: {incident.memory_usage}%"
                }
            }
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post("https://events.pagerduty.com/v2/enqueue", json=payload, timeout=5) as response:
                    if response.status >= 400:
                        logger.error(f"PagerDuty alert failed: {response.status}")
                    else:
                        logger.info("PagerDuty alert sent successfully.")
        except Exception as e:
            logger.error(f"Error sending PagerDuty alert: {str(e)}")

    async def notify(self, incident: IncidentResponse):
        await asyncio.gather(
            self.send_slack_alert(incident),
            self.send_pagerduty_alert(incident),
            return_exceptions=True
        )

notification_service = NotificationService()
""",
    "app/routes/admin.py": """from fastapi import APIRouter, Depends
from app.services.notifications import notification_service
from app.models.incident_model import IncidentResponse
from app.auth.dependencies import get_current_user
import asyncio

router = APIRouter()

@router.post("/notifications/test")
async def test_notifications():
    test_incident = IncidentResponse(
        service="test-service",
        cpu_usage=99.9,
        memory_usage=99.9,
        restart_count=10,
        logs="This is a test incident to verify Slack and PagerDuty notifications.",
        severity="CRITICAL",
        root_cause="Test triggered by admin.",
        recommendation="Verify notifications were received correctly.",
        confidence=100.0
    )
    
    asyncio.create_task(notification_service.notify(test_incident))
    return {"message": "Test notifications dispatched asynchronously."}
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
    
    # Send external notifications (Slack & PagerDuty)
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
from app.routes import incidents, chat, metrics, simulate, auth, ws, admin
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

print("Notification service generated successfully!")
