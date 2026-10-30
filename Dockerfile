FROM node:22-bookworm-slim AS ui
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    MD_APP_MODE=demo MD_DATA_DIR=/data MD_SERVE_FRONTEND=true \
    MD_FRONTEND_DIR=/app/frontend/dist PORT=8080
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && \
    useradd --uid 10001 --create-home mdapp && mkdir -p /data && chown mdapp:mdapp /data
COPY backend/app ./app
COPY sample_data/public_demo /app/sample_data/public_demo
COPY --from=ui /build/frontend/dist /app/frontend/dist
USER mdapp
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8080')+'/api/health', timeout=3)"
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
