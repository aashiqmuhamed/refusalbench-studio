import sqlalchemy
import uuid
from sqlalchemy import  Column, String, Boolean
from sqlalchemy.sql import func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.dialects.postgresql import UUID as pgUUID

Base = declarative_base()

class PerturbationTable(Base):
     __tablename__ = 'perturbation_table'
          
     ID = Column(pgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
     ORIGINAL_QUERY = Column(String(65535))
     ORIGINAL_CONTEXT = Column(String(65535))
     ORIGINAL_ANSWERS = Column(String(65535))
     PERTURBATION_CLASS = Column(String(128))
     INTENSITY = Column(String(128))
     PERTURBED_QUERY = Column(String(65535))
     PERTURBED_CONTEXT = Column(String(65535))
     LEVER_SELECTED = Column(String(128))
     IMPLEMENTATION_REASONING = Column(String(65535))
     INTENSITY_ACHIEVED = Column(String(128))
     ANSWER_CONSTRAINT_SATISFIED = Column(String(65535))
     EXPECTED_RAG_BEHAVIOR = Column(String(65535))
     PARSING_SUCCESSFUL = Column(Boolean)
     # Generator model info
     GENERATOR_MODEL = Column(String(65535))
     GENERATOR_DISPLAY_NAME = Column(String(256))
     # Verifier A
     VERIFICATION_MODEL_A = Column(String(65535))
     VERIFICATION_MODEL_A_DISPLAY_NAME = Column(String(256))
     VERIFICATION_MODEL_A_IS_SUCCESSFUL = Column(Boolean)
     VERIFICATION_MODEL_A_RESPONSE = Column(String(65535))
     # Verifier B
     VERIFICATION_MODEL_B = Column(String(65535))
     VERIFICATION_MODEL_B_DISPLAY_NAME = Column(String(256))
     VERIFICATION_MODEL_B_IS_SUCCESSFUL = Column(Boolean)
     VERIFICATION_MODEL_B_RESPONSE = Column(String(65535))
     # Verifier C
     VERIFICATION_MODEL_C = Column(String(65535))
     VERIFICATION_MODEL_C_DISPLAY_NAME = Column(String(256))
     VERIFICATION_MODEL_C_IS_SUCCESSFUL = Column(Boolean)
     VERIFICATION_MODEL_C_RESPONSE = Column(String(65535))
     # Verifier D
     VERIFICATION_MODEL_D = Column(String(65535))
     VERIFICATION_MODEL_D_DISPLAY_NAME = Column(String(256))
     VERIFICATION_MODEL_D_IS_SUCCESSFUL = Column(Boolean)
     VERIFICATION_MODEL_D_RESPONSE = Column(String(65535))

     LASTUPDATED = Column(sqlalchemy.TIMESTAMP, server_default=func.now())


class DynamicInferenceTable(Base):
     __tablename__ = 'inference_lab_choice_table'
     ID = Column(pgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
     ORCHESTRATOR_MODEL_ID  = Column(String(256))
     EXECUTION_MODEL_ID = Column(String(256))
     WORFLOW = Column(String(65535))
     FINAL_OUTPUT = Column(String(65535))
     FINAL_DECISION = Column(String(256))
     TRACE = Column(String(65535))