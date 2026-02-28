FROM python:3.12-slim

RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

WORKDIR /backend_demo

COPY . .

RUN pip install --no-cache-dir --trusted-host pypi.python.org -r requirements.txt

EXPOSE 4075


# FastAPI (ASGI)
CMD ["gunicorn", "app:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:4075", "--timeout", "120"]