FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libmagic1 \
    && rm -rf /var/lib/apt/lists/*

COPY . .

ARG BACKEND_INSTALL_RAG=false
RUN if [ "$BACKEND_INSTALL_RAG" = "true" ]; then \
        pip install --no-cache-dir ".[rag]"; \
    else \
        pip install --no-cache-dir .; \
    fi

EXPOSE 6522

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "6522"]
