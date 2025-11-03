import os
import requests
import json
import time
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv('UBIOPS_RAG_1')
base_url = 'https://api.intermax.ubiops.com/v2.1/projects/gradient-ds-proxy/openai-compatible/v1'
embedding_model = 'ubiops-deployment/bge-m3/v1/BAAI/bge-m3'

if not api_key:
    print("Error: UBIOPS_RAG_1 environment variable not found")
    exit(1)

print(f"Using base URL: {base_url}/embeddings")
print(f"API Key: {api_key[:10]}...")
print("\n" + "="*60)
print("TESTING BATCHED EMBEDDINGS (50 texts x ~4000 chars)")
print("="*60 + "\n")

base_text = """
In the realm of artificial intelligence and machine learning, the development of 
large language models has revolutionized how we interact with technology. These 
sophisticated neural networks, trained on vast amounts of textual data, demonstrate 
remarkable capabilities in understanding context, generating coherent responses, 
and performing complex reasoning tasks. The architecture underlying these models 
typically consists of transformer-based designs, which utilize attention mechanisms 
to process sequential information efficiently. Through the process of pre-training 
on diverse datasets and subsequent fine-tuning for specific applications, these 
models achieve state-of-the-art performance across numerous natural language 
processing benchmarks. The implications of this technology span multiple domains, 
from content creation and code generation to customer service automation and 
medical diagnosis assistance. As these systems continue to evolve, researchers 
focus on improving their efficiency, reducing computational requirements, and 
addressing ethical considerations such as bias mitigation and responsible AI 
deployment. The integration of multimodal capabilities, combining text with images, 
audio, and video, represents the next frontier in AI development. Organizations 
worldwide are investing significant resources in both fundamental research and 
practical applications, recognizing the transformative potential of these 
technologies for business operations and societal advancement. The challenges 
ahead include ensuring model interpretability, maintaining data privacy, and 
developing robust safety measures to prevent misuse. Collaborative efforts between 
academic institutions, industry leaders, and regulatory bodies are essential to 
establish guidelines and best practices for the responsible development and 
deployment of AI systems. As we navigate this rapidly evolving landscape, the 
balance between innovation and caution remains crucial for maximizing benefits 
while minimizing potential risks. The democratization of AI tools and the 
accessibility of powerful computing resources have accelerated the pace of 
progress, enabling smaller teams and individual researchers to contribute 
meaningful advancements to the field. This distributed approach to innovation 
fosters creativity and diverse perspectives, leading to novel solutions for 
complex problems across various sectors of society and industry.
"""

print("Generating 50 text samples of ~4000 characters each...")
texts = []
for i in range(50):
    text_sample = f"Sample {i+1}: " + (base_text * 2) + f" This is the unique identifier for sample number {i+1}. " * 10
    text_sample = text_sample[:4000]
    texts.append(text_sample)

avg_length = sum(len(t) for t in texts) / len(texts)
print(f"Generated {len(texts)} texts")
print(f"Average length: {avg_length:.0f} characters")
print(f"Total characters: {sum(len(t) for t in texts):,}")
print(f"Estimated tokens: ~{sum(len(t) for t in texts) / 4:.0f}\n")

payload = {
    "model": embedding_model,
    "input": texts
}

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

payload_json = json.dumps(payload)
payload_size_bytes = len(payload_json.encode('utf-8'))
payload_size_mb = payload_size_bytes / (1024 * 1024)

print(f"Payload size: {payload_size_bytes:,} bytes ({payload_size_mb:.2f} MB)")
print(f"Number of texts in batch: {len(texts)}")
print("\nSending batched request...\n")
print("="*60)

start_time = time.time()

try:
    response = requests.post(
        f"{base_url}/embeddings",
        headers=headers,
        json=payload,
        timeout=120
    )
    
    end_time = time.time()
    elapsed_time = end_time - start_time
    
    print(f"Status Code: {response.status_code}")
    print(f"⏱️  Time elapsed: {elapsed_time:.2f} seconds")
    print(f"="*60 + "\n")
    
    if response.status_code == 200:
        try:
            data = response.json()
            
            if isinstance(data, str):
                print("⚠️  Response is double-encoded, parsing again...")
                data = json.loads(data)
            
            if isinstance(data, dict) and 'data' in data:
                embeddings = data['data']
                print(f"✅ SUCCESS! Received {len(embeddings)} embeddings")
                
                if embeddings:
                    embedding_dim = len(embeddings[0].get('embedding', []))
                    print(f"Embedding dimensions: {embedding_dim}")
                    print(f"First embedding sample (first 5 values): {embeddings[0].get('embedding', [])[:5]}")
                
                print("\n" + "="*60)
                print("PERFORMANCE METRICS")
                print("="*60)
                print(f"Total texts processed: {len(texts)}")
                print(f"Total time: {elapsed_time:.2f} seconds")
                print(f"Average time per text: {elapsed_time / len(texts):.3f} seconds")
                print(f"Throughput: {len(texts) / elapsed_time:.2f} texts/second")
                print(f"Total characters: {sum(len(t) for t in texts):,}")
                print(f"Characters per second: {sum(len(t) for t in texts) / elapsed_time:,.0f}")
                print("="*60)
                
            else:
                print("❌ Response doesn't have expected 'data' field")
                print(f"Response structure: {json.dumps(data, indent=2)[:500]}")
                
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse JSON: {e}")
            print(f"Response text (first 1000 chars): {response.text[:1000]}")
    else:
        print(f"❌ Request failed with status {response.status_code}")
        print(f"Response: {response.text[:1000]}")
        
except requests.exceptions.Timeout:
    end_time = time.time()
    print(f"❌ REQUEST TIMEOUT after {end_time - start_time:.2f} seconds")
except Exception as e:
    end_time = time.time()
    print(f"❌ ERROR after {end_time - start_time:.2f} seconds: {e}")
    import traceback
    traceback.print_exc()

