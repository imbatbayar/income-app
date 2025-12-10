// scripts/generate-projects.mjs
// income-app төслийн app/, components/, lib/ хавтаснуудаас .ts/.tsx/.js/.jsx файлуудыг уншаад
// data/projects.json дотор path + content хэлбэрээр хадгална.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Репо-гийн үндэс (энэ скриптийг root-оос ажиллуулна гэж үзэж байна)
const ROOT = path.resolve(__dirname, "..");

// projects.json гарах байр
const OUT_DIR = path.join(ROOT, "data");
const OUT_FILE = path.join(OUT_DIR, "projects.json");

// Project name (зүгээр л нэр, хүсвэл дараа нь сольж болно)
const PROJECT_NAME = "income-app";

// Ямар хавтаснуудаас код унших вэ
const INCLUDE_DIRS = ["app", "components", "lib"];

// Ямар өргөтгөлтэй файлыг авах вэ
const EXT = [".ts", ".tsx", ".js", ".jsx"];

function walkDir(dir, base) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];

  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files = files.concat(walkDir(full, base));
    } else {
      const ext = path.extname(e.name);
      if (EXT.includes(ext)) {
        const rel = path.relative(base, full).replace(/\\/g, "/");
        files.push(rel);
      }
    }
  }

  return files;
}

function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const result = {
    [PROJECT_NAME]: {
      files: [],
    },
  };

  for (const dir of INCLUDE_DIRS) {
    const fullDir = path.join(ROOT, dir);
    if (!fs.existsSync(fullDir)) {
      console.log(`⏭  Хавтас алга, алгаслаа: ${dir}`);
      continue;
    }

    console.log(`📂 Скан хийж байна: ${dir}`);
    const filePaths = walkDir(fullDir, ROOT);

    for (const relPath of filePaths) {
      const full = path.join(ROOT, relPath);
      const content = fs.readFileSync(full, "utf8");

      result[PROJECT_NAME].files.push({
        path: relPath,
        summary: "", // Дараа нь хүсвэл гараар бөглөж болно
        content,
      });
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), "utf8");
  console.log("✅ projects.json шинэчлэгдлээ:", OUT_FILE);
}

main();
