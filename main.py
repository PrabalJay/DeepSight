from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import analyze
import os

app = FastAPI(
    title="Deep Sight Backend API",
    description="State-of-the-Art Deepfake Detection System Backend",
    version="1.0.0"
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with specific frontend origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure upload directory exists
os.makedirs("uploads", exist_ok=True)
os.makedirs("reports", exist_ok=True)

# Include routers
app.include_router(analyze.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Deep Sight API. Visit /docs for the API documentation."}
