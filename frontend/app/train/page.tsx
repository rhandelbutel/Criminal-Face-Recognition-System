"use client";
import React, { useEffect, useState } from "react";
import { apiGet, apiMultipart, apiPost, apiDelete } from "../../lib/api";

export default function TrainPage() {
  const [label, setLabel] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [labels, setLabels] = useState<Record<string, number>>({});

  const refresh = async () => {
    try {
      const data = await apiGet<Record<string, number>>("/api/labels");
      setLabels(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !files || files.length === 0) {
      return alert("Provide label and at least one image.");
    }
    setBusy(true);
    setMessage("Uploading & Training...");
    try {
      const fd = new FormData();
      fd.append("label", label.trim());
      Array.from(files).forEach((f) => fd.append("files", f));
      if (title.trim()) fd.append("title", title.trim());
      const res = await apiMultipart("/api/train/upload", fd);
      setMessage(`Added ${res.added}, skipped ${res.skipped}. Model images: ${res.images_count}`);
      await refresh();
    } catch (e: any) {
      setMessage(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const retrain = async () => {
    setBusy(true);
    setMessage("Rebuilding model from dataset...");
    try {
      const res = await apiPost("/api/train/rebuild", {});
      setMessage(`Labels: ${res.labels_count}, Images: ${res.images_count}`);
    } catch (e: any) {
      setMessage(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteLabel = async (name: string) => {
    if (!confirm(`Delete label '${name}'?`)) return;
    setBusy(true);
    setMessage("Deleting label and retraining...");
    try {
      const res = await apiDelete(`/api/train/delete?label=${encodeURIComponent(name)}`);
      setMessage(`Removed: ${res.removed}. Images: ${res.images_count}`);
      await refresh();
    } catch (e: any) {
      setMessage(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <div className="font-medium mb-3 text-lg">Upload Photos & Train</div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="label">Name / Label</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Juan_Dela_Cruz" />
          </div>
          <div>
            <label className="label">Title / Case (optional)</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Criminal Case Found - Murder" />
          </div>
          <div>
            <label className="label">Images (1–20)</label>
            <input className="block" type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} />
          </div>
          <div className="flex gap-2">
            <button className="btn" disabled={busy} type="submit">Upload & Train</button>
            <button className="btn-outline" disabled={busy} type="button" onClick={retrain}>Retrain</button>
          </div>
        </form>
        {message && <div className="mt-3 text-sm text-gray-600">{message}</div>}
      </div>
      <div className="card">
        <div className="font-medium mb-3 text-lg">Dataset</div>
        <ul className="space-y-2">
          {Object.keys(labels).length === 0 && <li className="text-gray-500">No labels yet</li>}
          {Object.entries(labels).map(([k, v]) => (
            <li key={k} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
              <div>
                <div className="font-medium">{k}</div>
                <div className="text-sm text-gray-600">{v} images</div>
              </div>
              <button className="btn-outline" disabled={busy} onClick={() => deleteLabel(k)}>Delete</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


