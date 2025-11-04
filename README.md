# Criminal Face Recognition (Haar + LBPH)

Minimal fullstack app for training and recognizing faces locally.

- Backend: FastAPI + OpenCV (Haar cascade + LBPH)
- Frontend: Next.js (App Router) + TypeScript + Tailwind
- Storage: local filesystem under `backend/data`

## Project Structure

```
/backend
  main.py
  requirements.txt
  settings.json
  /cv
    detector.py
    recognizer.py
    io_utils.py
  /data
    /dataset
    /model
    labels.json
/frontend
  package.json
  tailwind.config.ts
  tsconfig.json
  next.config.mjs
  /app
    page.tsx
    /train/page.tsx
    /recognize/page.tsx
  /components
    WebcamBox.tsx
    ResultCard.tsx
  /lib/api.ts
  /styles/globals.css
```

## Prerequisites

- Python 3.10+ (recommend 3.11)
- Node.js 18+ (recommend LTS)

On Windows PowerShell, use the commands below as written.

## Running Backend

```
cd backend
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

- API base: `http://localhost:8000`
- Health: GET `/api/health` → `{status:"ok"}`

Notes:
- We use `opencv-contrib-python` for LBPH.
- Haar cascade is resolved from the bundled file `backend/haarcascade_frontalface_default.xml` if present; otherwise falls back to `cv2.data.haarcascades`.
- Confidence threshold is configurable in `backend/settings.json` (default 60; lower is stricter).

## Running Frontend

```
cd frontend
npm i
npm run dev
```

- App: `http://localhost:3000`
- The frontend targets `NEXT_PUBLIC_API_BASE` (defaults to `http://localhost:8000`).

## Core Flows

- Dashboard `/`: Start webcam, sends a frame every ~500ms to `/api/infer`. Shows label + confidence and draws a bbox when returned.
- Train `/train`:
  - Enter label and upload 1–20 images.
  - Server extracts faces, normalizes to 200×200 gray, stores under `backend/data/dataset/<label>/` and retrains LBPH → `backend/data/model/lbph_model.xml`.
  - You can retrain from the entire dataset or delete a label.
- Recognize `/recognize`: Upload a single image to test inference.

## Backend API

- GET `/api/health` → `{status:"ok"}`
- GET `/api/labels` → `{ "LabelA": 12, ... }`
- POST `/api/infer` body: `{ "image": "data:image/jpeg;base64,..." }`
  - Returns `{ label: string, confidence: number|null, bbox: [x,y,w,h]|null }`
- POST `/api/train/upload` multipart: fields `label`, `files[]`
  - Returns `{ added, skipped, labels_count, images_count }`
- POST `/api/train/rebuild` → `{ labels_count, images_count }`
- DELETE `/api/train/delete?label=<label>` → `{ removed, labels_count, images_count }`

## Dataset Layout

- `backend/data/dataset/<label>/image_*.jpg` (normalized 200×200 gray faces)
- `backend/data/model/lbph_model.xml`
- `backend/data/labels.json` (maps label → numeric id)

## Tips

- If you see "Model not trained yet", upload images on `/train` or rebuild.
- For better results, provide several frontal, well-lit images per person.
- The returned LBPH confidence is a distance (lower means closer/better). We treat `<= threshold` as recognized.

## Optional: docker-compose (dev)

This compose runs both services using official images. Good for quick try-outs.

```
docker compose up
```

See `docker-compose.yml` for details.


