# Build any service from the repository root with --target backend, frontend, or ml-service.

FROM node:20-alpine AS backend
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
EXPOSE 5000
CMD ["npm", "start"]

FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
EXPOSE 3000
CMD ["npm", "start"]

FROM python:3.11-slim AS ml-service
WORKDIR /app
COPY ml-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt
COPY ml-service/src ./src
COPY ml-service/models ./models
WORKDIR /app/src
EXPOSE 8000
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
