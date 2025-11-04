"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiPost } from "../lib/api";
import { PlayCircleIcon, StopCircleIcon } from "@heroicons/react/24/solid";

type InferResult = {
  label: string;
  confidence: number | null;
  bbox?: number[] | null;
};

export function WebcamBox({ onResult }: { onResult: (r: InferResult | null) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [running, setRunning] = useState(false);
  const inFlightRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const start = useCallback(async () => {
    if (running) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setRunning(true);
    } catch (e) {
      console.error(e);
      alert("Unable to access webcam");
    }
  }, [running]);

  const stop = useCallback(() => {
    setRunning(false);
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    const tick = async () => {
      if (inFlightRef.current) return;
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, width, height);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      inFlightRef.current = true;
      try {
        const result = await apiPost<InferResult>("/api/infer", { image: dataUrl });
        onResult(result);
        // Draw bbox overlay
        ctx.strokeStyle = result.label === "Unknown" ? "#f59e0b" : "#10b981";
        ctx.lineWidth = 3;
        if (result.bbox && result.bbox.length === 4) {
          const [x, y, w, h] = result.bbox;
          ctx.strokeRect(x, y, w, h);
        }
      } catch (e) {
        console.error(e);
      } finally {
        inFlightRef.current = false;
      }
    };
    timerRef.current = window.setInterval(tick, 500);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [running, onResult]);

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="font-medium">Webcam</div>
          <div className="text-xs text-gray-500">Sends a frame every ~500ms</div>
        </div>
        {!running ? (
          <button className="btn" onClick={start}><PlayCircleIcon className="w-5 h-5" /> Start</button>
        ) : (
          <button className="btn-outline" onClick={stop}><StopCircleIcon className="w-5 h-5" /> Stop</button>
        )}
      </div>
      <div className="relative overflow-hidden rounded-lg">
        <video ref={videoRef} className="w-full" muted playsInline />
        <canvas ref={canvasRef} className="w-full absolute inset-0 pointer-events-none" />
      </div>
    </div>
  );
}



