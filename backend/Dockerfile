# The API. uv for the install, then a non-root user: nothing here needs root,
# and the volume below is the only thing it writes to.
FROM python:3.13-slim AS base
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Dependencies first, so a code change does not reinstall Pillow and friends.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
RUN uv sync --frozen --no-dev

# The database and the uploads live on a volume, not in the image: an image is
# replaced on every deploy and these have to outlive that.
ENV VCARD_DB=/data/app.db VCARD_UPLOADS=/data/uploads
RUN mkdir -p /data && useradd --create-home --uid 10001 cards && chown -R cards /data /app
USER cards
VOLUME /data

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health')"
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
