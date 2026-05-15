import os
from pathlib import Path

BASE_DIR = Path("c:/Users/gunda/OneDrive/Desktop/aifusion/backend")

files = {
    "app/rag/embeddings.py": """import time
from typing import List
from openai import OpenAI
from app.config.settings import settings

client = OpenAI(api_key=settings.openai_api_key)

def get_embedding(text: str) -> List[float]:
    retries = 0
    max_retries = 3
    base_delay = 1

    while retries <= max_retries:
        try:
            response = client.embeddings.create(
                input=text,
                model="text-embedding-3-small"
            )
            return response.data[0].embedding
        except Exception as e:
            if retries == max_retries:
                raise e
            time.sleep(base_delay * (2 ** retries))
            retries += 1

def get_embeddings_batch(texts: List[str]) -> List[List[float]]:
    retries = 0
    max_retries = 3
    base_delay = 1

    while retries <= max_retries:
        try:
            response = client.embeddings.create(
                input=texts,
                model="text-embedding-3-small"
            )
            return [data.embedding for data in response.data]
        except Exception as e:
            if retries == max_retries:
                raise e
            time.sleep(base_delay * (2 ** retries))
            retries += 1
""",
    "app/rag/vector_store.py": """import os
import pickle
from typing import List, Dict, Any
import faiss
import numpy as np
import tiktoken
from app.rag.embeddings import get_embeddings_batch

class VectorStore:
    def __init__(self, dimension: int = 1536):
        self.dimension = dimension
        self.index = faiss.IndexFlatL2(dimension)
        self.metadata = []

    def add_documents(self, texts: List[str], metadata: List[Dict[str, Any]]):
        if not texts:
            return
        
        # Batch requests to OpenAI embeddings
        batch_size = 100
        all_embeddings = []
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i + batch_size]
            embeddings = get_embeddings_batch(batch_texts)
            all_embeddings.extend(embeddings)

        embeddings_array = np.array(all_embeddings).astype('float32')
        self.index.add(embeddings_array)
        self.metadata.extend(metadata)

    def search(self, query: str, k: int = 5) -> List[Dict[str, Any]]:
        from app.rag.embeddings import get_embedding
        
        if self.is_empty():
            return []

        query_embedding = get_embedding(query)
        query_array = np.array([query_embedding]).astype('float32')
        
        distances, indices = self.index.search(query_array, k)
        
        results = []
        for j, i in enumerate(indices[0]):
            if i != -1 and i < len(self.metadata):
                result_meta = self.metadata[i].copy()
                result_meta["score"] = float(distances[0][j])
                results.append(result_meta)
                
        return results

    def save(self, path: str):
        os.makedirs(path, exist_ok=True)
        faiss.write_index(self.index, f"{path}/index.faiss")
        with open(f"{path}/metadata.pkl", "wb") as f:
            pickle.dump(self.metadata, f)

    def load(self, path: str):
        self.index = faiss.read_index(f"{path}/index.faiss")
        with open(f"{path}/metadata.pkl", "rb") as f:
            self.metadata = pickle.load(f)

    def is_empty(self) -> bool:
        return self.index.ntotal == 0

# Initialization code
def chunk_text(text: str, chunk_size: int = 400, overlap: int = 50) -> List[str]:
    enc = tiktoken.get_encoding("cl100k_base")
    tokens = enc.encode(text)
    chunks = []
    
    start = 0
    while start < len(tokens):
        end = start + chunk_size
        chunk = tokens[start:end]
        chunks.append(enc.decode(chunk))
        start += chunk_size - overlap
        
    return chunks

vector_store = VectorStore()

def init_vector_store():
    global vector_store
    import glob
    
    index_path = os.path.join(os.path.dirname(__file__), "faiss_index")
    if os.path.exists(os.path.join(index_path, "index.faiss")):
        vector_store.load(index_path)
        return
        
    docs_path = os.path.join(os.path.dirname(__file__), "docs")
    if not os.path.exists(docs_path):
        return
        
    all_texts = []
    all_metadata = []
    
    for file_path in glob.glob(os.path.join(docs_path, "*.txt")):
        filename = os.path.basename(file_path)
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        chunks = chunk_text(content, chunk_size=400, overlap=50)
        for i, chunk in enumerate(chunks):
            all_texts.append(chunk)
            all_metadata.append({
                "source": filename,
                "chunk_index": i,
                "content": chunk
            })
            
    if all_texts:
        vector_store.add_documents(all_texts, all_metadata)
        vector_store.save(index_path)
""",
    "app/rag/retriever.py": """from typing import List, Dict, Any
from app.rag.vector_store import VectorStore

class RAGRetriever:
    def __init__(self, vector_store: VectorStore):
        self.vector_store = vector_store

    def retrieve(self, query: str, k: int = 3) -> str:
        results = self.retrieve_with_scores(query, k)
        
        if not results:
            return "RELEVANT DOCS:\\nNo relevant documents found.\\n"
            
        formatted_docs = "RELEVANT DOCS:\\n"
        for i, result in enumerate(results, 1):
            formatted_docs += f"[Doc {i}]: {result['content']}\\n"
            
        return formatted_docs

    def retrieve_with_scores(self, query: str, k: int = 3) -> List[Dict[str, Any]]:
        return self.vector_store.search(query, k=k)
""",
    "app/rag/docs/kubernetes_crashes.txt": """Kubernetes pod crashes and scheduling failures are common issues in microservice architectures, demanding rapid diagnosis to maintain uptime. A frequent issue is the CrashLoopBackOff state, indicating that a pod is repeatedly failing to start and restarting. This can be caused by misconfigured environment variables, application panics, or missing dependencies. When a pod enters this loop, Kubernetes exponentially delays the restart attempts. To resolve this, inspecting the pod's logs (`kubectl logs`) and checking the preceding events (`kubectl describe pod`) are crucial first steps.

Another prevalent failure is OOMKilled (Out of Memory Killed), meaning the pod exceeded its memory limits and the Linux kernel terminated its process. This often points to a memory leak in the application or inappropriately restrictive resource limits in the deployment manifest. Troubleshooting involves analyzing memory usage trends, possibly heap profiling the application, and rightsizing memory requests and limits. Similarly, node pressure can cause pod eviction. If a node runs critically low on memory or disk space, the kubelet starts evicting pods to reclaim resources, causing unexpected service disruptions. Identifying noisy neighbors or under-provisioned nodes is key here.

ImagePullBackOff indicates the kubelet cannot retrieve the container image, usually due to incorrect tags, missing image pull secrets, or registry authentication failures. Verifying the image registry credentials and image names resolves most cases.

Finally, liveness and readiness probe failures can masquerade as crashes. If a liveness probe fails consecutively, Kubernetes restarts the container, assuming deadlock. If a readiness probe fails, the pod is removed from service endpoints, preventing traffic. These failures often stem from overloaded applications, slow database queries causing the health endpoint to timeout, or improper probe configuration. Adjusting initialDelaySeconds and timeoutSeconds on the probes helps prevent premature restarts while the application is merely under load or initializing.""",
    "app/rag/docs/redis_failures.txt": """Redis is frequently used as a high-performance caching layer or message broker, and its failure can cascade rapidly across microservices. One common issue is connection pool exhaustion. Applications may leak connections or experience sudden spikes in traffic, reaching the Redis `maxclients` limit. When this happens, new connection attempts timeout, resulting in broad application latency. Diagnosis involves checking `CLIENT LIST` to identify connection origins and verifying application-side connection pooling configurations.

Memory constraints are another significant source of Redis failures. Redis operates entirely in memory, and if it hits its configured `maxmemory` limit, it will either start evicting keys (based on the `maxmemory-policy`, like `allkeys-lru`) or reject new write operations entirely, returning out-of-memory (OOM) errors. Sudden bursts of caching, lacking TTLs (Time to Live) on keys, or large payloads can trigger this. Monitoring memory usage metrics and setting appropriate eviction policies mitigates this risk.

In clustered or highly available setups, failover events can cause transient errors. If a primary node goes down, Redis Sentinel or Redis Cluster will promote a replica to primary. During this transition, write operations might briefly fail, and client applications must be resilient enough to handle these brief outages and reconnect to the new primary.

Replication lag is another silent killer. If a replica falls significantly behind the primary, data inconsistency occurs, and in extreme cases, the replication buffer on the primary might exceed limits, causing the replication link to break and initiate a full, expensive resynchronization.

Lastly, NOAUTH errors occur when a Redis instance is secured with a password, but the client application fails to authenticate. This usually happens after a configuration change or deployment where secrets are improperly injected or rotated, leading to immediate database access failure for the dependent microservice.""",
    "app/rag/docs/memory_leaks.txt": """Memory leaks in microservices present insidious challenges, often degrading performance over hours or days before resulting in an outright crash. A memory leak occurs when an application allocates memory but fails to release it back to the operating system after it is no longer needed. In managed languages like Java or Node.js, this happens when objects are unintentionally kept alive by lingering references, preventing the garbage collector from reclaiming the space.

Identifying a memory leak usually begins with monitoring memory usage metrics over time. A classic leak manifests as a gradual, continuous upward trend in memory consumption, colloquially known as the "sawtooth" pattern where memory drops slightly during garbage collection but the baseline consistently rises. Sudden memory spikes, in contrast, often indicate a rapid allocation burst (like loading a massive dataset into memory) rather than a slow leak.

Diagnosis heavily relies on profiling tools. For Java applications (JVM), capturing a heap dump (`jmap`) and analyzing it with tools like Eclipse MAT or VisualVM reveals which objects are consuming the most memory and what is holding references to them. In Node.js, heap snapshots can be taken and analyzed in Chrome DevTools to find detached DOM nodes or accumulated closures.

In containerized environments, these leaks inevitably lead to OOMKiller (Out of Memory Killer) events. The container runtime monitors the memory limits specified in the deployment. When the application exceeds these limits, the Linux kernel terminates the process to protect the host node, causing the microservice to crash and restart.

Troubleshooting involves adjusting JVM or Node.js memory parameters (like heap sizing) to ensure they are smaller than the container's hard limits, preventing the OS from killing the process before the language runtime has a chance to attempt emergency garbage collection. Implementing stringent memory limits and utilizing APM (Application Performance Monitoring) tools to track object allocation rates are critical steps for long-term resolution.""",
    "app/rag/docs/deployment_rollbacks.txt": """Deployment rollbacks are critical fail-safes in continuous delivery pipelines, necessary when newly deployed code introduces regressions, breaks functionality, or fails health checks. The goal of a rollback is to restore the system to its last known good state as rapidly as possible to minimize user impact.

In Kubernetes environments, the `kubectl rollout undo` command is the standard mechanism for reverting a deployment. It works by updating the deployment to reference the previous ReplicaSet, spinning up pods with the old configuration and gracefully terminating the failing new pods. This process is seamless but depends on the previous image version still being available in the container registry.

Advanced deployment strategies like blue-green and canary deployments offer safer rollback paths. In a blue-green deployment, both the old (blue) and new (green) versions run simultaneously. Traffic is switched to the green environment via a load balancer or ingress controller. If the green environment fails, rolling back is as simple as switching the router back to the blue environment, offering near-instantaneous recovery.

Canary deployments gradually shift traffic (e.g., 5%, then 20%) to the new version. Rollbacks are triggered if error rates or latency spike within the canary group. Automated rollback mechanisms tie into APM (Application Performance Monitoring) tools to initiate rollbacks automatically based on predefined thresholds, such as HTTP 500 error rates exceeding 1% or p99 latency increasing by 50%.

A deployment freeze may be initiated following a severe rollback to prevent further automated deployments while the root cause is investigated. Common triggers for rollbacks include failed health checks (liveness/readiness probes), fatal database migration errors that prevent application startup, or sudden spikes in CPU/memory usage immediately following the deployment. Establishing clear, observable metrics for success and failure is paramount for an effective rollback strategy."""
}

for filepath, content in files.items():
    full_path = BASE_DIR / filepath
    full_path.parent.mkdir(parents=True, exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

print("RAG Pipeline files created successfully!")
