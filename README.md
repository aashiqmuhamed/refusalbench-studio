# RefusalBench Studio: Interactive Platform for Generative Evaluation of LLM Selective Refusal

[![Paper](https://img.shields.io/badge/paper-arXiv-blue)]()
[![Demo](https://img.shields.io/badge/demo-YouTube-red)](https://youtu.be/-3B2aLRTa-k?si=VsbI5si_DUXOKqRa)
[![Leaderboard](https://img.shields.io/badge/leaderboard-live-brightgreen)](http://refusalbench-leaderboard.s3-website-us-east-1.amazonaws.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## 📚 Overview

RefusalBench Studio is an interactive web platform for generative evaluation of selective refusal in Retrieval-Augmented Generation (RAG) systems with agentic evaluation workflows. Built on top of the [RefusalBench](https://github.com/aashiqmuhamed/refusalbench) evaluation framework, it provides a browser-based interface for generating linguistically-grounded perturbations, verifying them with multiple frontier models in parallel, and running custom evaluation workflows.

Our experiments with the platform reveal that **self-correction systematically degrades refusal accuracy across frontier models** — a finding enabled by the agentic evaluation workflows unique to RefusalBench Studio.

### 🎯 Key Features

1. **Perturbation Generation** — Generate linguistically-grounded perturbations using 90 levers across 6 uncertainty dimensions with 3 intensity levels, powered by the full RefusalBench catalogue
2. **Multi-Model Verification** — Verify perturbation quality with 4 configurable verifier models running in parallel, with streaming results and an agreement matrix
3. **Inference Lab** — Build and execute custom evaluation workflows through a tool-use orchestrator that autonomously drives multi-step reasoning chains
4. **Multi-Provider LLM Support** — Unified interface via LiteLLM supporting AWS Bedrock, Google Vertex AI, OpenAI, and vLLM (local models)
5. **Database Persistence** — PostgreSQL storage for perturbation results, verification outcomes, and inference lab traces

## 🗂️ Repository Structure

```
refusalbench-studio/
├── README.md                              # This file
├── LICENSE                                # MIT License
│
├── backend_demo/                          # FastAPI backend (Python)
│   ├── app.py                             # Main FastAPI application & API endpoints
│   ├── orchestrator.py                    # Dynamic Inference Lab orchestrator (tool-use agent loop)
│   ├── config_loader.py                   # YAML config loader & multi-provider setup
│   ├── config.yaml                        # Universal configuration for all models & providers
│   ├── keys.env                           # Environment variables (API keys, DB credentials)
│   ├── prompt_guidelines.py               # RefusalBench catalogue (90 perturbation levers)
│   ├── db_schema.py                       # SQLAlchemy database models
│   ├── create_tables.py                   # Database initialization script
│   ├── requirements.txt                   # Python dependencies
│   ├── Dockerfile                         # Container image for backend
│   │
│   ├── refusalbench_classes/              # Core RefusalBench evaluation classes
│   │   ├── generator.py                   # Async perturbation generator
│   │   ├── verifier.py                    # Multi-model async verifier
│   │   ├── evaluator.py                   # RAG model evaluator (dual logic)
│   │   └── multi_evaluator.py             # Multi-model evaluator for user studies
│   │
│   └── tools/                             # Dynamic Inference Lab tools
│       ├── registry.py                    # Tool registry & schema definitions
│       ├── call_model.py                  # Call execution model tool
│       ├── compare_texts.py               # Text similarity comparison tool
│       ├── extract_quotes.py              # Quote extraction tool
│       └── make_decision.py               # Final decision tool (answer/refuse)
│
└── frontend_demo/                         # React + TypeScript frontend (Vite)
    ├── package.json                       # Node.js dependencies
    ├── vite.config.ts                     # Vite config with API proxy
    ├── src/
    │   ├── App.tsx                         # Main app with view routing
    │   ├── api.ts                          # API client
    │   ├── types.ts                        # TypeScript type definitions
    │   ├── components/
    │   │   ├── InputPanel.tsx              # Perturbation generation form
    │   │   ├── TransformVisualization.tsx  # Side-by-side diff visualization
    │   │   ├── VerificationDashboard.tsx   # Multi-model verification UI
    │   │   ├── DynamicInferenceLab.tsx     # Custom workflow builder & trace viewer
    │   │   ├── DiffText.tsx               # Word-level text diff component
    │   │   └── JsonPreview.tsx            # JSON metadata viewer
    │   └── styles/
    │       ├── global.css                  # CSS variables & base styles
    │       └── app.css                     # Component-specific styles
```


## 🔧 Installation

### Prerequisites

- Python 3.12+
- Node.js 18+
- PostgreSQL (for result persistence)
- API access to at least one LLM provider (AWS Bedrock, OpenAI, Google Vertex AI, or a local vLLM server)

### Backend Setup

```bash
cd backend_demo

# Install Python dependencies
pip install -r requirements.txt

# Configure environment variables
# Edit keys.env with your credentials:
#   - AWS Bedrock keys (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)
#   - OpenAI key (OPENAI_API_KEY)
#   - Google Vertex AI credentials (GOOGLE_APPLICATION_CREDENTIALS, VERTEX_PROJECT, VERTEX_LOCATION)
#   - Database credentials (DB_USERNAME, DB_PASSWORD, AWS_ENDPOINT, DB_NAME)

# Initialize the database
python create_tables.py

# Start the backend server
python app.py
# Server runs on http://localhost:4075
```

### Frontend Setup

```bash
cd frontend_demo

# Install Node.js dependencies
npm install

# Start the development server
npm run dev
# Frontend runs on http://localhost:5173
# API requests are proxied to the backend at :4075
```

### Docker (Backend)

```bash
cd backend_demo

# Build the image
docker build -t refusalbench-studio .

# Run the container
docker run -p 4075:4075 --env-file keys.env refusalbench-studio
```

## ⚙️ Configuration

All model and provider settings are defined in a single [`config.yaml`](backend_demo/config.yaml) file. The configuration supports four LLM providers through a unified LiteLLM interface.

### Model Roles

| Role | Count | Purpose |
|------|-------|---------|
| **Generator** | 1 | Generates perturbations from the RefusalBench catalogue |
| **Verifiers** | 4 | Verify perturbation quality in parallel (A/B/C/D) |
| **Evaluators** | 3 | User study models with blinded names (Model A/B/C) |
| **Evaluation Engine** | 1 | Judge model for scoring answer quality (1-5 scale) |
| **Orchestrator** | 1 | Drives the Dynamic Inference Lab tool-use agent loop |
| **Execution Model** | 1 | The model being evaluated in the Inference Lab |

### Provider Configuration Examples

```yaml
# AWS Bedrock
generator:
  provider: "bedrock"
  model_id: "us.anthropic.claude-opus-4-6-v1"
  display_name: "Claude Opus 4.6"
  temperature: 0.1
  max_tokens: 2000
  aws_region: "us-east-1"
  use_converse: false      # Set true for models using the Converse API

# OpenAI
evaluator:
  provider: "openai"
  model_id: "gpt-5.2"
  display_name: "GPT-5.2"
  temperature: 0.1
  max_tokens: 2000

# Google Vertex AI
verifier:
  provider: "vertex_ai"
  model_id: "gemini-2.0-flash"
  display_name: "Gemini 2.0 Flash"
  temperature: 0.1
  max_tokens: 2000

# vLLM (local / self-hosted)
evaluator:
  provider: "vllm"
  model_id: "meta-llama/Llama-3.2-1B-Instruct"
  display_name: "Llama 3.2 1B (vLLM)"
  api_base: "http://localhost:8000/v1"
  api_key: "EMPTY"
  temperature: 0.7
  max_tokens: 2000
```

### Environment Variables (`keys.env`)

```bash
# AWS Bedrock
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1

# Google Vertex AI
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
VERTEX_PROJECT=your-gcp-project-id
VERTEX_LOCATION=us-central1

# OpenAI
OPENAI_API_KEY=your-openai-key

# PostgreSQL Database
DB_USERNAME=your-db-user
DB_PASSWORD=your-db-password
AWS_ENDPOINT=your-db-host.rds.amazonaws.com
DB_NAME=your-db-name
```

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/config` | Returns sanitized configuration (no secrets) |
| `POST` | `/perturb` | Generate a perturbation for a QA instance |
| `POST` | `/verify` | Verify a perturbation with all configured verifiers (streaming) |
| `POST` | `/inference_lab` | Execute a workflow via the Dynamic Inference Lab |
| `POST` | `/inference_lab_choice` | Save an Inference Lab result to the database |
| `POST` | `/save_results` | Store perturbation and verification results in the database |



## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

## 🔗 Links

- [Paper (Arxiv)]()
- [Demo Video (YouTube)](https://youtu.be/-3B2aLRTa-k?si=VsbI5si_DUXOKqRa)
- [Leaderboard](http://refusalbench-leaderboard.s3-website-us-east-1.amazonaws.com/)
- [RefusalBench (core benchmark)](https://github.com/aashiqmuhamed/refusalbench)
