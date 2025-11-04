from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List, Optional
import uvicorn

from .cv.io_utils import decode_data_url_to_image
from .cv.recognizer import FaceRecognizerService


app = FastAPI(title="Criminal Face Recognition API", version="0.1.0")

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


recognizer_service = FaceRecognizerService()


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/labels")
async def get_labels():
    labels_counts = recognizer_service.get_labels_with_counts()
    return labels_counts


@app.post("/api/infer")
async def infer(body: dict):
    if "image" not in body:
        raise HTTPException(status_code=400, detail="Missing 'image' data URL")
    image_data_url = body["image"]
    image_bgr = decode_data_url_to_image(image_data_url)
    if image_bgr is None:
        raise HTTPException(status_code=400, detail="Invalid image payload")

    try:
        result = recognizer_service.predict_from_bgr_image(image_bgr)
    except RuntimeError as e:
        # Model not trained yet
        return JSONResponse({"label": "Unknown", "confidence": None, "bbox": None, "error": str(e)}, status_code=200)

    return result


@app.post("/api/train/upload")
async def train_upload(label: str = Form(...), files: List[UploadFile] = File(...), title: Optional[str] = Form(None)):
    if not label or not label.strip():
        raise HTTPException(status_code=400, detail="Label is required")

    processed, skipped = await recognizer_service.add_training_images_for_label(label.strip(), files)
    if title is not None:
        recognizer_service.set_label_title(label.strip(), title.strip())
    # Retrain after adding
    labels_count, images_count = recognizer_service.rebuild_from_dataset()
    return {"added": processed, "skipped": skipped, "labels_count": labels_count, "images_count": images_count}


@app.post("/api/train/rebuild")
async def train_rebuild():
    labels_count, images_count = recognizer_service.rebuild_from_dataset()
    return {"labels_count": labels_count, "images_count": images_count}


@app.delete("/api/train/delete")
async def train_delete(label: str):
    if not label:
        raise HTTPException(status_code=400, detail="Label query parameter is required")
    summary = recognizer_service.delete_label_and_retrain(label)
    return summary


if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)


