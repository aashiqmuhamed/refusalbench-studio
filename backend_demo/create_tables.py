import os
from re import S
from sqlalchemy import  create_engine, MetaData
from sqlalchemy.ext.declarative import declarative_base
from dotenv import load_dotenv

from db_schema import PerturbationTable, DynamicInferenceTable

load_dotenv('keys.env')

DB_USERNAME = os.getenv("DB_USERNAME")
DB_PASSWORD = os.getenv("DB_PASSWORD")
AWS_ENDPOINT = os.getenv("AWS_ENDPOINT")
DB_PORT = 5432
DB_NAME = os.getenv("DB_NAME")

DB_URI = f"postgresql://{DB_USERNAME}:{DB_PASSWORD}@{AWS_ENDPOINT}:{DB_PORT}/{DB_NAME}"
print(DB_URI)
engine = create_engine(DB_URI, echo = False)

Base = declarative_base()

PerturbationTable.__table__.create(bind=engine)
DynamicInferenceTable.__table__.create(bind=engine)




md = MetaData()
md.reflect(bind=engine)
#@md.drop_all(bind=engine)

print("The tables are")
print(md.tables.keys())