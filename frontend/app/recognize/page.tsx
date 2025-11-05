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
        <div className="font-medium mb-2 text-lg">Upload Image</div>
        <input className="block" type="file" accept="image/*" onChange={onFile} />
        <div className="mt-3">
          {preview ? (
            <canvas ref={canvasRef} className="max-w-full" />
          ) : (
            <div className="text-gray-500">No image selected</div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="font-medium mb-2 text-lg">Result</div>
        {result ? (
          <div>
            <div className={`text-xl font-semibold ${result.label === "Unknown" ? "text-amber-700" : "text-emerald-700"}`}>{result.label}</div>
            <div className="mt-1">
              {result.label === "Unknown" ? (
                <span className="badge badge-warning">No criminal case found</span>
              ) : (
                <span className="badge badge-success">Criminal record found</span>
              )}
            </div>
            {result?.metadata?.title || result?.title ? (
              <div className="text-sm text-gray-700 mt-2">{result?.metadata?.title ?? result?.title}</div>
            ) : null}
            {result?.metadata?.case ? <div className="text-sm text-gray-700">Case: {result.metadata.case}</div> : null}
            {(result?.metadata?.sex || result?.metadata?.age) ? (
              <div className="text-sm text-gray-700">{result.metadata.sex ? `Sex: ${result.metadata.sex}` : null}{(result.metadata.sex && result.metadata.age) ? " • " : null}{result.metadata.age ? `Age: ${result.metadata.age}` : null}</div>
            ) : null}
            {result?.metadata?.address ? <div className="text-sm text-gray-700">Address: {result.metadata.address}</div> : null}
            {result?.metadata?.notes ? <div className="text-sm text-gray-700">Notes: {result.metadata.notes}</div> : null}
            <div className="text-sm text-gray-600 mt-2">
              Distance: {result.confidence !== null ? result.confidence.toFixed(1) : "-"}
              {typeof result.score === "number" ? <span className="ml-2">Match score: {Math.round(Math.max(0, Math.min(1, result.score)) * 100)}%</span> : null}
            </div>
          </div>
        ) : (
          <div className="text-gray-500">No result yet</div>
        )}
      </div>
    </div>
  );
}


