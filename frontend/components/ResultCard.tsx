"use client";
import React from "react";
import { ShieldCheckIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

type Result = {
  label: string;
  confidence: number | null;
  score?: number | null; // 0..1 where higher is better
  bbox?: number[] | null;
  title?: string | null; // backward compat
  metadata?: {
    title?: string | null;
    case?: string | null;
    sex?: string | null;
    age?: string | number | null;
    address?: string | null;
    notes?: string | null;
  } | null;
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
  const title = result.metadata?.title ?? result.title ?? null;
  const caseInfo = result.metadata?.case ?? null;
  const sex = result.metadata?.sex ?? null;
  const age = result.metadata?.age ?? null;
  const address = result.metadata?.address ?? null;
  const notes = result.metadata?.notes ?? null;
  const scorePct = typeof result.score === "number" ? Math.round(Math.max(0, Math.min(1, result.score)) * 100) : null;
  return (
    <div className="card">
      <div className="font-medium mb-2 flex items-center gap-2">
        {unknown ? (
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-600" />
        ) : (
          <ShieldCheckIcon className="w-5 h-5 text-emerald-600" />
        )}
        <span>Result</span>
      </div>
      <div className={`text-2xl font-semibold ${unknown ? "text-amber-700" : "text-emerald-700"}`}>{result.label}</div>
      <div className="mt-1">
        {unknown ? (
          <span className="badge badge-warning">No criminal case found</span>
        ) : (
          <span className="badge badge-success">Criminal record found</span>
        )}
      </div>
      {title ? (
        <div className="text-sm text-gray-700 mt-2">{title}</div>
      ) : null}
      {caseInfo ? <div className="text-sm text-gray-700">Case: {caseInfo}</div> : null}
      {sex || age ? (
        <div className="text-sm text-gray-700">{sex ? `Sex: ${sex}` : null}{sex && age ? " • " : null}{age ? `Age: ${age}` : null}</div>
      ) : null}
      {address ? <div className="text-sm text-gray-700">Address: {address}</div> : null}
      {notes ? <div className="text-sm text-gray-700">Notes: {notes}</div> : null}
      <div className="text-sm text-gray-600 mt-2">
        Distance: {result.confidence !== null ? result.confidence.toFixed(1) : "-"}
        {scorePct !== null ? <span className="ml-2">Match score: {scorePct}%</span> : null}
      </div>
    </div>
  );
}


