import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv('UBIOPS_RAG_1')
base_url = 'https://api.intermax.ubiops.com/v2.1/projects/gradient-ds-proxy/openai-compatible/v1'
embedding_model = 'ubiops-deployment/bge-m3/v1/BAAI/bge-m3'

if not api_key:
    print("Error: UBIOPS_RAG_1 environment variable not found")
    exit(1)

print(f"Using base URL: {base_url}")
print(f"API Key loaded: {api_key[:10]}..." if len(api_key) > 10 else f"API Key: {api_key}")

client = OpenAI(
    api_key=api_key,
    base_url=base_url
)

print("\n" + "="*60)
print("TESTING EMBEDDINGS")
print("="*60 + "\n")

test_text = "This is a test document for embeddings"

print(f"Model: {embedding_model}")
print(f"Input text: '{test_text}'")
print("\nSending embeddings request...\n")

try:
    response = client.embeddings.create(
        model=embedding_model,
        input=test_text
    )
    
    print("✅ Response received!")
    print(f"Response type: {type(response)}")
    print(f"\nRaw response: {response}")
    
    # Try to access data
    if hasattr(response, 'data'):
        print(f"\nEmbedding dimensions: {len(response.data[0].embedding)}")
        print(f"First 10 values: {response.data[0].embedding[:10]}")
    
    if hasattr(response, 'usage'):
        print(f"\nUsage: {response.usage}")
    
    print("\n" + "="*60)
    print("CONFIGURATION FOR .env FILE:")
    print("="*60)
    print(f"\nRAG_OPENAI_BASE_URL={base_url}")
    print(f"RAG_OPENAI_API_KEY=${{UBIOPS_RAG_1}}")
    print(f"RAG_EMBEDDINGS_MODEL={embedding_model}")
    
except Exception as e:
    print(f"❌ ERROR: {e}")
    print(f"\nFull error: {type(e).__name__}: {str(e)}")
    import traceback
    print("\nFull traceback:")
    traceback.print_exc()

