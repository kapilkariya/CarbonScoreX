FROM python:3.11-alpine

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN apk add --no-cache --virtual .build-deps build-base python3-dev \
    && pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt numpy \
    && apk del .build-deps

COPY src ./src
WORKDIR /app/src
EXPOSE 8000
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
