import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv('UBIOPS_KEY_1')
base_url = 'https://api.intermax.ubiops.com/v2.1/projects/gradient-ds-proxy/openai-compatible/v1'
chat_model = 'ubiops-deployment/gpt-oss-120b/v1/openai/gpt-oss-120b'

if not api_key:
    print("Error: UBIOPS_RAG_1 environment variable not found")
    exit(1)

print(f"Using base URL: {base_url}/chat/completions")
print(f"API Key: {api_key[:10]}...")
print("\n" + "="*60)
print("TESTING CHAT COMPLETIONS")
print("="*60 + "\n")

payload = {
    "model": chat_model,
    "messages": [
        {"role": "user", "content": "Say hello in exactly 3 words"}
    ],
    "max_tokens": 10
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
        f"{base_url}/chat/completions",
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
                
                if isinstance(actual_data, dict):
                    print("\n✅ After double-parsing: Got dict!")
                    print(f"Response structure: {json.dumps(actual_data, indent=2)[:800]}")
                    
                    if 'choices' in actual_data:
                        print(f"\nMessage: {actual_data['choices'][0].get('message', {}).get('content', 'N/A')}")
                    
                    print("\n" + "="*60)
                    print("🔴 PROBLEM IDENTIFIED:")
                    print("="*60)
                    print("UbiOps is returning DOUBLE-ENCODED JSON!")
                    print("This is NOT properly OpenAI-compatible.")
                    print("\nThe response should be a JSON object, not a JSON string.")
                    print("This needs to be fixed in the UbiOps deployment configuration.")
                else:
                    print(f"Parsed data: {actual_data}")
            
            elif isinstance(data, dict):
                print(f"Response keys: {data.keys()}")
                
                if 'choices' in data:
                    print("\n✅ Has 'choices' field - OpenAI compatible format!")
                    print(f"Response structure (first 500 chars):")
                    print(json.dumps(data, indent=2)[:500])
                    
                    if data['choices']:
                        message = data['choices'][0].get('message', {})
                        print(f"\nMessage content: {message.get('content', 'N/A')}")
                    
                    print("\n✅ Chat completions endpoint is properly formatted!")
                else:
                    print("\n❌ Missing 'choices' field - NOT OpenAI compatible")
                    print(f"Full response structure: {json.dumps(data, indent=2)[:800]}")
                
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse JSON: {e}")
    else:
        print(f"❌ Request failed with status {response.status_code}")
        
except Exception as e:
    print(f"❌ ERROR: {e}")
    import traceback
    traceback.print_exc()

