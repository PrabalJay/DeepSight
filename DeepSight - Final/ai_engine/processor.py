from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import h5py
import numpy as np
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")
DEFAULT_IMAGE_MODEL = PROJECT_ROOT / "models" / "ai_detector.h5"
DEFAULT_VIDEO_MODEL = PROJECT_ROOT / "models" / "model.h5"
MAX_VIDEO_FRAMES = int(os.getenv("MAX_VIDEO_FRAMES", "8"))


class ModelUnavailableError(RuntimeError):
    """Raised when inference cannot safely be performed."""


@dataclass
class LoadedModel:
    model: Any
    path: Path
    backend: str


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class ModelRegistry:
    """Loads each Keras model once, on its first request."""

    def __init__(self) -> None:
        self._models: dict[str, LoadedModel] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _path_for(media_kind: str) -> Path:
        variable = "IMAGE_MODEL_PATH" if media_kind == "image" else "VIDEO_MODEL_PATH"
        fallback = DEFAULT_IMAGE_MODEL if media_kind == "image" else DEFAULT_VIDEO_MODEL
        return Path(os.getenv(variable, str(fallback))).expanduser()

    def status(self, media_kind: str) -> dict[str, Any]:
        path = self._path_for(media_kind)
        return {
            "configured_path": str(path),
            "file_found": path.is_file(),
            "loaded": media_kind in self._models,
        }

    def get(self, media_kind: str) -> LoadedModel:
        if media_kind in self._models:
            return self._models[media_kind]

        with self._lock:
            if media_kind in self._models:
                return self._models[media_kind]

            model_path = self._path_for(media_kind)
            if not model_path.is_file():
                variable = "IMAGE_MODEL_PATH" if media_kind == "image" else "VIDEO_MODEL_PATH"
                raise ModelUnavailableError(
                    f"The {media_kind} model was not found at '{model_path}'. "
                    f"Copy the .h5 file there or set {variable}."
                )
            try:
                if media_kind == "video":
                    model = _load_videomae_model(model_path)
                    backend = "pytorch-videomae"
                else:
                    try:
                        import tensorflow as tf
                    except ImportError as exc:
                        raise ModelUnavailableError(
                            "TensorFlow is required to load the image model. Run `pip install tensorflow`."
                        ) from exc
                    model = tf.keras.models.load_model(model_path, compile=False)
                    backend = "tensorflow"
            except ModelUnavailableError:
                raise
            except Exception as exc:
                raise ModelUnavailableError(
                    f"DeepSight could not load '{model_path.name}': {exc}"
                ) from exc

            loaded = LoadedModel(model=model, path=model_path, backend=backend)
            self._models[media_kind] = loaded
            return loaded


MODEL_REGISTRY = ModelRegistry()


def _load_videomae_model(model_path: Path) -> tuple[Any, Any]:
    """Build VideoMAE from the metadata stored beside its PyTorch weights."""
    try:
        import torch
        from transformers import VideoMAEConfig, VideoMAEForVideoClassification
        try:
            from transformers import VideoMAEImageProcessorPil as VideoMAEImageProcessor
        except ImportError:
            from transformers import VideoMAEImageProcessor
    except ImportError as exc:
        raise ModelUnavailableError(
            "VideoMAE requires PyTorch and Transformers. Run `pip install torch transformers`."
        ) from exc

    with h5py.File(model_path, "r") as h5_file:
        architecture = h5_file.attrs.get("architecture", "")
        model_id = h5_file.attrs.get("model_id", "MCG-NJU/videomae-base")
        if isinstance(architecture, bytes):
            architecture = architecture.decode()
        if isinstance(model_id, bytes):
            model_id = model_id.decode()
        if architecture != "VideoMAEForVideoClassification":
            raise ModelUnavailableError(
                f"'{model_path.name}' contains {architecture or 'unknown'} weights, not VideoMAE weights."
            )
        weights = {
            name: torch.from_numpy(np.asarray(dataset))
            for name, dataset in h5_file["weights"].items()
        }

    config = VideoMAEConfig(num_labels=2)
    model = VideoMAEForVideoClassification(config)
    for layer_index in range(config.num_hidden_layers):
        prefix = f"videomae.encoder.layer.{layer_index}.attention.attention"
        weights[f"{prefix}.query.bias"] = weights.pop(f"{prefix}.q_bias")
        weights[f"{prefix}.value.bias"] = weights.pop(f"{prefix}.v_bias")
        weights[f"{prefix}.key.bias"] = torch.zeros_like(weights[f"{prefix}.query.bias"])
    weights["fc_norm.weight"] = weights.pop("videomae.layernorm.weight")
    weights["fc_norm.bias"] = weights.pop("videomae.layernorm.bias")
    missing, unexpected = model.load_state_dict(weights, strict=False)
    if missing or unexpected:
        raise ModelUnavailableError(
            f"VideoMAE weights do not match {model_id} "
            f"(missing={len(missing)}, unexpected={len(unexpected)})."
        )
    model.eval()
    processor = VideoMAEImageProcessor()
    return model, processor


def _input_dimensions(model: Any) -> tuple[int, int, int]:
    """Get image dimensions from a standard channels-last Keras input."""
    input_shape = model.input_shape
    if isinstance(input_shape, list):
        raise ModelUnavailableError("The selected model has multiple inputs; DeepSight expects one image input.")
    if len(input_shape) != 4:
        raise ModelUnavailableError(
            f"The selected model input shape {input_shape} is not an image tensor."
        )

    height = int(input_shape[1] or 224)
    width = int(input_shape[2] or 224)
    channels = int(input_shape[3] or 3)
    if channels not in {1, 3, 4}:
        raise ModelUnavailableError(
            f"The selected model expects {channels} channels; DeepSight supports 1, 3, or 4."
        )
    return height, width, channels


def _prepare_frame(frame_bgr: np.ndarray, model: Any) -> np.ndarray:
    height, width, channels = _input_dimensions(model)
    resized = cv2.resize(frame_bgr, (width, height), interpolation=cv2.INTER_AREA)

    if channels == 1:
        converted = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)[..., np.newaxis]
    elif channels == 3:
        converted = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    else:
        converted = cv2.cvtColor(resized, cv2.COLOR_BGR2RGBA)

    if any("efficientnet" in layer.name.lower() for layer in model.layers):
        normalized = converted.astype(np.float32)
    else:
        normalized = converted.astype(np.float32) / 255.0
    return np.expand_dims(normalized, axis=0)


def _fake_probability(model: Any, frame_bgr: np.ndarray) -> float:
    prediction = np.asarray(model.predict(_prepare_frame(frame_bgr, model), verbose=0), dtype=np.float32)
    values = prediction.reshape(-1)
    if values.size == 0:
        raise ModelUnavailableError("The selected model returned an empty prediction.")

    if values.size == 1:
        probability = float(values[0])
        if probability < 0.0 or probability > 1.0:
            probability = 1.0 / (1.0 + np.exp(-probability))
        if not _as_bool(os.getenv("SINGLE_OUTPUT_MEANS_FAKE"), True):
            probability = 1.0 - probability
        return float(np.clip(probability, 0.0, 1.0))

    probabilities = values
    if np.any(probabilities < 0.0) or not np.isclose(float(probabilities.sum()), 1.0, atol=0.02):
        shifted = probabilities - np.max(probabilities)
        probabilities = np.exp(shifted) / np.exp(shifted).sum()
    index = int(os.getenv("FAKE_CLASS_INDEX", "1"))
    if not 0 <= index < probabilities.size:
        raise ModelUnavailableError(
            f"FAKE_CLASS_INDEX={index} is invalid for this {probabilities.size}-class model."
        )
    return float(np.clip(probabilities[index], 0.0, 1.0))


def _verdict(fake_score: float) -> tuple[str, bool | None, str]:
    percentage = round(float(fake_score) * 100, 6)
    if percentage < 45:
        return "AUTHENTIC", False, "The model found limited evidence of visual manipulation."
    if percentage <= 55:
        return "INCONCLUSIVE", None, "The model is too close to its decision boundary for a reliable verdict."
    return "MANIPULATED", True, "The model found visual patterns associated with manipulated media."


def analyze_image(file_path: str | Path) -> dict[str, Any]:
    frame = cv2.imread(str(file_path), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("OpenCV could not read this image. Use JPG, PNG, or WEBP.")
    model_info = MODEL_REGISTRY.get("image")
    score = _fake_probability(model_info.model, frame)
    verdict, is_deepfake, message = _verdict(score)
    return {
        "media_type": "image",
        "verdict": verdict,
        "is_deepfake": is_deepfake,
        "confidence_score": round(score * 100, 2),
        "frames_analyzed": 1,
        "message": message,
        "model_file": model_info.path.name,
    }


def analyze_video(file_path: str | Path) -> dict[str, Any]:
    capture = cv2.VideoCapture(str(file_path))
    if not capture.isOpened():
        raise ValueError("OpenCV could not open this video. Use MP4, MOV, AVI, WEBM, or MKV.")

    model_info = MODEL_REGISTRY.get("video")
    if model_info.backend != "pytorch-videomae":
        capture.release()
        raise ModelUnavailableError("The configured video model is not a supported VideoMAE model.")

    torch = __import__("torch")
    clip_size = 16
    max_clips = max(1, MAX_VIDEO_FRAMES)
    fake_index = int(os.getenv("FAKE_CLASS_INDEX", "1"))

    scores: list[float] = []
    current_clip: list[np.ndarray] = []
    total_frames_read = 0

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            total_frames_read += 1
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame_resized = cv2.resize(frame_rgb, (224, 224), interpolation=cv2.INTER_AREA)
            current_clip.append(frame_resized)

            if len(current_clip) == clip_size:
                inputs = model_info.model[1](current_clip, return_tensors="pt")
                with torch.no_grad():
                    logits = model_info.model[0](**inputs).logits
                probabilities = torch.softmax(logits, dim=-1)[0].cpu().numpy()
                if not 0 <= fake_index < len(probabilities):
                    raise ModelUnavailableError(
                        f"FAKE_CLASS_INDEX={fake_index} is invalid for the VideoMAE classifier."
                    )
                scores.append(float(probabilities[fake_index]))
                current_clip = []
                if len(scores) >= max_clips:
                    break
    finally:
        capture.release()

    if total_frames_read == 0:
        raise ValueError("No readable video frames were found.")

    if len(scores) == 0 and len(current_clip) > 0:
        last_frame = current_clip[-1]
        while len(current_clip) < clip_size:
            current_clip.append(last_frame)
        inputs = model_info.model[1](current_clip, return_tensors="pt")
        with torch.no_grad():
            logits = model_info.model[0](**inputs).logits
        probabilities = torch.softmax(logits, dim=-1)[0].cpu().numpy()
        if not 0 <= fake_index < len(probabilities):
            raise ModelUnavailableError(
                f"FAKE_CLASS_INDEX={fake_index} is invalid for the VideoMAE classifier."
            )
        scores.append(float(probabilities[fake_index]))

    if not scores:
        raise ValueError("Could not extract any valid frames for video analysis.")

    mean_score = float(np.mean(scores))
    verdict, is_deepfake, message = _verdict(mean_score)
    if len(scores) == max_clips:
        message += f" Analysis sampled the first {max_clips} temporal clips."

    return {
        "media_type": "video",
        "verdict": verdict,
        "is_deepfake": is_deepfake,
        "confidence_score": round(mean_score * 100, 2),
        "frames_analyzed": len(scores),
        "frame_score_range": [round(min(scores) * 100, 2), round(max(scores) * 100, 2)],
        "message": message,
        "model_file": model_info.path.name,
    }


def analyze_media(file_path: str | Path, media_type: str) -> dict[str, Any]:
    if media_type == "image":
        return analyze_image(file_path)
    if media_type == "video":
        return analyze_video(file_path)
    raise ValueError("Only image and video analysis are supported.")
