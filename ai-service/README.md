# Nova AI service: local Qwen 2.5 14B

The Nova Personal Stylist (the chat behind the home page's "What room are you entering?" bar) asks a local **Qwen 2.5 14B** model, served by [Ollama](https://ollama.com), for advice and 1–3 shoes from the catalogue. Nothing here runs inside Next.js. The app calls Ollama's OpenAI-compatible API through `POST /api/stylist` (`src/server/stylist/`).

If the model isn't running, is too slow (3.5 s by default) or sends back something unusable, the stylist falls back to the keyword rule engine (`src/lib/stylist.ts`), so the chat always answers.

## Run it

1. Install Ollama: https://ollama.com/download (Windows, macOS) or `curl -fsSL https://ollama.com/install.sh | sh` (Linux).
2. Start it from this folder:
   - Windows: `ai-service\start.bat`
   - macOS / Linux: `sh ai-service/start.sh`

   The script checks that Ollama is installed, starts the server if it isn't running, pulls `qwen2.5:14b` the first time (about 9 GB) and loads the model.

   By hand, the same thing is: `ollama pull qwen2.5:14b`, then `ollama run qwen2.5:14b`.

3. Run `npm run dev` and ask the stylist something. The JSON from `/api/stylist` has `"source": "qwen"` when the model answered and `"source": "rules"` when the fallback did.

Ollama serves an OpenAI-compatible API at `http://127.0.0.1:11434/v1` (the stylist calls `/v1/chat/completions` with `response_format: { "type": "json_object" }`).

## Hardware

`qwen2.5:14b` is Ollama's default 4-bit quantization (**Q4_K_M**), about **9 GB** of weights.

| Setup             | Needs                                                                                 | Speed                        |
| ----------------- | ------------------------------------------------------------------------------------- | ---------------------------- |
| GPU (recommended) | 12 GB+ VRAM (RTX 3060 12 GB, 4070, 4080…) or Apple Silicon with 16 GB+ unified memory | A reply in about 2–5 s       |
| CPU only          | 16 GB RAM (32 GB is more comfortable), a recent 8-core CPU                            | Often 20 s or more per reply |

On a smaller machine use `qwen2.5:7b` (about 4.7 GB), set `STYLIST_LLM_MODEL=qwen2.5:7b` and pull that model instead.

## Settings (`.env`)

| Variable                 | Default                     | What it does                                                                                                                       |
| ------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `STYLIST_LLM_URL`        | `http://127.0.0.1:11434/v1` | The OpenAI-compatible endpoint. `off` always uses the rule engine.                                                                 |
| `STYLIST_LLM_MODEL`      | `qwen2.5:14b`               | The model name Ollama serves.                                                                                                      |
| `STYLIST_LLM_TIMEOUT_MS` | `3500`                      | How long to wait before the rule engine answers. A full 14B reply rarely fits in 3.5 s on a CPU, so raise it (e.g. `30000`) there. |

## Files

- `system-prompt.ts`: the stylist's master system prompt (the Transformation Economy mentor). It asks for `{ "advice": string, "recommendedShoeIds": string[] }`. The server keeps only ids from the catalogue it sent, at most three.
- `start.bat`, `start.sh`: the startup scripts.
- `models/`, `cache/`, `.venv/`: local only and git-ignored, as are `*.gguf` and `*.safetensors` anywhere in the repo. Ollama keeps its own weights in `~/.ollama/models`.

## What the model is told

The stylist sends the system prompt, then a context message with the signed-in borrower's own words ("Whom do you want to become?"), age, shoe size and who they shop for (nothing for visitors), and one line per bookable listing: id, name, who it's for, experiences, sizes, price per day and condition. Prices come from the pricing engine. The model is told never to state a price, discount or wear figure, because the shoe cards under its reply show the engine's price per day.
