#!/bin/sh
# Starts the local Qwen 2.5 14B model for the Nova Personal Stylist (see README.md).
set -e

MODEL="${STYLIST_LLM_MODEL:-qwen2.5:14b}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama is not installed. Get it from https://ollama.com/download"
  echo "(Linux: curl -fsSL https://ollama.com/install.sh | sh), then run this again."
  exit 1
fi

# Start the server unless it is already listening on 11434.
if ! ollama list >/dev/null 2>&1; then
  echo "Starting the Ollama server..."
  ollama serve >/dev/null 2>&1 &
  i=0
  until ollama list >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -gt 30 ]; then
      echo "The Ollama server did not start."
      exit 1
    fi
    sleep 1
  done
fi

if ! ollama list | awk 'NR > 1 { print $1 }' | grep -qx "$MODEL"; then
  echo "Pulling $MODEL (about 9 GB the first time)..."
  ollama pull "$MODEL"
fi

echo "Qwen is ready at http://127.0.0.1:11434/v1 (model $MODEL). Ctrl+D or /bye leaves the chat; the server keeps running."
ollama run "$MODEL"
