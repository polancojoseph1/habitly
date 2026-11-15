FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/polancojoseph1/habitly"

COPY pyproject.toml .
RUN pip install --no-cache-dir --no-compile .

COPY app ./app

RUN groupadd --system --gid 10001 habitly \
    && useradd --system --uid 10001 --gid habitly --home-dir /app habitly \
    && mkdir -p /data \
    && chown habitly:habitly /data

USER 10001:10001
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
