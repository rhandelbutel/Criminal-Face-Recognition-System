"use client";
import React, { useEffect, useRef, useState } from "react";
import { apiGet, apiMultipart, apiDelete } from "../../lib/api";
import { PlusIcon, TrashIcon, XMarkIcon, CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";

type ModalState = {
  show: boolean;
  type: "success" | "error" | null;
  message: string;
};

type MetaFromServer = {
  title?: string;
  case?: string;
  sex?: string;
  age?: number | string;
  address?: string;
  notes?: string;
};

const MAX_TEXT = 25;
const MAX_AGE = 105;

const sanitizeText = (s: string, limit = MAX_TEXT) =>
  (s ?? "").toString().trim().slice(0, limit);

const isPositiveInt = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) && (n as number) > 0 && Number.isInteger(n as number);
};

// keep only digits, cut to 3, clamp to [1, MAX_AGE]
const normalizeAgeInput = (raw: string): number | "" => {
  if (raw === "") return "";
  const digits = raw.replace(/\D+/g, "").slice(0, 3);
  if (!digits) return "";
  const n = Math.max(1, Math.min(MAX_AGE, parseInt(digits, 10)));
  return n;
};

export default function TrainPage() {
  const [label, setLabel] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [title, setTitle] = useState("");
  const [caseInfo, setCaseInfo] = useState("");
  const [sex, setSex] = useState("");
  const [age, setAge] = useState<number | "">(""); // number | "" for UX
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [labels, setLabels] = useState<Record<string, number>>({});
  const [modal, setModal] = useState<ModalState>({ show: false, type: null, message: "" });
  const [isAddingToExisting, setIsAddingToExisting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const quickAddInputRef = useRef<HTMLInputElement | null>(null);
  const quickAddMetaRef = useRef<MetaFromServer | null>(null);

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

  const showModal = (type: "success" | "error", message: string) => {
    setModal({ show: true, type, message });
    setTimeout(() => setModal({ show: false, type: null, message: "" }), 3000);
  };

  const uploadAndTrain = async () => {
    const _label = sanitizeText(label);
    const _title = sanitizeText(title);
    const _case = sanitizeText(caseInfo);
    const _address = sanitizeText(address);

    if (!_label) return showModal("error", "Label is required.");
    if (!_title) return showModal("error", "Title is required.");
    if (!_case) return showModal("error", "Case is required.");
    if (!sex.trim()) return showModal("error", "Sex is required.");
    if (age === "" || !isPositiveInt(age)) return showModal("error", `Age must be a whole number from 1 to ${MAX_AGE}.`);
    if (!_address) return showModal("error", "Address is required.");
    if (!files || files.length === 0) return showModal("error", "At least one image is required.");

    setBusy(true);
    setMessage("Uploading & Training...");
    try {
      const fd = new FormData();
      fd.append("label", _label);
      Array.from(files).forEach((f) => fd.append("files", f));
      fd.append("title", _title);
      fd.append("case", _case);
      fd.append("sex", sex.trim());
      fd.append("age", String(Math.max(1, Math.min(MAX_AGE, Number(age)))));
      fd.append("address", _address);
      if (notes.trim()) fd.append("notes", notes.trim()); // no limit for notes

      const res = await apiMultipart("/api/train/upload", fd);
      const successMsg = `Successfully added ${res.added} training image(s)${res.skipped > 0 ? `, skipped ${res.skipped}` : ""}. Total images: ${res.images_count}`;
      setMessage(successMsg);
      showModal("success", successMsg);
      await refresh();

      if (!isAddingToExisting) {
        setLabel("");
        setTitle("");
        setCaseInfo("");
        setSex("");
        setAge("");
        setAddress("");
        setNotes("");
        setFiles(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        setIsAddingToExisting(false);
      }
    } catch (e: any) {
      const errorMsg = e?.message || "Upload failed. Please try again.";
      setMessage(errorMsg);
      showModal("error", errorMsg);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await uploadAndTrain();
  };

  const startAddToLabel = async (name: string) => {
    setIsAddingToExisting(true);
    setLabel(name);
    try {
      const metadata = await apiGet<MetaFromServer>(`/api/labels/${encodeURIComponent(name)}/metadata`);
      quickAddMetaRef.current = metadata || null;
    } catch {
      quickAddMetaRef.current = null;
    }
    if (quickAddInputRef.current) {
      quickAddInputRef.current.value = "";
      quickAddInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    setFiles(selectedFiles);

    if (isAddingToExisting && selectedFiles && selectedFiles.length > 0) {
      setTimeout(() => {
        if (
          sanitizeText(label) &&
          sanitizeText(title) &&
          sanitizeText(caseInfo) &&
          sex.trim() &&
          age !== "" &&
          isPositiveInt(age) &&
          sanitizeText(address)
        ) {
          uploadAndTrain();
        }
      }, 100);
    }
  };

  const handleQuickAddFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!label.trim() || !selected || selected.length === 0) return;

    setBusy(true);
    setMessage("Uploading to existing label...");
    try {
      const fd = new FormData();
      fd.append("label", sanitizeText(label));
      Array.from(selected).forEach((f) => fd.append("files", f));

      const md = quickAddMetaRef.current || {};
      // limit to 25 chars except notes; send age only if valid (clamped to MAX_AGE)
      if (md.title) fd.append("title", sanitizeText(String(md.title)));
      if (md.case) fd.append("case", sanitizeText(String(md.case)));
      if (md.sex) fd.append("sex", String(md.sex));
      if (md.age && isPositiveInt(md.age)) {
        const a = Math.max(1, Math.min(MAX_AGE, Number(md.age)));
        fd.append("age", String(a));
      }
      if (md.address) fd.append("address", sanitizeText(String(md.address)));
      if (md.notes) fd.append("notes", String(md.notes)); // keep notes unlimited

      const res = await apiMultipart("/api/train/upload", fd);
      const successMsg = `Successfully added ${res.added} training image(s)${res.skipped > 0 ? `, skipped ${res.skipped}` : ""}. Total images: ${res.images_count}`;
      setMessage(successMsg);
      showModal("success", successMsg);
      await refresh();
    } catch (err: any) {
      const errorMsg = err?.message || "Upload failed. Please try again.";
      setMessage(errorMsg);
      showModal("error", errorMsg);
    } finally {
      setBusy(false);
      setIsAddingToExisting(false);
      quickAddMetaRef.current = null;
      if (quickAddInputRef.current) quickAddInputRef.current.value = "";
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
            <input
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, MAX_TEXT))}
              placeholder="e.g., Juan_Dela_Cruz"
              maxLength={MAX_TEXT}
              required
            />
          </div>
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, MAX_TEXT))}
              placeholder="e.g., Most Wanted"
              maxLength={MAX_TEXT}
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Case</label>
              <input
                className="input"
                value={caseInfo}
                onChange={(e) => setCaseInfo(e.target.value.slice(0, MAX_TEXT))}
                placeholder="e.g., Robbery, Fraud, etc."
                maxLength={MAX_TEXT}
                required
              />
            </div>
            <div>
              <label className="label">Sex</label>
              <select className="input" value={sex} onChange={(e) => setSex(e.target.value)} required>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label className="label">Age</label>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min={1}
                max={MAX_AGE}
                step={1}
                placeholder="e.g., 34"
                value={age}
                onChange={(e) => setAge(normalizeAgeInput(e.target.value))}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                required
              />
              
            </div>
            <div>
              <label className="label">Address</label>
              <input
                className="input"
                value={address}
                onChange={(e) => setAddress(e.target.value.slice(0, MAX_TEXT))}
                placeholder="Barangay, City/Municipality"
                maxLength={MAX_TEXT}
                required
              />
            </div>
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea
              className="input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)} // no limit
              placeholder="Any additional identifying details"
            />
          </div>
          <div>
            <label className="label">Images (1–20)</label>
            <input ref={fileInputRef} className="block" type="file" accept="image/*" multiple onChange={handleFileChange} required />
          </div>
          <div className="flex gap-2">
            <button className="btn" disabled={busy} type="submit">
              <PlusIcon className="w-5 h-5 mr-2" /> Add / Upload
            </button>
          </div>
        </form>
        {message && <div className="mt-3 text-sm text-gray-600">{message}</div>}
      </div>

      {modal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setModal({ show: false, type: null, message: "" })}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-4">
              {modal.type === "success" ? (
                <CheckCircleIcon className="w-8 h-8 text-green-600 flex-shrink-0" />
              ) : (
                <ExclamationCircleIcon className="w-8 h-8 text-red-600 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h3 className={`font-semibold text-lg mb-2 ${modal.type === "success" ? "text-green-800" : "text-red-800"}`}>
                  {modal.type === "success" ? "Success!" : "Error"}
                </h3>
                <p className="text-gray-700">{modal.message}</p>
              </div>
              <button onClick={() => setModal({ show: false, type: null, message: "" })} className="text-gray-400 hover:text-gray-600 transition-colors">
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="font-medium mb-3 text-lg">Dataset</div>
        {/* Hidden input for quick-add uploads that bypasses main form */}
        <input ref={quickAddInputRef} className="hidden" type="file" accept="image/*" multiple onChange={handleQuickAddFiles} />
        <ul className="space-y-2">
          {Object.keys(labels).length === 0 && <li className="text-gray-500">No labels yet</li>}
          {Object.entries(labels).map(([k, v]) => (
            <li key={k} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
              <div>
                <div className="font-medium">{k}</div>
                <div className="text-sm text-gray-600">{v} images</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn-outline hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-all duration-200"
                  disabled={busy}
                  title="Add images"
                  aria-label="Add images"
                  onClick={() => startAddToLabel(k)}
                >
                  <PlusIcon className="w-5 h-5" />
                </button>
                <button
                  className="btn-outline hover:bg-red-50 hover:border-red-400 hover:text-red-700 transition-all duration-200"
                  disabled={busy}
                  title="Delete label"
                  aria-label="Delete label"
                  onClick={() => deleteLabel(k)}
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
