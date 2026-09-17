from __future__ import annotations

import os
import tempfile
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

try:
    from .processor import MODEL_REGISTRY, ModelUnavailableError, analyze_media
except ImportError: 
    from processor import MODEL_REGISTRY, ModelUnavailableError, analyze_media


MAX_FILE_BYTES = 20 * 1024 * 1024
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".webm", ".mkv"}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_BYTES
allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGIN",
        "http://localhost:5000,http://127.0.0.1:5000,http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
CORS(app, resources={r"/*": {"origins": allowed_origins}})


def _media_type(filename: str, mimetype: str) -> str | None:
    extension = Path(filename).suffix.lower()
    if extension in IMAGE_EXTENSIONS or mimetype.startswith("image/"):
        return "image"
    if extension in VIDEO_EXTENSIONS or mimetype.startswith("video/"):
        return "video"
    return None


@app.get("/health")
def health() -> tuple:
    return jsonify(
        {
            "status": "ok",
            "max_upload_mb": MAX_FILE_BYTES // (1024 * 1024),
            "models": {
                "image": MODEL_REGISTRY.status("image"),
                "video": MODEL_REGISTRY.status("video"),
            },
        }
    ), 200


@app.post("/analyze")
def analyze() -> tuple:
    uploaded = request.files.get("file")
    if uploaded is None or not uploaded.filename:
        return jsonify({"error": "Choose an image or video file before scanning."}), 400

    filename = secure_filename(uploaded.filename)
    media_type = _media_type(filename, uploaded.mimetype or "")
    if media_type is None:
        return jsonify({"error": "Supported files are JPG, PNG, WEBP, MP4, MOV, AVI, WEBM, and MKV."}), 400

    suffix = Path(filename).suffix.lower()
    temp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temporary_file:
            temp_path = temporary_file.name
            uploaded.save(temp_path)
        result = analyze_media(temp_path, media_type)
        result["file_name"] = filename
        return jsonify(result), 200
    except ModelUnavailableError as exc:
        return jsonify({"error": str(exc), "code": "MODEL_UNAVAILABLE"}), 503
    except ValueError as exc:
        return jsonify({"error": str(exc), "code": "UNREADABLE_MEDIA"}), 422
    except Exception as exc:
        return jsonify({"error": f"Internal analysis error: {str(exc)}", "code": "INTERNAL_ERROR"}), 500
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)


@app.errorhandler(RequestEntityTooLarge)
def file_too_large(_: RequestEntityTooLarge) -> tuple:
    return jsonify({"error": "File is larger than the 20 MB upload limit."}), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("AI_PORT", "5001")), debug=True)
