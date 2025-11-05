"use client";
import React, { useState } from "react";
import { WebcamBox } from "../components/WebcamBox";
import { ResultCard } from "../components/ResultCard";

export default function Page() {
  const [result, setResult] = useState<any>(null);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <WebcamBox onResult={setResult} />
      <ResultCard result={result} />
    </div>
  );
}




