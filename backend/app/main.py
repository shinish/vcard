"""Application assembly."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import reports
from .config import CORS_ORIGINS, UPLOADS
from .db import init
from .routes_admin import router as admin_router
from .routes_portal import router as portal_router
from .routes_public import router as public_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    UPLOADS.mkdir(parents=True, exist_ok=True)
    init()
    async with reports.running():
        yield


app = FastAPI(title="vcard", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,  # the admin session rides in a cookie
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)
app.include_router(public_router)
app.include_router(admin_router)
app.include_router(portal_router)


@app.get("/health")
def health():
    return {"ok": True}
