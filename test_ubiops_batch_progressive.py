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
print("TESTING PROGRESSIVE BATCH SIZES")
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

print("Generating text samples of ~4000 characters each...")
all_texts = []
for i in range(50):
    text_sample = f"Sample {i+1}: " + (base_text * 2) + f" This is the unique identifier for sample number {i+1}. " * 10
    text_sample = text_sample[:4000]
    all_texts.append(text_sample)

print(f"Generated {len(all_texts)} texts total\n")

batch_sizes = [1, 5, 10, 20, 30, 50]
results = []

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

for batch_size in batch_sizes:
    if batch_size > len(all_texts):
        break
    
    print(f"\n{'='*60}")
    print(f"Testing batch size: {batch_size} texts")
    print(f"{'='*60}")
    
    texts = all_texts[:batch_size]
    
    payload = {
        "model": embedding_model,
        "input": texts
    }
    
    payload_json = json.dumps(payload)
    payload_size_bytes = len(payload_json.encode('utf-8'))
    payload_size_mb = payload_size_bytes / (1024 * 1024)
    
    print(f"Payload size: {payload_size_bytes:,} bytes ({payload_size_mb:.2f} MB)")
    print(f"Total characters: {sum(len(t) for t in texts):,}")
    print(f"Sending request...")
    
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
        
        if response.status_code == 200:
            try:
                data = response.json()
                
                if isinstance(data, str):
                    data = json.loads(data)
                
                if isinstance(data, dict) and 'data' in data:
                    embeddings = data['data']
                    print(f"✅ SUCCESS - {elapsed_time:.2f}s")
                    print(f"   Received {len(embeddings)} embeddings")
                    print(f"   Throughput: {batch_size / elapsed_time:.2f} texts/sec")
                    
                    results.append({
                        'batch_size': batch_size,
                        'success': True,
                        'time': elapsed_time,
                        'payload_size_mb': payload_size_mb,
                        'throughput': batch_size / elapsed_time
                    })
                else:
                    print(f"❌ FAILED - Unexpected response structure")
                    print(f"   Status: {response.status_code}")
                    results.append({
                        'batch_size': batch_size,
                        'success': False,
                        'error': 'Unexpected response structure'
                    })
                    
            except json.JSONDecodeError as e:
                print(f"❌ FAILED - JSON decode error: {e}")
                results.append({
                    'batch_size': batch_size,
                    'success': False,
                    'error': f'JSON decode error: {e}'
                })
        else:
            end_time = time.time()
            print(f"❌ FAILED - Status {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            results.append({
                'batch_size': batch_size,
                'success': False,
                'error': f'Status {response.status_code}',
                'response_preview': response.text[:200]
            })
            
    except requests.exceptions.Timeout:
        end_time = time.time()
        print(f"❌ TIMEOUT after {end_time - start_time:.2f}s")
        results.append({
            'batch_size': batch_size,
            'success': False,
            'error': 'Timeout'
        })
    except Exception as e:
        end_time = time.time()
        print(f"❌ ERROR: {e}")
        results.append({
            'batch_size': batch_size,
            'success': False,
            'error': str(e)
        })

print("\n\n" + "="*60)
print("SUMMARY OF RESULTS")
print("="*60 + "\n")

for result in results:
    if result['success']:
        print(f"Batch size {result['batch_size']:3d}: ✅ {result['time']:.2f}s ({result['throughput']:.2f} texts/sec, {result['payload_size_mb']:.2f} MB)")
    else:
        print(f"Batch size {result['batch_size']:3d}: ❌ {result['error']}")

successful = [r for r in results if r['success']]
if successful:
    max_batch = max(successful, key=lambda x: x['batch_size'])
    print(f"\nLargest successful batch: {max_batch['batch_size']} texts ({max_batch['payload_size_mb']:.2f} MB)")
    print(f"Best throughput: {max(successful, key=lambda x: x['throughput'])['throughput']:.2f} texts/sec")
else:
    print("\n⚠️  No successful batches - even batch size 1 failed!")
    print("This suggests a configuration or connectivity issue.")

