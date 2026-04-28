import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const dataDir = join(process.cwd(), "data");
const latestPath = join(dataDir, "latest.json");
const historyPath = join(dataDir, "history.json");

export async function readLatestState() {
  return readJson(latestPath, {});
}

export async function writeLatestState(value) {
  await writeJson(latestPath, value);
}

export async function readHistory() {
  return readJson(historyPath, []);
}

export async function writeHistory(entry) {
  const history = await readHistory();
  history.unshift(entry);
  await writeJson(historyPath, history.slice(0, 300));
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
