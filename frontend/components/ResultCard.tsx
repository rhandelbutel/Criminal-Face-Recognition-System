"use client";
import React from "react";

type Result = {
  label: string;
  confidence: number | null;
  bbox?: number[] | null;
  title?: string | null;
};

export function ResultCard({ result }: { result: Result | null }) {
  if (!result) {
    return (
      <div className="card">
        <div className="font-medium">Result</div>
        <div className="text-gray-500">No result yet</div>
      </div>
    );
  }
  const unknown = result.label === "Unknown";
  return (
    <div className="card">
      <div className="font-medium mb-2">Result</div>
      <div className={`text-2xl font-semibold ${unknown ? "text-amber-600" : "text-emerald-700"}`}>
        {result.label}
      </div>
      {result.title ? (
        <div className="text-sm text-gray-700 mb-1">{result.title}</div>
      ) : null}
      <div className="text-sm text-gray-600">Confidence: {result.confidence !== null ? result.confidence.toFixed(1) : "-"}</div>
    </div>
  );
}


