"use client";
import React, { useRef, useState } from "react";
import { apiPost } from "../../lib/api";

export default function RecognizePage() {
  const [result, setResult] = useState<any>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      try {
        const res = await apiPost("/api/infer", { image: dataUrl });
        setResult(res);
        // Draw bbox if any on canvas
        if (canvasRef.current) {
          const img = new Image();
          img.onload = () => {
            const canvas = canvasRef.current!;
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.drawImage(img, 0, 0);
            if (res?.bbox && res.bbox.length === 4) {
              ctx.strokeStyle = res.label === "Unknown" ? "#f59e0b" : "#10b981";
              ctx.lineWidth = 3;
              const [x, y, w, h] = res.bbox;
              ctx.strokeRect(x, y, w, h);
            }
          };
          img.src = dataUrl;
        }
      } catch (err) {
        console.error(err);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <div className="font-medium mb-2">Upload Image</div>
        <input type="file" accept="image/*" onChange={onFile} />
        <div className="mt-3">
          {preview ? (
            <canvas ref={canvasRef} className="max-w-full" />
          ) : (
            <div className="text-gray-500">No image selected</div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="font-medium mb-2">Result</div>
        {result ? (
          <div>
            <div className="text-xl font-semibold">{result.label}</div>
            {result.title ? (
              <div className="text-sm text-gray-700">{result.title}</div>
            ) : null}
            <div className="text-sm text-gray-600">Confidence: {result.confidence !== null ? result.confidence.toFixed(1) : "-"}</div>
          </div>
        ) : (
          <div className="text-gray-500">No result yet</div>
        )}
      </div>
    </div>
  );
}


