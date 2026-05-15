# PulseGuard AI — Healthcare Triage Autopilot

Advanced FastAPI backend for an AI-driven healthcare triage and operational intelligence system.

## Architecture Overview

```text
       [ Patient Dashboard ]
              |  (REST / JSON / WebSockets)
              v
+-----------------------------+
|        FastAPI Router       | (chat, status, metrics, health)
+-----------------------------+
       |             |               |
       v             v               v
[ Triage Engine ] [ Anomaly ] [ RAG Retriever ] <--> [ Vector Service ]
[ (Rule-Based)  ] [ Detection ] [ (Medical Docs)]      (Medical Data)
       |             |               |
       v             v               v
+--------------------------------------------+
|             LLM Provider Layer             |
| (OpenAI Primary -> Groq Llama3 Fallback)   |
+--------------------------------------------+
             |               |
             v               v
      [ MongoDB ]     [ Operational ]
   (Triage Events,    [  Insights   ]
    Metrics)
```

## Key Features

- **Intelligent Triage Pipeline:** 
    - **Emergency Scoring:** Real-time calculation of risk levels based on symptom keywords.
    - **Language Support:** Automated detection and response tailoring for English, Hindi, and Spanish.
    - **RAG-Augmented Guidance:** Retrieves verified medical context from a dedicated vector service.
    - **Agnostic LLM Provider:** High-availability AI generation with automatic failover from OpenAI to Groq.
- **Operational Intelligence:**
    - **Triage Telemetry:** Tracks risk probability, care pathways, and clinical summaries.
    - **Metrics Dashboard:** Native Prometheus integration for monitoring API health and AI performance.
- **Enterprise-Ready:**
    - **Async Infrastructure:** Built on FastAPI and Motor for high-concurrency patient intake.
    - **Multi-Cloud Scalability:** Docker-ready and Kubernetes-compatible configuration.

## Quick Start

1. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
2. **Setup .env:**
   Ensure `OPENAI_API_KEY` and `GROQ_API_KEY` are configured.
3. **Run Server:**
   ```bash
   uvicorn app.main:app --reload
   ```
