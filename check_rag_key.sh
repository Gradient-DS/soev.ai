#!/bin/bash

echo "==================================================="
echo "Checking RAG API container FULL API KEY"
echo "==================================================="
echo ""

echo "OPENAI_API_KEY in container:"
docker exec dev-rag-api printenv OPENAI_API_KEY
echo ""

echo "OPENAI_BASE_URL in container:"
docker exec dev-rag-api printenv OPENAI_BASE_URL
echo ""

echo "EMBEDDINGS_MODEL in container:"
docker exec dev-rag-api printenv EMBEDDINGS_MODEL
echo ""

echo "==================================================="
echo "Comparing with .env file"
echo "==================================================="
echo ""

echo "UBIOPS_RAG_1 from .env:"
grep "^UBIOPS_RAG_1=" .env | cut -d'=' -f2
echo ""

echo "RAG_OPENAI_BASE_URL from .env:"
grep "^RAG_OPENAI_BASE_URL=" .env | cut -d'=' -f2
echo ""

echo "RAG_EMBEDDINGS_MODEL from .env:"
grep "^RAG_EMBEDDINGS_MODEL=" .env | cut -d'=' -f2
echo ""

echo "==================================================="
echo "Checking if there's a plain OPENAI_API_KEY in .env"
echo "==================================================="
echo ""
grep "^OPENAI_API_KEY=" .env || echo "(not found in .env)"
echo ""

