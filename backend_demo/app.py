import json
import os
import asyncio
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import litellm
import logging
from db_schema import PerturbationTable
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.pool import QueuePool
from contextlib import contextmanager
from dotenv import load_dotenv
import uuid
from datetime import datetime
load_dotenv('keys.env')

# Drop unsupported params instead of raising errors (e.g. temperature for DeepSeek on Bedrock)
litellm.drop_params = True

DB_USERNAME = os.getenv("DB_USERNAME") 
DB_PASSWORD = os.getenv("DB_PASSWORD")
AWS_ENDPOINT = os.getenv("AWS_ENDPOINT")
DB_PORT = 5432
DB_NAME = os.getenv("DB_NAME")

DB_URI = f"postgresql://{DB_USERNAME}:{DB_PASSWORD}@{AWS_ENDPOINT}:{DB_PORT}/{DB_NAME}?keepalives=1&keepalives_idle=30&keepalives_interval=10&keepalives_count=5"


engine = create_engine(DB_URI, echo = False,
    poolclass=QueuePool,
    pool_size=5,  # Number of connections to keep open
    max_overflow=10,  # Max extra connections when pool is full
    pool_timeout=30,  # Seconds to wait for a connection from pool
    pool_recycle=1800,  # Recycle connections after 30 minutes
    pool_pre_ping=True)

db_Session = sessionmaker(bind=engine)

@contextmanager
def get_session():
    session = db_Session()
    try:
        yield session
        session.commit()
    except:
        session.rollback()
        raise
    finally:
        session.close()
        
Base = declarative_base()

logging.basicConfig( 
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=False,  # Set to False when using wildcard origins
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/config")
async def get_config():
    """Return the current configuration (without sensitive data)."""
    try:
        from config_loader import load_config
        config = load_config()
        
        # Return sanitized config (remove any sensitive data)
        return JSONResponse(content={
            "generator": {
                "provider": config.get("generator", {}).get("provider"),
                "model_id": config.get("generator", {}).get("model_id"),
                "display_name": config.get("generator", {}).get("display_name"),
            },
            "verifiers": [
                {
                    "name": v.get("name"),
                    "provider": v.get("provider"),
                    "model_id": v.get("model_id"),
                    "display_name": v.get("display_name")
                }
                for v in config.get("verifiers", [])
            ],
            "verifier_count": len(config.get("verifiers", [])),
            # User-study evaluators: blinded display names only (no model_id exposed)
            "evaluators": [
                {
                    "tab_index": i,
                    "name": e.get("name"),
                    "display_name": e.get("display_name"),
                }
                for i, e in enumerate(config.get("evaluators", []))
            ],
            "evaluator_count": len(config.get("evaluators", [])),
            "evaluation_engine": {
                "provider": config.get("evaluation_engine", {}).get("provider"),
                "model_id": config.get("evaluation_engine", {}).get("model_id"),
                "display_name": config.get("evaluation_engine", {}).get("display_name"),
            },
            "orchestrator": {
                "display_name": config.get("orchestrator", {}).get("display_name"),
            },
            "execution_model": {
                "display_name": config.get("execution_model", {}).get("display_name"),
                "provider": config.get("execution_model", {}).get("provider"),
            }
        })
    except Exception as e:
        logger.error(f"Error loading config: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)


from refusalbench_classes.generator import AsyncRefusalBenchGenerator
from prompt_guidelines import RefusalBenchCatalogue

@app.post('/perturb')
async def generate_perturbation(request: Request):
    """Async main function to run perturbation generation."""
    data = await request.json()
    
    question = data.get('question')
    context = data.get('context')
    answers = data.get('answers')
    perturbation_class = data.get('perturbation_class')
    intensity = data.get('intensity')

    
    if not question or not context or not answers:
        raise HTTPException(status_code=400, detail="Missing required fields")
    
    # Initialize generator using config file
    # The generator will automatically load from config.yaml
    generator = AsyncRefusalBenchGenerator()
    
    # Process dataset
    all_perturbations = await generator.process_instance_async(
        question, context, answers, 
        perturbation_class,
        intensity
    )

    catalogue = RefusalBenchCatalogue()
    all_perturbations["ground_truth_label"] = catalogue.get_ground_truth(perturbation_class, intensity)

    return JSONResponse(content=all_perturbations)


from refusalbench_classes.verifier import MultiModelAsyncRefusalBenchVerifier
@app.post('/verify')
async def verify_perturbation(request: Request):
    """Async main function to run perturbation verification with all configured verifiers."""
    perturbation_data = await request.json()
    
    # Initialize verifier using config file
    # The verifier will automatically load 4 models from config.yaml
    verifier = MultiModelAsyncRefusalBenchVerifier()
    
    tasks = [
        verifier.verify_perturbation_async(model, perturbation_data) 
        for model in verifier.models
    ]
    
    async def stream_results():
        try:
            yield '['
            first = True
            for coro in asyncio.as_completed(tasks):
                result = await coro
                if not first:
                    yield ','
                else:
                    first = False
                yield json.dumps(result)
            yield ']'
        except Exception as e:
            logger.error(f"Error streaming results: {e}")
            raise e
 

    return StreamingResponse(stream_results(), media_type='application/json')


# ── Dynamic Inference Lab ─────────────────────────────────────────────

from config_loader import get_orchestrator_config, get_execution_model_config, get_agent_config
from orchestrator import DynamicOrchestrator
from db_schema import DynamicInferenceTable

REFUSE_CODES = [
    "REFUSE_AMBIGUOUS_QUERY", "REFUSE_CONTRADICTORY_CONTEXT",
    "REFUSE_INFO_MISSING_IN_CONTEXT", "REFUSE_FALSE_PREMISE_IN_QUERY",
    "REFUSE_GRANULARITY_MISMATCH", "REFUSE_NONFACTUAL_QUERY", "REFUSE_OTHER",
]


def check_reference_answer(trace: list, reference_answer: str) -> tuple:
    """
    Extract the raw model output from the first call_model trace step and
    compare it against the expected reference_answer (ground_truth_label).

    Returns (model_raw_output, match_bool).
    """
    model_raw_output = None
    for step in trace:
        if step.get("step") == "call_model":
            model_raw_output = step.get("output", "")
            break

    if model_raw_output is None:
        return None, False

    if reference_answer == "ANSWER_CORRECTLY":
        match = not any(code in model_raw_output for code in REFUSE_CODES)
    elif reference_answer in REFUSE_CODES:
        match = reference_answer in model_raw_output
    else:
        match = False

    return model_raw_output, match


@app.post("/inference_lab")
async def inference_lab(request: Request):
    """
    Run an evaluation workflow via the orchestrator for the configured execution model.

    Request body:
      - perturbed_query: str (required)
      - perturbed_context: str (required)
      - workflow_description: str (required)
    """
    try:
        data = await request.json()

        perturbed_query = data.get("perturbed_query", "").strip()
        perturbed_context = data.get("perturbed_context", "").strip()
        workflow_description = data.get("workflow_description", "").strip()
        reference_answer = data.get("reference_answer", "").strip() or None
        workflow_id = data.get("workflow_id", "").strip() or None

        if not perturbed_query:
            raise HTTPException(status_code=400, detail="Missing required field: perturbed_query")
        if not perturbed_context:
            raise HTTPException(status_code=400, detail="Missing required field: perturbed_context")
        if not workflow_description:
            raise HTTPException(status_code=400, detail="Missing required field: workflow_description")

        orch_config = get_orchestrator_config()
        exec_config = get_execution_model_config()
        agent_config = get_agent_config()

        logger.info(f"Orchestrator: {orch_config.get('display_name')}")
        logger.info(f"Execution model: {exec_config.get('display_name')} ({exec_config.get('model_id')})")
        logger.info(f"Workflow: {workflow_description[:80]}...")

        runner = DynamicOrchestrator(
            orchestrator_provider=orch_config.get("provider", "bedrock"),
            orchestrator_model_id=orch_config.get("model_id", ""),
            orchestrator_kwargs=orch_config.get("model_kwargs", {}),
            execution_model_id=exec_config["model_string"],
            execution_model_kwargs=exec_config.get("model_kwargs", {}),
            max_turns=agent_config.get("max_turns", 15),
            max_concurrent=agent_config.get("max_concurrent", 5),
        )

        result = await runner.run(perturbed_query, perturbed_context, workflow_description)

        response = {
            "orchestrator_model_id": orch_config.get("model_id"),
            "orchestrator_display_name": orch_config.get("display_name", ""),
            "execution_model_id": exec_config.get("model_id"),
            "execution_display_name": exec_config.get("display_name", ""),
            "workflow": result.get("workflow", "custom"),
            "final_output": result.get("final_output"),
            "final_decision": result.get("final_decision"),
            "trace": result.get("trace", []),
        }

        if workflow_id == "refusalbench_baseline" and reference_answer:
            model_raw_output, match = check_reference_answer(
                result.get("trace", []), reference_answer
            )
            response["reference_answer"] = reference_answer
            response["reference_answer_match"] = match
            response["model_raw_output"] = model_raw_output

        return JSONResponse(content=response)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in inference_lab endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Inference lab failed: {str(e)}")


@app.post("/inference_lab_choice")
async def save_inference_lab_choice(request: Request):
    """Save an inference lab result to the database."""
    try:
        data = await request.json()
        trace = data.get("trace", [])
        trace_string = json.dumps(trace) if trace else ""

        with get_session() as session:
            record = DynamicInferenceTable(
                ORCHESTRATOR_MODEL_ID=data.get("orchestrator_model_id"),
                EXECUTION_MODEL_ID=data.get("execution_model_id"),
                WORFLOW=data.get("workflow", "custom"),
                FINAL_OUTPUT=data.get("final_output"),
                FINAL_DECISION=data.get("final_decision"),
                TRACE=trace_string,
            )
            session.add(record)

        logger.info("Stored inference lab choice")
        return JSONResponse(content={"status": "success", "message": "Choice and data stored successfully"})
    except Exception as e:
        logger.error(f"Error saving inference lab choice: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Save failed: {str(e)}")


def _get_verifier_result(verification_results: list, index: int) -> dict:
    """Safely get verifier result at index, returning empty dict if not found."""
    if index < len(verification_results):
        return verification_results[index]
    return {}


@app.post('/save_results')
async def save_results(request: Request):
    """Store perturbation and verification results in the database."""
    try:
        data = await request.json()

        perturbation_data = data.get('perturbation_data', {})
        verification_results = data.get('verification_results', [])
        
        # Map verification results to models A, B, C, D
        verifier_model_a_result = _get_verifier_result(verification_results, 0)
        verifier_model_b_result = _get_verifier_result(verification_results, 1)
        verifier_model_c_result = _get_verifier_result(verification_results, 2)
        verifier_model_d_result = _get_verifier_result(verification_results, 3)
        
        # Prepare answers as string
        original_answers = perturbation_data.get('original_answers', [])
        if isinstance(original_answers, list):
            original_answers = json.dumps(original_answers)
        
        with get_session() as session:
            record = PerturbationTable(
                ORIGINAL_QUERY=perturbation_data.get('original_query', ''),
                ORIGINAL_CONTEXT=perturbation_data.get('original_context', ''),
                ORIGINAL_ANSWERS=original_answers,
                PERTURBATION_CLASS=perturbation_data.get('perturbation_class', ''),
                INTENSITY=perturbation_data.get('intensity', ''),
                PERTURBED_QUERY=perturbation_data.get('perturbed_query', ''),
                PERTURBED_CONTEXT=perturbation_data.get('perturbed_context', ''),
                LEVER_SELECTED=perturbation_data.get('lever_selected', ''),
                IMPLEMENTATION_REASONING=perturbation_data.get('implementation_reasoning', ''),
                INTENSITY_ACHIEVED=perturbation_data.get('intensity_achieved', ''),
                ANSWER_CONSTRAINT_SATISFIED=str(perturbation_data.get('answer_constraint_satisfied', '')),
                EXPECTED_RAG_BEHAVIOR=perturbation_data.get('expected_rag_behavior', ''),
                PARSING_SUCCESSFUL=perturbation_data.get('parsing_successful', False),
                GENERATOR_MODEL=perturbation_data.get('generator_model', ''),
                GENERATOR_DISPLAY_NAME=perturbation_data.get('generator_display_name', ''),
                # Verifier A
                VERIFICATION_MODEL_A=verifier_model_a_result.get('verification_model', ''),
                VERIFICATION_MODEL_A_DISPLAY_NAME=verifier_model_a_result.get('verification_display_name', ''),
                VERIFICATION_MODEL_A_IS_SUCCESSFUL=verifier_model_a_result.get('verification_successful', False),
                VERIFICATION_MODEL_A_RESPONSE=json.dumps(verifier_model_a_result.get('verification_response', {})),
                # Verifier B
                VERIFICATION_MODEL_B=verifier_model_b_result.get('verification_model', ''),
                VERIFICATION_MODEL_B_DISPLAY_NAME=verifier_model_b_result.get('verification_display_name', ''),
                VERIFICATION_MODEL_B_IS_SUCCESSFUL=verifier_model_b_result.get('verification_successful', False),
                VERIFICATION_MODEL_B_RESPONSE=json.dumps(verifier_model_b_result.get('verification_response', {})),
                # Verifier C
                VERIFICATION_MODEL_C=verifier_model_c_result.get('verification_model', ''),
                VERIFICATION_MODEL_C_DISPLAY_NAME=verifier_model_c_result.get('verification_display_name', ''),
                VERIFICATION_MODEL_C_IS_SUCCESSFUL=verifier_model_c_result.get('verification_successful', False),
                VERIFICATION_MODEL_C_RESPONSE=json.dumps(verifier_model_c_result.get('verification_response', {})),
                # Verifier D
                VERIFICATION_MODEL_D=verifier_model_d_result.get('verification_model', ''),
                VERIFICATION_MODEL_D_DISPLAY_NAME=verifier_model_d_result.get('verification_display_name', ''),
                VERIFICATION_MODEL_D_IS_SUCCESSFUL=verifier_model_d_result.get('verification_successful', False),
                VERIFICATION_MODEL_D_RESPONSE=json.dumps(verifier_model_d_result.get('verification_response', {})),
            )
            session.add(record)
        
        logger.info(f"Stored perturbation and verification data from {len(verification_results)} verifiers")
        return JSONResponse(content={"status": "success", "message": "Results stored successfully"})
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error storing results: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to store results: {str(e)}")


if __name__ == '__main__':
    
    uvicorn.run(
    "app:app",
    host='0.0.0.0',
    port=4075,
    workers=4,
    timeout_keep_alive=3000,
    reload=True
)
