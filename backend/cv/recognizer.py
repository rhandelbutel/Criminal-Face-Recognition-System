import json
import os
import re
import shutil
import stat
from typing import Dict, List, Optional, Tuple, Any

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
THRESHOLDS_PATH = os.path.join(DATA_DIR, "thresholds.json")
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
        self.label_metadata: Dict[str, Dict[str, Any]] = self._load_metadata()
        self.label_thresholds: Dict[str, float] = self._load_thresholds()

        if os.path.exists(MODEL_PATH):
            try:
                self.recognizer.read(MODEL_PATH)
            except Exception:
                # If model is corrupted, ignore
                pass

    def _create_lbph(self):
        if not hasattr(cv2, "face"):
            raise RuntimeError("OpenCV contrib modules not available. Install opencv-contrib-python.")
        # Slightly larger radius/neighbors for more discriminative histograms
        return cv2.face.LBPHFaceRecognizer_create(radius=2, neighbors=12, grid_x=8, grid_y=8)

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

    def _load_metadata(self) -> Dict[str, Dict[str, Any]]:
        try:
            with open(METADATA_PATH, "r", encoding="utf-8") as f:
                raw = json.load(f) or {}
                # Backward compatibility: if file was a map of label->title string, wrap into metadata
                if all(isinstance(v, str) for v in raw.values()):
                    return {k: {"title": v} for k, v in raw.items()}
                # Ensure dictionary-of-dicts
                return {str(k): (v if isinstance(v, dict) else {}) for k, v in raw.items()}
        except Exception:
            return {}

    def _save_metadata(self) -> None:
        with open(METADATA_PATH, "w", encoding="utf-8") as f:
            json.dump(self.label_metadata, f, indent=2)

    def _load_thresholds(self) -> Dict[str, float]:
        try:
            with open(THRESHOLDS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f) or {}
                return {str(k): float(v) for k, v in data.items()}
        except Exception:
            return {}

    def _save_thresholds(self) -> None:
        with open(THRESHOLDS_PATH, "w", encoding="utf-8") as f:
            json.dump(self.label_thresholds, f, indent=2)

    def set_label_title(self, label: str, title: Optional[str]) -> None:
        # Backward-compat helper: set just a title field
        if title is None:
            return
        if label:
            md = self.label_metadata.get(label, {})
            md["title"] = title
            self.label_metadata[label] = md
            self._save_metadata()

    def set_label_metadata(self, label: str, metadata: Dict[str, Any]) -> None:
        if not label:
            return
        base = self.label_metadata.get(label, {})
        base.update({k: v for k, v in metadata.items() if v is not None and str(v) != ""})
        self.label_metadata[label] = base
        self._save_metadata()

    def get_label_metadata(self, label: Optional[str]) -> Optional[Dict[str, Any]]:
        if not label:
            return None
        return self.label_metadata.get(label)

    def _next_label_id(self) -> int:
        return 0 if not self.labels_to_ids else max(self.labels_to_ids.values()) + 1

    def _prepare_face(self, image_bgr: np.ndarray) -> Tuple[Optional[np.ndarray], Optional[Tuple[int, int, int, int]]]:
        gray = to_grayscale(image_bgr)
        # Improve detectability with histogram equalization
        try:
            gray = cv2.equalizeHist(gray)
        except Exception:
            pass
        faces = detect_faces(gray)
        if not faces:
            return None, None
        # Take the largest face
        faces_sorted = sorted(faces, key=lambda b: b[2] * b[3], reverse=True)
        x, y, w, h = faces_sorted[0]
        # Expand bbox by 10% for more context, clamp to image bounds
        ih, iw = gray.shape[:2]
        pad_x = int(0.1 * w)
        pad_y = int(0.1 * h)
        x0 = max(0, x - pad_x)
        y0 = max(0, y - pad_y)
        x1 = min(iw, x + w + pad_x)
        y1 = min(ih, y + h + pad_y)
        bbox = (x0, y0, x1 - x0, y1 - y0)
        face_gray = crop_to_bbox(gray, bbox)
        face_resized = resize_image(face_gray, (200, 200))
        # Local contrast enhancement (CLAHE) + mild denoise + sharpen for LBPH stability
        try:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            face_resized = clahe.apply(face_resized)
            face_resized = cv2.GaussianBlur(face_resized, (3, 3), 0)
            lap = cv2.Laplacian(face_resized, cv2.CV_16S, ksize=3)
            face_resized = cv2.convertScaleAbs(face_resized - 0.15 * lap)
        except Exception:
            pass
        return face_resized, bbox

    def _prepare_face_variants(self, image_bgr: np.ndarray) -> List[Tuple[np.ndarray, Tuple[int, int, int, int]]]:
        """Generate several cropped variants around the detected face to reduce sensitivity
        to small detection errors. Returns list of (face_image, bbox).
        """
        variants: List[Tuple[np.ndarray, Tuple[int, int, int, int]]] = []
        gray = to_grayscale(image_bgr)
        try:
            gray = cv2.equalizeHist(gray)
        except Exception:
            pass
        faces = detect_faces(gray)
        if not faces:
            return variants
        faces_sorted = sorted(faces, key=lambda b: b[2] * b[3], reverse=True)
        x, y, w, h = faces_sorted[0]
        ih, iw = gray.shape[:2]
        # Different paddings
        pads = [0.08, 0.12, 0.16]
        for p in pads:
            pad_x = int(p * w)
            pad_y = int(p * h)
            x0 = max(0, x - pad_x)
            y0 = max(0, y - pad_y)
            x1 = min(iw, x + w + pad_x)
            y1 = min(ih, y + h + pad_y)
            bbox = (x0, y0, x1 - x0, y1 - y0)
            face_gray = crop_to_bbox(gray, bbox)
            face_resized = resize_image(face_gray, (200, 200))
            try:
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                face_resized = clahe.apply(face_resized)
                face_resized = cv2.GaussianBlur(face_resized, (3, 3), 0)
                lap = cv2.Laplacian(face_resized, cv2.CV_16S, ksize=3)
                face_resized = cv2.convertScaleAbs(face_resized - 0.15 * lap)
            except Exception:
                pass
            variants.append((face_resized, bbox))
        return variants

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

        # Compute adaptive label thresholds based on training distances
        try:
            distances_by_label: Dict[int, List[float]] = {}
            for img, lid in zip(images, labels):
                _, dist = self.recognizer.predict(img)
                distances_by_label.setdefault(int(lid), []).append(float(dist))
            thresholds: Dict[str, float] = {}
            for lid, dists in distances_by_label.items():
                if not dists:
                    continue
                arr = np.array(dists, dtype=np.float32)
                mean = float(np.mean(arr))
                std = float(np.std(arr))
                # Mean + 2*std, clipped to a sane range
                th = max(55.0, min(130.0, mean + 2.0 * std))
                label = self.ids_to_labels.get(int(lid))
                if label:
                    thresholds[label] = float(th)
            if thresholds:
                self.label_thresholds = thresholds
                self._save_thresholds()
        except Exception:
            # If computing thresholds fails, keep previous values
            pass
        labels_count = len(set(labels))
        images_count = len(images)
        return labels_count, images_count

    async def add_training_images_for_label(self, label: str, files) -> Tuple[int, int]:
        """
        Save new images for a label without overwriting existing ones.
        Continues the numeric sequence like image_0006.jpg → image_0007.jpg …
        """
        label_dir = os.path.join(DATASET_DIR, label)
        ensure_dir(label_dir)
        processed = 0
        skipped = 0

        # Ensure label has an ID
        if label not in self.labels_to_ids:
            self.labels_to_ids[label] = self._next_label_id()
            self._save_labels(self.labels_to_ids)

        # Find current max index (pattern: image_0000.jpg)
        pattern = re.compile(r"^image_(\d{4})\.jpg$", re.IGNORECASE)
        max_idx = -1
        for fname in os.listdir(label_dir):
            m = pattern.match(fname)
            if m:
                try:
                    max_idx = max(max_idx, int(m.group(1)))
                except ValueError:
                    pass
        idx = max_idx + 1

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

        # Try multiple variants and choose the best score (smallest distance)
        variants = self._prepare_face_variants(image_bgr)
        if not variants:
            return {"label": "Unknown", "title": None, "confidence": None, "bbox": None}

        # Filter variants by reasonable face size/aspect ratio to curb false positives
        filtered: List[Tuple[np.ndarray, Tuple[int, int, int, int]]] = []
        for img, vbox in variants:
            x, y, w, h = vbox
            if w < 90 or h < 90:
                continue
            aspect = w / float(h)
            if aspect < 0.7 or aspect > 1.4:
                continue
            filtered.append((img, vbox))
        if not filtered:
            return {"label": "Unknown", "title": None, "confidence": None, "bbox": None}

        # Majority vote among labels that are under threshold, with distance margins
        threshold = float(self.settings.get("confidence_threshold", 60))
        votes: Dict[int, List[Tuple[float, Tuple[int, int, int, int]]]] = {}
        best_tuple: Optional[Tuple[int, float, Tuple[int, int, int, int]]] = None
        for face_img, vbox in filtered:
            lid, conf = self.recognizer.predict(face_img)
            conf = float(conf)
            if best_tuple is None or conf < best_tuple[1]:
                best_tuple = (lid, conf, vbox)
            if conf <= threshold:
                votes.setdefault(lid, []).append((conf, vbox))

        assert best_tuple is not None
        best_label_id, best_conf, best_bbox = best_tuple

        # Pick label with most votes (ties break by best average distance)
        chosen_label_id: Optional[int] = None
        chosen_avg_conf: float = 1e9
        chosen_bbox: Optional[Tuple[int, int, int, int]] = None
        if votes:
            # number of votes must be at least 2 to be considered reliable
            for lid, entries in votes.items():
                if len(entries) < 2:
                    continue
                avg_conf = sum(c for c, _ in entries) / len(entries)
                if chosen_label_id is None or len(entries) > len(votes.get(chosen_label_id, [])) or (
                    len(entries) == len(votes.get(chosen_label_id, [])) and avg_conf < chosen_avg_conf
                ):
                    chosen_label_id = lid
                    chosen_avg_conf = avg_conf
                    # take bbox from the best (lowest conf) among this label's entries
                    chosen_bbox = min(entries, key=lambda t: t[0])[1]

        label_id: Optional[int] = None
        confidence: Optional[float] = None
        bbox: Optional[Tuple[int, int, int, int]] = None

        # Accept if we have a reliable majority and it's within threshold (expression tolerant)
        if chosen_label_id is not None and chosen_avg_conf <= threshold:
            label_id = chosen_label_id
            confidence = chosen_avg_conf
            bbox = chosen_bbox
        else:
            # Fall back to the absolute best if it's reasonably under threshold-5
            if best_conf <= (threshold - 5):
                label_id = best_label_id
                confidence = best_conf
                bbox = best_bbox
            else:
                return {"label": "Unknown", "title": None, "confidence": float(best_conf), "bbox": list(map(int, best_bbox)) if best_bbox else None}
        # Convert LBPH distance into a 0..1 score (higher is better)
        score = max(0.0, min(1.0, (threshold - float(confidence)) / max(threshold, 1e-6)))
        if confidence is not None and label_id is not None and label_id in self.ids_to_labels:
            label = self.ids_to_labels[label_id]
            # Allow a per-label adaptive threshold (capped to +10 over global)
            label_th = float(self.label_thresholds.get(label, threshold))
            effective_th = min(threshold + 10.0, max(threshold, label_th))
            if confidence > effective_th:
                return {
                    "label": "Unknown",
                    "metadata": None,
                    "confidence": float(confidence),
                    "score": float(max(0.0, min(1.0, (threshold - float(confidence)) / max(threshold, 1e-6)))),
                    "bbox": list(map(int, bbox)) if bbox else None,
                }
            return {
                "label": label,
                "metadata": self.get_label_metadata(label),
                "confidence": float(confidence),
                "score": float(score),
                "bbox": list(map(int, bbox)) if bbox else None,
            }
        return {
            "label": "Unknown",
            "metadata": None,
            "confidence": float(confidence),
            "score": float(score),
            "bbox": list(map(int, bbox)) if bbox else None,
        }

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
            def _on_rm_error(func, path, exc_info):
                # Try to make file writable then remove again (Windows OneDrive/AV locks)
                try:
                    os.chmod(path, stat.S_IWRITE)
                except Exception:
                    pass
                try:
                    func(path)
                except Exception:
                    pass
            try:
                shutil.rmtree(label_dir, onerror=_on_rm_error)
                removed = not os.path.exists(label_dir)
            except Exception:
                removed = False

        # Remove from labels map
        if label in self.labels_to_ids:
            del self.labels_to_ids[label]
            self._save_labels(self.labels_to_ids)
            self.ids_to_labels = {v: k for k, v in self.labels_to_ids.items()}
            # Also remove metadata
            if label in self.label_metadata:
                del self.label_metadata[label]
                self._save_metadata()

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
