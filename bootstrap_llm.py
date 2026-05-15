import os
from pathlib import Path

BASE_DIR = Path("c:/Users/gunda/OneDrive/Desktop/aifusion/backend")

files = {
    "app/ai/llm_provider.py": """import os
import json
import time
import logging
import asyncio
from openai import AsyncOpenAI, RateLimitError, APITimeoutError
from anthropic import AsyncAnthropic
from app.ai.prompts import ROOT_CAUSE_PROMPT

logger = logging.getLogger(__name__)

class LLMProvider:
    def __init__(self):
        self.openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
        self.anthropic_client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))
        
    async def _call_openai(self, prompt: str) -> dict:
        start_time = time.time()
        try:
            response = await self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                timeout=15.0
            )
            latency = time.time() - start_time
            logger.info(f"OpenAI call successful. Latency: {latency:.2f}s")
            
            result = json.loads(response.choices[0].message.content)
            result["provider_used"] = "openai"
            return result
        except Exception as e:
            logger.warning(f"OpenAI call failed after {time.time() - start_time:.2f}s: {e}")
            raise e

    async def _call_anthropic(self, prompt: str) -> dict:
        start_time = time.time()
        try:
            full_prompt = prompt + "\\n\\nRespond ONLY with the raw JSON object. Do not wrap it in markdown block quotes."
            
            response = await self.anthropic_client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=1000,
                messages=[{"role": "user", "content": full_prompt}],
                timeout=15.0
            )
            latency = time.time() - start_time
            logger.info(f"Anthropic call successful. Latency: {latency:.2f}s")
            
            text = response.content[0].text.strip()
            if text.startswith("```json"):
                text = text[7:-3].strip()
            elif text.startswith("```"):
                text = text[3:-3].strip()
                
            result = json.loads(text)
            result["provider_used"] = "anthropic"
            return result
        except Exception as e:
            logger.warning(f"Anthropic call failed after {time.time() - start_time:.2f}s: {e}")
            raise e

    async def analyze_incident(self, service: str, cpu: float, memory: float, restart_count: int, logs: str, severity: str, retrieved_docs: str) -> dict:
        prompt = ROOT_CAUSE_PROMPT.format(
            service=service, cpu=cpu, memory=memory, restart_count=restart_count, 
            logs=logs, severity=severity, retrieved_docs=retrieved_docs
        )
        
        for attempt in range(2):
            try:
                return await self._call_openai(prompt)
            except Exception as e:
                if "insufficient_quota" in str(e).lower() or "quota" in str(e).lower():
                    logger.warning("OpenAI insufficient quota detected. Skipping retry.")
                    break
                
                if attempt == 0:
                    logger.info("Retrying OpenAI in 2 seconds...")
                    await asyncio.sleep(2)
                else:
                    logger.warning("OpenAI failed after 2 attempts.")
                    
        logger.info("Falling back to Anthropic (claude-haiku)...")
        try:
            return await self._call_anthropic(prompt)
        except Exception as e:
            logger.error(f"Both LLM providers failed. Last error: {e}")
            return {
                "root_cause": "Automated AI analysis unavailable (Provider Failure).",
                "recommendation": "Review logs manually.",
                "confidence": 0.0,
                "provider_used": "fallback_degraded"
            }

llm_provider = LLMProvider()
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
    provider_used: Optional[str] = None

class AnalysisResult(BaseModel):
    root_cause: str
    recommendation: str
    confidence: float
    severity_explanation: str
    provider_used: Optional[str] = None
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
from app.ai.llm_provider import llm_provider
from app.ws.manager import manager
from app.services.notifications import notification_service
from app.services.anomaly_detector import anomaly_detector

router = APIRouter()
severity_engine = SeverityEngine()

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
    
    analysis = await llm_provider.analyze_incident(
        service=request.service,
        cpu=request.cpu,
        memory=request.memory,
        restart_count=request.restart_count,
        logs=request.logs,
        severity=severity_result.level.value,
        retrieved_docs=retrieved_docs
    )
    
    runbook_steps = None
    root_cause_str = str(analysis.get("root_cause", "")).lower()
    logs_str = request.logs.lower()
    
    runbooks = await db.runbooks.find().to_list(length=100)
    for rb in runbooks:
        pattern = rb["pattern"].lower()
        if pattern in root_cause_str or pattern in logs_str:
            runbook_steps = rb["steps"]
            break

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
        anomaly_result=anomaly,
        provider_used=analysis.get("provider_used")
    )
    
    await db.incidents.insert_one(incident.dict())
    
    ws_payload = {
        "event": "new_incident",
        "incident_id": incident.incident_id,
        "severity": incident.severity,
        "summary": incident.root_cause or "Pending analysis",
        "runbook_steps": runbook_steps,
        "is_anomaly": anomaly.get("is_anomaly", False),
        "provider_used": incident.provider_used
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
    f.write("anthropic\\n")

print("Provider-agnostic LLM Layer generated successfully!")
