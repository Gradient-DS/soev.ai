import os
import requests
import json
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
print("TESTING RAW HTTP REQUEST")
print("="*60 + "\n")

test_text = "This is a test document for embeddings"

payload = {
    "model": embedding_model,
    "input": test_text
}

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

print(f"Request payload:")
print(json.dumps(payload, indent=2))
print("\nSending request...\n")

try:
    response = requests.post(
        f"{base_url}/embeddings",
        headers=headers,
        json=payload,
        timeout=30
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response Headers: {dict(response.headers)}\n")
    
    print("="*60)
    print("RAW RESPONSE BODY:")
    print("="*60)
    print(response.text[:2000])  # First 2000 chars
    print("="*60 + "\n")
    
    if response.status_code == 200:
        try:
            data = response.json()
            print("JSON parsed successfully!")
            print(f"Response type: {type(data)}")
            
            # Check if it's double-encoded (string instead of dict)
            if isinstance(data, str):
                print("\n⚠️  Response is a STRING (double-encoded JSON)!")
                print("Attempting to parse the string as JSON...\n")
                
                actual_data = json.loads(data)
                print(f"After second parse - type: {type(actual_data)}")
                print(f"Keys: {actual_data.keys() if isinstance(actual_data, dict) else 'Not a dict'}")
                
                if isinstance(actual_data, dict) and 'data' in actual_data:
                    print("\n✅ After double-parsing: Has 'data' field!")
                    if actual_data['data'] and len(actual_data['data']) > 0:
                        embedding = actual_data['data'][0].get('embedding', [])
                        print(f"Embedding dimensions: {len(embedding)}")
                        print(f"First 5 values: {embedding[:5]}")
                        
                        print("\n" + "="*60)
                        print("🔴 PROBLEM IDENTIFIED:")
                        print("="*60)
                        print("UbiOps is returning DOUBLE-ENCODED JSON!")
                        print("This is NOT properly OpenAI-compatible.")
                        print("\nThe response should be a JSON object, not a JSON string.")
                        print("This needs to be fixed in the UbiOps deployment configuration.")
                else:
                    print(f"Parsed data: {json.dumps(actual_data, indent=2)[:500]}")
            
            elif isinstance(data, dict):
                print(f"Response keys: {data.keys()}")
                
                if 'data' in data:
                    print("\n✅ Has 'data' field - OpenAI compatible!")
                    if data['data'] and len(data['data']) > 0:
                        print(f"Embedding dimensions: {len(data['data'][0].get('embedding', []))}")
                else:
                    print("\n❌ Missing 'data' field - NOT OpenAI compatible")
                    print(f"Full response structure: {json.dumps(data, indent=2)[:500]}")
                
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse JSON: {e}")
    else:
        print(f"❌ Request failed with status {response.status_code}")
        
except Exception as e:
    print(f"❌ ERROR: {e}")
    import traceback
    traceback.print_exc()

