import base64
import io
import os
from typing import Optional, Tuple

import cv2
import numpy as np


def ensure_dir(path: str) -> None:
    if not os.path.exists(path):
        os.makedirs(path, exist_ok=True)


def decode_data_url_to_image(data_url: str) -> Optional[np.ndarray]:
    if not isinstance(data_url, str) or "," not in data_url:
        return None
    try:
        header, b64data = data_url.split(",", 1)
        img_bytes = base64.b64decode(b64data)
        img_array = np.frombuffer(img_bytes, dtype=np.uint8)
        image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        return image
    except Exception:
        return None


def save_image_bgr(path: str, image_bgr: np.ndarray) -> bool:
    ensure_dir(os.path.dirname(path))
    return cv2.imwrite(path, image_bgr)


def to_grayscale(image_bgr: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)


def crop_to_bbox(image: np.ndarray, bbox: Tuple[int, int, int, int]) -> np.ndarray:
    x, y, w, h = bbox
    return image[y:y + h, x:x + w]


def resize_image(image: np.ndarray, size: Tuple[int, int]) -> np.ndarray:
    return cv2.resize(image, size)


