import os
from typing import List, Tuple

import cv2


def _resolve_cascade_path() -> str:
    # Prefer bundled file if present; otherwise fallback to OpenCV's data path
    local_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "haarcascade_frontalface_default.xml")
    if os.path.exists(local_path):
        return local_path
    opencv_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    return opencv_path


_CASCADE_PATH = _resolve_cascade_path()
_face_cascade = cv2.CascadeClassifier(_CASCADE_PATH)


def detect_faces(gray_image) -> List[Tuple[int, int, int, int]]:
    # Slightly stricter detector to reduce false positives
    faces = _face_cascade.detectMultiScale(gray_image, scaleFactor=1.1, minNeighbors=7, minSize=(100, 100))
    return [(int(x), int(y), int(w), int(h)) for (x, y, w, h) in faces]




