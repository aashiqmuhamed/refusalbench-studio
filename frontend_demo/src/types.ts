export interface QAExample {
  question: string;
  context: string;
  answer?: string;
}

export interface PerturbationMetadata {
  [key: string]: unknown;
}

export type PerturbationIntensity = 'LOW' | 'MEDIUM' | 'HIGH';

export type PerturbationClass =
  | 'P-Ambiguity'
  | 'P-Contradiction'
  | 'P-MissingInfo'
  | 'P-FalsePremise'
  | 'P-GranularityMismatch'
  | 'P-EpistemicMismatch';

export interface GeneratePerturbationRequest {
  question: string;
  context: string;
  answers: string;
  intensity: PerturbationIntensity;
  perturbation_class: PerturbationClass;
}

export interface PerturbationResponse {
  original_query: string;
  original_context: string;
  original_answers: string | string[];
  perturbation_class: PerturbationClass;
  intensity: PerturbationIntensity;
  generation_successful: boolean;
  perturbed_query?: string;
  perturbed_context?: string;
  lever_selected?: string;
  implementation_reasoning?: string;
  intensity_achieved?: PerturbationIntensity;
  answer_constraint_satisfied?: string;
  expected_rag_behavior?: string;
  ground_truth_label?: string;
  parsing_successful?: boolean;
  error?: string;
  // Generator model info
  generator_model?: string;
  generator_display_name?: string;
}

// Verification types
export interface VerificationResponse {
  verification_result: 'PASS' | 'FAIL';
  lever_correctly_implemented: boolean;
  intensity_correctly_achieved: boolean;
  uncertainty_successfully_induced: boolean;
  implementation_quality_sound: boolean;
  answer_constraint_satisfied: boolean;
  ground_truth_alignment: boolean;
  refusal_class_correct: boolean;
  predicted_rag_behavior: string;
  actual_intensity_observed: PerturbationIntensity;
  identified_issues: string[];
  refusal_reasoning_analysis: string;
  constraint_analysis: string;
  final_ground_truth_label: string;
  parsing_successful?: boolean;
}

export interface VerificationResult extends PerturbationResponse {
  verification_model: string;
  verification_model_name?: string;
  verification_display_name?: string;
  verification_successful: boolean;
  verification_response?: VerificationResponse;
  verification_error?: string;
}

export interface VerifierConfig {
  displayName: string;
  shortName: string;
  color: 'blue' | 'purple' | 'indigo' | 'green' | 'amber' | 'gray';
}

// Save results types
export interface SaveResultsRequest {
  perturbation_data: PerturbationResponse;
  verification_results: VerificationResult[];
}

export interface SaveResultsResponse {
  status: 'success' | 'error';
  message: string;
}

// Inference Lab types
export type InferenceWorkflow = 'self_correction' | 'evidence_first' | 'consistency';

export interface InferenceLabRequest {
  perturbed_query: string;
  perturbed_context: string;
  workflow: InferenceWorkflow;
}

export interface InferenceLabTraceStep {
  step: string;
  prompt?: string;
  output?: string;
  outputs?: string[];
  quotes?: string[];
  none?: boolean;
  passed?: boolean;
  decision?: string;
  traffic_light?: 'red' | 'green';
  shield?: boolean;
  scores?: Record<string, { ratio: number; overlap: number; combined: number }>;
  threshold?: number;
  consistent?: boolean;
}

export interface InferenceLabResponse {
  model_id: string;
  model_display_name: string;
  workflow: InferenceWorkflow;
  final_output: string;
  final_decision: 'answer' | 'refuse';
  trace: InferenceLabTraceStep[];
}

// Dynamic Inference Lab types

export interface DynamicInferenceRequest {
  perturbed_query: string;
  perturbed_context: string;
  workflow_description: string;
  reference_answer?: string;
  workflow_id?: string;
}

export interface TraceStep {
  step: string;
  prompt?: string;
  output?: string;
  outputs?: string[];
  decision?: string;
  temperature?: number;
  quotes?: string[];
  found?: boolean;
  [key: string]: unknown;
}

export interface DynamicInferenceResponse {
  orchestrator_model_id: string;
  orchestrator_display_name: string;
  execution_model_id: string;
  execution_display_name: string;
  workflow: string;
  final_output: string;
  final_decision: 'answer' | 'refuse';
  trace: TraceStep[];
  reference_answer?: string;
  reference_answer_match?: boolean;
  model_raw_output?: string;
}

export interface WorkflowPreset {
  id: string;
  label: string;
  description: string;
}
