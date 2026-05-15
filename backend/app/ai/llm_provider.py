import time
import logging
from openai import AsyncOpenAI, RateLimitError, APITimeoutError
from app.config.settings import settings

logger = logging.getLogger(__name__)

# Groq is optional — only import if the key is set
_groq_available = bool(settings.groq_api_key)
if _groq_available:
    try:
        from groq import AsyncGroq
    except ImportError:
        _groq_available = False


class LLMProvider:
    def __init__(self):
        # Defer client creation so a missing/placeholder key doesn't crash startup.
        # Actual validation happens on the first API call.
        self._openai_client = None
        self._groq_client = None

    @property
    def openai_client(self) -> AsyncOpenAI:
        if self._openai_client is None:
            self._openai_client = AsyncOpenAI(
                api_key=settings.openai_api_key,
                timeout=settings.openai_timeout_seconds,
            )
        return self._openai_client

    @property
    def groq_client(self):
        if not _groq_available or not settings.groq_api_key:
            return None
        if self._groq_client is None:
            self._groq_client = AsyncGroq(api_key=settings.groq_api_key)
        return self._groq_client

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
        )
        latency = time.time() - start_time
        return {
            "guidance": response.choices[0].message.content,
            "provider": "openai",
            "latency": latency,
        }

    async def _call_groq(self, prompt: str) -> dict:
        start_time = time.time()
        response = await self.groq_client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[
                {"role": "system", "content": "Never provide a final medical diagnosis or certainty claim."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )
        latency = time.time() - start_time
        return {
            "guidance": response.choices[0].message.content,
            "provider": "groq",
            "latency": latency,
        }


# Module-level singleton — safe to import; clients are created lazily on first use
llm_provider = LLMProvider()
