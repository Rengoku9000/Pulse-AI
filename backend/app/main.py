import os
import time
import logging
from typing import Any

import httpx
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
from app.config.settings import settings
from app.ai.llm_provider import llm_provider

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

FALLBACK_RESPONSE = "Unable to confidently assess symptoms. Please consult a healthcare professional."

app = FastAPI(title="Healthcare AI Triage Backend", version="0.2.0")

# ── CORS ─────────────────────────────────────────────────────────────────────
# Allow Vercel frontend (*.vercel.app), local dev, and any custom domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:8080",
        "https://*.vercel.app",
        os.getenv("FRONTEND_ORIGIN", "*"),  # Set FRONTEND_ORIGIN in Render env vars
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Metrics
REQUEST_COUNT = Counter("backend_request_count", "Backend HTTP request count", ["endpoint"])
API_LATENCY = Histogram("backend_api_latency_seconds", "Backend API latency", ["endpoint"])
OPENAI_FAILURES = Counter("openai_api_failures_total", "OpenAI API failures")
OPENAI_REQUESTS = Counter("openai_requests_total", "OpenAI API requests")
RAG_LATENCY = Histogram("rag_retrieval_latency_seconds", "RAG retrieval latency")
ACTIVE_SESSIONS = Gauge("active_sessions", "Approximate active chat sessions")
TRIAGE_RISK_SCORE = Gauge("triage_risk_score", "Latest triage risk score")

class ChatRequest(BaseModel):
    session_id: str = Field(default="demo-session")
    message: str

class ChatResponse(BaseModel):
    guidance: str
    emergency_score: int
    risk_level: str
    emergency_recommendation: str
    disclaimer: str
    retrieved_context: list[str]
    assistant_name: str
    language: str
    topology_stage: str
    clinical_summary: str
    operational_insights: list[str]
    safety_actions: list[str]
    telemetry: dict[str, Any]


# ── MongoDB Client (lazy — does NOT connect at import time) ──────────────────
# Motor connections are lazy by default; get_default_database() is deferred
# to the first actual DB operation so startup never crashes on DB issues.
mongo_client = AsyncIOMotorClient(
    settings.mongodb_uri,
    serverSelectionTimeoutMS=5000,   # 5s timeout instead of hanging forever
)
try:
    db = mongo_client.get_default_database()
except Exception:
    # URI has no database name — fall back to explicit name
    db = mongo_client["healthcare_ai"]


def calculate_emergency_score(message: str) -> int:
    high_risk = ["chest pain", "trouble breathing", "stroke", "severe bleeding", "unconscious", "suicidal"]
    medium_risk = ["fever", "dizzy", "vomiting", "dehydration", "severe pain"]
    text = message.lower()
    score = 0
    score += 70 if any(term in text for term in high_risk) else 0
    score += 30 if any(term in text for term in medium_risk) else 0
    return min(score, 100)

def detect_language(message: str) -> str:
    text = message.lower()
    hindi_markers = ["hai", "dard", "bukhar", "saans", "chakkar", "mujhe", "seene"]
    spanish_markers = ["dolor", "fiebre", "mareo", "respirar", "pecho"]
    if any(marker in text for marker in hindi_markers):
        return "Hindi / Hinglish"
    if any(marker in text for marker in spanish_markers):
        return "Spanish"
    return "English"

def get_risk_level(score: int) -> str:
    if score >= 70:
        return "Escalation Recommended"
    if score >= 30:
        return "Elevated Observation"
    return "Guidance Only"

def get_topology_stage(score: int) -> str:
    if score >= 70:
        return "Clinical Escalation"
    if score >= 30:
        return "AI Risk Engine"
    return "Patient Voice Intake"

def get_operational_insights(message: str, score: int) -> list[str]:
    insights = [
        "Patient-reported symptoms captured for triage review.",
        "Response uses probabilistic language and avoids diagnosis claims.",
    ]
    if score >= 70:
        insights.append("Potential emergency indicators detected; escalation workflow should be prioritized.")
    elif score >= 30:
        insights.append("Moderate risk indicators detected; recommend clinician review if symptoms persist or worsen.")
    else:
        insights.append("No high-risk keywords detected by the rule layer; continue safe symptom guidance.")
    if len(message) < 20:
        insights.append("Symptom description is brief; request additional onset, duration, severity, and age context.")
    return insights

def get_safety_actions(score: int) -> list[str]:
    if score >= 70:
        return [
            "Advise immediate emergency care or local emergency services.",
            "Keep the patient on the line if this is a live intake workflow.",
            "Prepare a concise handoff summary for clinical staff.",
        ]
    if score >= 30:
        return [
            "Recommend timely consultation with a healthcare professional.",
            "Monitor worsening symptoms and escalation triggers.",
            "Avoid final diagnosis and provide supportive guidance only.",
        ]
    return [
        "Provide general symptom guidance.",
        "Ask the patient to seek care if symptoms worsen or new severe symptoms appear.",
        "Keep medical disclaimer visible.",
    ]

async def retrieve_context(message: str) -> list[str]:
    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.post(settings.vector_service_url, json={"query": message, "top_k": 3})
            response.raise_for_status()
            data = response.json()
            return [item["text"] for item in data.get("matches", [])]
    except Exception as e:
        logger.error(f"RAG retrieval failed: {str(e)}")
        return []
    finally:
        RAG_LATENCY.observe(time.perf_counter() - start)

@app.get("/")
async def root():
    return RedirectResponse(url="/docs")

@app.get("/health")
async def health() -> dict[str, str]:
    REQUEST_COUNT.labels("/health").inc()
    return {"status": "healthy"}

@app.get("/status")
async def status() -> dict[str, Any]:
    REQUEST_COUNT.labels("/status").inc()
    checks: dict[str, Any] = {"api": "ok"}
    try:
        await mongo_client.admin.command("ping")
        checks["mongodb"] = "ok"
    except Exception as exc:
        checks["mongodb"] = f"error: {exc.__class__.__name__}"
    checks["openai_key_configured"] = bool(settings.openai_api_key)
    checks["groq_key_configured"] = bool(settings.groq_api_key)
    return checks

@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    REQUEST_COUNT.labels("/chat").inc()
    ACTIVE_SESSIONS.inc()
    start = time.perf_counter()
    try:
        score = calculate_emergency_score(payload.message)
        TRIAGE_RISK_SCORE.set(score)
        context = await retrieve_context(payload.message)
        
        try:
            ai_result = await llm_provider.generate_guidance(payload.message, context, score)
            guidance = ai_result["guidance"]
            provider_used = ai_result["provider"]
        except Exception:
            guidance = FALLBACK_RESPONSE
            provider_used = "fallback"

        level = get_risk_level(score)
        recommendation = "Seek emergency care now." if score >= 70 else "Monitor symptoms and consult a clinician if symptoms worsen."
        language = detect_language(payload.message)
        insights = get_operational_insights(payload.message, score)
        actions = get_safety_actions(score)
        
        telemetry = {
            "risk_probability": round(score / 100, 2),
            "rag_context_chunks": len(context),
            "language": language,
            "care_pathway": get_topology_stage(score),
            "diagnosis_mode": "disabled",
            "provider_used": provider_used
        }
        
        try:
            await db.triage_events.insert_one({
                "session_id": payload.session_id,
                "message": payload.message,
                "score": score,
                "risk_level": level,
                "language": language,
                "provider_used": provider_used,
                "created_at": time.time(),
            })
        except Exception as e:
            logger.error(f"Failed to log event to MongoDB: {str(e)}")

        return ChatResponse(
            guidance=guidance,
            emergency_score=score,
            risk_level=level,
            emergency_recommendation=recommendation,
            disclaimer="This assistant does not provide diagnosis. For emergencies, contact local emergency services.",
            retrieved_context=context,
            assistant_name="PulseGuard AI",
            language=language,
            topology_stage=get_topology_stage(score),
            clinical_summary=(
                f"PulseGuard AI identified a {level.lower()} case pattern with a "
                f"{score}/100 operational risk score. This is triage support, not a diagnosis."
            ),
            operational_insights=insights,
            safety_actions=actions,
            telemetry=telemetry,
        )
    finally:
        ACTIVE_SESSIONS.dec()
        API_LATENCY.labels("/chat").observe(time.perf_counter() - start)


# ── /copilot — Streaming SSE conversational endpoint ─────────────────────────
from fastapi.responses import StreamingResponse as FastAPIStreamingResponse

COPILOT_SYSTEM_PROMPT = """You are PulseGuard AI, an advanced clinical intelligence copilot designed to assist healthcare staff with patient triage, symptom assessment, and escalation decisions.

Your capabilities:
- Analyze patient symptoms and identify risk signals
- Ask intelligent follow-up questions about duration, severity, onset, and context
- Assess escalation urgency using structured clinical reasoning
- Support multilingual patient intake (English, Hindi, Kannada, Tamil, Telugu)
- Provide structured responses with clear sections

Your constraints (CRITICAL - never violate):
- NEVER provide a definitive medical diagnosis
- NEVER prescribe specific medications or dosages
- ALWAYS recommend physician consultation for serious symptoms
- ALWAYS use probabilistic language ("may indicate", "could suggest", "warrants evaluation")
- ALWAYS include a safety disclaimer for high-risk presentations
- ALWAYS escalate when symptoms suggest cardiac, neurological, or respiratory emergencies

Response format (use these headers when appropriate):
[OBSERVATION] — What you notice from the symptoms
[RISK SIGNALS] — Specific concerning indicators
[FOLLOW-UP] — Questions to gather more clinical context
[RECOMMENDATION] — Suggested next steps
[DISCLAIMER] — Safety and liability statement

Tone: calm, professional, clinically precise, supportive."""


class CopilotRequest(BaseModel):
    history: list[dict] = []
    context_note: str = ""
    system_hint: str = ""


@app.post("/copilot")
async def copilot_stream(payload: CopilotRequest):
    """Real-time streaming AI copilot with conversation memory."""
    REQUEST_COUNT.labels("/copilot").inc()

    messages = [{"role": "system", "content": COPILOT_SYSTEM_PROMPT}]

    # Inject triage context as a system note if provided
    if payload.context_note:
        messages.append({
            "role": "system",
            "content": f"Current session context: {payload.context_note}"
        })

    # Append conversation history (last 12 messages max)
    for msg in payload.history[-12:]:
        if msg.get("role") in ("user", "assistant") and msg.get("content"):
            messages.append({"role": msg["role"], "content": msg["content"]})

    async def token_stream():
        try:
            client = llm_provider.openai_client
            stream = await client.chat.completions.create(
                model=settings.openai_model,
                messages=messages,
                temperature=0.3,
                max_tokens=600,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    # SSE format
                    yield f"data: {delta}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Copilot stream error: {e}")
            yield f"data: [ERROR] {str(e)}\n\n"
            yield "data: [DONE]\n\n"

    return FastAPIStreamingResponse(
        token_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering for true streaming
        },
    )

