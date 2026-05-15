import json
import time
import logging
import asyncio
from openai import AsyncOpenAI, RateLimitError, APITimeoutError
from groq import AsyncGroq
from app.config.settings import settings

logger = logging.getLogger(__name__)

class LLMProvider:
    def __init__(self):
        self.openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.groq_client = AsyncGroq(api_key=settings.groq_api_key) if settings.groq_api_key else None
        
    async def generate_guidance(self, message: str, context: list[str], score: int) -> dict:
        prompt = (
            "You are PulseGuard AI, a healthcare triage and operational intelligence assistant. "
            "Do not diagnose. Use probabilistic language. Provide symptom guidance, escalation "
            "recommendations when appropriate, and a short safety disclaimer.\n\n"
            f"User symptoms: {message}\n"
            f"Emergency score: {score}/100\n"
            f"Retrieved medical context: {context}\n"
        )
        
        try:
            return await self._call_openai(prompt)
        except (RateLimitError, APITimeoutError, Exception) as e:
            logger.warning(f"OpenAI failed: {str(e)}. Attempting Groq fallback...")
            if self.groq_client:
                try:
                    return await self._call_groq(prompt)
                except Exception as ge:
                    logger.error(f"Groq fallback also failed: {str(ge)}")
                    raise ge
            else:
                logger.error("No Groq API key configured for fallback.")
                raise e

    async def _call_openai(self, prompt: str) -> dict:
        start_time = time.time()
        response = await self.openai_client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": "Never provide a final medical diagnosis or certainty claim."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            timeout=settings.openai_timeout_seconds
        )
        latency = time.time() - start_time
        return {
            "guidance": response.choices[0].message.content,
            "provider": "openai",
            "latency": latency
        }

    async def _call_groq(self, prompt: str) -> dict:
        start_time = time.time()
        response = await self.groq_client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[
                {"role": "system", "content": "Never provide a final medical diagnosis or certainty claim."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2
        )
        latency = time.time() - start_time
        return {
            "guidance": response.choices[0].message.content,
            "provider": "groq",
            "latency": latency
        }

llm_provider = LLMProvider()
