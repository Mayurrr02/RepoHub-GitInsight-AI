import hashlib
import json
import logging
import math
from typing import Sequence
from app.core.config import get_settings

logger = logging.getLogger("repohub.embeddings")


def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    """Compute cosine similarity between two float vectors."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot_product = sum(a * b for a, b in zip(v1, v2))
    magnitude1 = math.sqrt(sum(a * a for a in v1))
    magnitude2 = math.sqrt(sum(b * b for b in v2))
    if magnitude1 == 0.0 or magnitude2 == 0.0:
        return 0.0
    return dot_product / (magnitude1 * magnitude2)


def generate_deterministic_embedding(text: str, dim: int = 64) -> list[float]:
    """Fallback deterministic pseudovector for offline development and testing."""
    vector = []
    for i in range(dim):
        h = hashlib.sha256(f"{text}_{i}".encode("utf-8")).digest()
        val = int.from_bytes(h[:4], "big", signed=True) / (2**31 - 1)
        vector.append(round(val, 6))
    # Normalize
    norm = math.sqrt(sum(x * x for x in vector)) or 1.0
    return [round(x / norm, 6) for x in vector]


class EmbeddingService:
    def __init__(self):
        self.settings = get_settings()

    async def get_embedding(self, text: str) -> list[float]:
        """Generate embedding vector for a single string."""
        results = await self.get_embeddings_batch([text])
        return results[0] if results else generate_deterministic_embedding(text)

    async def get_embeddings_batch(self, texts: Sequence[str]) -> list[list[float]]:
        """Generate embeddings in batch with provider fallback."""
        if not texts:
            return []

        # Try Google GenAI if key is configured
        if self.settings.gemini_api_key:
            try:
                from google import genai
                client = genai.Client(api_key=self.settings.gemini_api_key)
                # Google GenAI text-embedding-004
                response = client.models.embed_content(
                    model="text-embedding-004",
                    contents=list(texts),
                )
                if response and hasattr(response, "embeddings") and response.embeddings:
                    embeddings = []
                    for emb in response.embeddings:
                        if hasattr(emb, "values"):
                            embeddings.append([float(x) for x in emb.values])
                    if len(embeddings) == len(texts):
                        return embeddings
            except Exception as exc:
                logger.warning(f"Google GenAI embedding call failed ({exc}). Using deterministic fallback.")

        # Fallback to deterministic pseudo-embeddings
        return [generate_deterministic_embedding(t) for t in texts]


embedding_service = EmbeddingService()
