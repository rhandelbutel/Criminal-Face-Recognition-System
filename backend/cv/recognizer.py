import json
import os
import shutil
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from .detector import detect_faces
from .io_utils import ensure_dir, to_grayscale, crop_to_bbox, resize_image


DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DATASET_DIR = os.path.join(DATA_DIR, "dataset")
MODEL_DIR = os.path.join(DATA_DIR, "model")
MODEL_PATH = os.path.join(MODEL_DIR, "lbph_model.xml")
LABELS_PATH = os.path.join(DATA_DIR, "labels.json")
METADATA_PATH = os.path.join(DATA_DIR, "metadata.json")
SETTINGS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "settings.json")


def _load_settings() -> Dict:
    # Default settings
    settings = {"confidence_threshold": 60}
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                settings.update(loaded or {})
        except Exception:
            pass
    return settings


class FaceRecognizerService:
    def __init__(self) -> None:
        ensure_dir(DATASET_DIR)
        ensure_dir(MODEL_DIR)
        if not os.path.exists(LABELS_PATH):
            with open(LABELS_PATH, "w", encoding="utf-8") as f:
                json.dump({}, f)
        if not os.path.exists(METADATA_PATH):
            with open(METADATA_PATH, "w", encoding="utf-8") as f:
                json.dump({}, f)

        self.settings = _load_settings()
        self.recognizer = self._create_lbph()
        self.labels_to_ids: Dict[str, int] = self._load_labels()
        self.ids_to_labels: Dict[int, str] = {v: k for k, v in self.labels_to_ids.items()}
        self.label_titles: Dict[str, str] = self._load_titles()

        if os.path.exists(MODEL_PATH):
            try:
                self.recognizer.read(MODEL_PATH)
            except Exception:
                # If model is corrupted, ignore
                pass

    def _create_lbph(self):
        if not hasattr(cv2, "face"):
            raise RuntimeError("OpenCV contrib modules not available. Install opencv-contrib-python.")
        return cv2.face.LBPHFaceRecognizer_create(radius=1, neighbors=8, grid_x=8, grid_y=8)

    def _load_labels(self) -> Dict[str, int]:
        try:
            with open(LABELS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f) or {}
                # Coerce to int values
                return {str(k): int(v) for k, v in data.items()}
        except Exception:
            return {}

    def _save_labels(self, mapping: Dict[str, int]) -> None:
        with open(LABELS_PATH, "w", encoding="utf-8") as f:
            json.dump(mapping, f, indent=2)

    def _load_titles(self) -> Dict[str, str]:
        try:
            with open(METADATA_PATH, "r", encoding="utf-8") as f:
                data = json.load(f) or {}
                return {str(k): str(v) for k, v in data.items()}
        except Exception:
            return {}

    def _save_titles(self) -> None:
        with open(METADATA_PATH, "w", encoding="utf-8") as f:
            json.dump(self.label_titles, f, indent=2)

    def set_label_title(self, label: str, title: Optional[str]) -> None:
        if title is None:
            return
        if label:
            self.label_titles[label] = title
            self._save_titles()

    def get_label_title(self, label: Optional[str]) -> Optional[str]:
        if not label:
            return None
        return self.label_titles.get(label)

    def _next_label_id(self) -> int:
        return 0 if not self.labels_to_ids else max(self.labels_to_ids.values()) + 1

    def _prepare_face(self, image_bgr: np.ndarray) -> Tuple[Optional[np.ndarray], Optional[Tuple[int, int, int, int]]]:
        gray = to_grayscale(image_bgr)
        faces = detect_faces(gray)
        if not faces:
            return None, None
        # Take the largest face
        faces_sorted = sorted(faces, key=lambda b: b[2] * b[3], reverse=True)
        bbox = faces_sorted[0]
        face_gray = crop_to_bbox(gray, bbox)
        face_resized = resize_image(face_gray, (200, 200))
        return face_resized, bbox

    def _collect_dataset(self) -> Tuple[List[np.ndarray], List[int]]:
        images: List[np.ndarray] = []
        labels: List[int] = []
        for label in sorted(os.listdir(DATASET_DIR)):
            label_dir = os.path.join(DATASET_DIR, label)
            if not os.path.isdir(label_dir):
                continue
            if label not in self.labels_to_ids:
                self.labels_to_ids[label] = self._next_label_id()
            label_id = self.labels_to_ids[label]
            for fname in os.listdir(label_dir):
                fpath = os.path.join(label_dir, fname)
                if not os.path.isfile(fpath):
                    continue
                img = cv2.imread(fpath)
                if img is None:
                    continue
                face, _ = self._prepare_face(img)
                if face is None:
                    continue
                images.append(face)
                labels.append(label_id)
        return images, labels

    def rebuild_from_dataset(self) -> Tuple[int, int]:
        images, labels = self._collect_dataset()
        # Save labels map (might have been extended)
        self._save_labels(self.labels_to_ids)
        self.ids_to_labels = {v: k for k, v in self.labels_to_ids.items()}

        if not images:
            # No data to train
            if os.path.exists(MODEL_PATH):
                os.remove(MODEL_PATH)
            raise RuntimeError("No faces found in dataset to train the model.")

        self.recognizer = self._create_lbph()
        self.recognizer.train(images, np.array(labels))
        self.recognizer.write(MODEL_PATH)
        labels_count = len(set(labels))
        images_count = len(images)
        return labels_count, images_count

    async def add_training_images_for_label(self, label: str, files) -> Tuple[int, int]:
        label_dir = os.path.join(DATASET_DIR, label)
        ensure_dir(label_dir)
        processed = 0
        skipped = 0

        # Ensure label has an ID
        if label not in self.labels_to_ids:
            self.labels_to_ids[label] = self._next_label_id()
            self._save_labels(self.labels_to_ids)

        idx = 0
        for up in files:
            try:
                data = await up.read()
                arr = np.frombuffer(data, dtype=np.uint8)
                img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if img is None:
                    skipped += 1
                    continue
                face, _ = self._prepare_face(img)
                if face is None:
                    skipped += 1
                    continue
                # Save normalized face for consistency
                out_path = os.path.join(label_dir, f"image_{idx:04d}.jpg")
                cv2.imwrite(out_path, face)
                processed += 1
                idx += 1
            except Exception:
                skipped += 1
        return processed, skipped

    def predict_from_bgr_image(self, image_bgr: np.ndarray) -> Dict:
        if not os.path.exists(MODEL_PATH):
            raise RuntimeError("Model not trained yet. Please upload training images.")

        face, bbox = self._prepare_face(image_bgr)
        if face is None:
            return {"label": "Unknown", "title": None, "confidence": None, "bbox": None}

        label_id, confidence = self.recognizer.predict(face)
        threshold = float(self.settings.get("confidence_threshold", 60))
        if confidence <= threshold and label_id in self.ids_to_labels:
            label = self.ids_to_labels[label_id]
            return {"label": label, "title": self.get_label_title(label), "confidence": float(confidence), "bbox": list(map(int, bbox)) if bbox else None}
        return {"label": "Unknown", "title": None, "confidence": float(confidence), "bbox": list(map(int, bbox)) if bbox else None}

    def get_labels_with_counts(self) -> Dict[str, int]:
        summary: Dict[str, int] = {}
        for label in sorted(os.listdir(DATASET_DIR)):
            label_dir = os.path.join(DATASET_DIR, label)
            if not os.path.isdir(label_dir):
                continue
            count = len([f for f in os.listdir(label_dir) if os.path.isfile(os.path.join(label_dir, f))])
            summary[label] = count
        return summary

    def delete_label_and_retrain(self, label: str) -> Dict:
        label_dir = os.path.join(DATASET_DIR, label)
        removed = False
        if os.path.isdir(label_dir):
            shutil.rmtree(label_dir)
            removed = True

        # Remove from labels map
        if label in self.labels_to_ids:
            del self.labels_to_ids[label]
            self._save_labels(self.labels_to_ids)
            self.ids_to_labels = {v: k for k, v in self.labels_to_ids.items()}

        # Retrain if any data remains
        labels_count = 0
        images_count = 0
        if any(os.path.isdir(os.path.join(DATASET_DIR, d)) for d in os.listdir(DATASET_DIR)):
            try:
                labels_count, images_count = self.rebuild_from_dataset()
            except RuntimeError:
                # No images/faces remain
                if os.path.exists(MODEL_PATH):
                    os.remove(MODEL_PATH)

        return {"removed": removed, "labels_count": labels_count, "images_count": images_count}


