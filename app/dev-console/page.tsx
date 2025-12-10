"use client";

import { useState } from "react";
import projectsData from "@/data/projects.json";

// projects.json доторх нэг файлын бүтэц
type ProjectFile = {
  path: string;
  content: string;
  summary?: string;
};

// projects.json бүхэлдээ
type ProjectsMap = {
  [project: string]: {
    files: ProjectFile[];
  };
};

// JSON-ыг type-тай болгох
const projects = projectsData as ProjectsMap;

export default function DevConsolePage() {
  // Одоогоор зөвхөн "income-app" төслийг уншина
  const files: ProjectFile[] = projects["income-app"]?.files ?? [];

  const [selectedPath, setSelectedPath] = useState("");
  const [code, setCode] = useState("");
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  // Файл сонгоход кодыг автоматаар харуулах
  function handleSelect(path: string) {
    setSelectedPath(path);

    const f = files.find((x) => x.path === path);
    if (f) {
      setCode(f.content);
    } else {
      setCode("");
    }
  }

  // Review API руу илгээх
  async function runReview() {
    if (!instruction.trim()) {
      alert("Instruction хоосон байна!");
      return;
    }

    if (!code.trim()) {
      alert("Код хоосон байна!");
      return;
    }

    setLoading(true);
    setResult("");

    try {
      const res = await fetch("/api/dev-review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          instruction,
        }),
      });

      const json = await res.json();
      setResult(json.result || json.error || "No response");
    } catch (err: any) {
      setResult("Холболтын алдаа: " + (err?.message ?? "unknown"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold">AI Dev Console V1</h1>
      <p className="text-sm text-gray-600">
        income-app төслийн файлаа сонгоод, AI-аас кодын анализ, сайжруулалтын
        санал авна.
      </p>

      {/* ФАЙЛ СОНГОГЧ */}
      <div>
        <label className="font-semibold">Файл сонгох</label>
        <select
          className="border p-2 rounded w-full mt-1"
          value={selectedPath}
          onChange={(e) => handleSelect(e.target.value)}
        >
          <option value="">-- Файл сонго --</option>
          {files.map((f) => (
            <option key={f.path} value={f.path}>
              {f.path}
            </option>
          ))}
        </select>
      </div>

      {/* INSTRUCTION */}
      <div>
        <label className="font-semibold">Instruction</label>
        <textarea
          className="border p-2 rounded w-full h-24 mt-1"
          placeholder='Ж: "Маргааны таб дээр notification badge нэм, логикийг тайлбарла"'
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
      </div>

      {/* CODE VIEW */}
      <div>
        <label className="font-semibold">Код (унших хэсэг)</label>
        <textarea
          className="border p-2 rounded w-full h-64 mt-1 font-mono text-sm"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>

      {/* RUN BUTTON */}
      <button
        onClick={runReview}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
      >
        {loading ? "Анализ хийж байна..." : "AI Review ажиллуулах"}
      </button>

      {/* RESULT */}
      <div>
        <label className="font-semibold">Үр дүн</label>
        <textarea
          className="border p-2 rounded w-full h-64 mt-1 bg-gray-50 text-sm"
          value={result}
          readOnly
        />
      </div>
    </div>
  );
}
