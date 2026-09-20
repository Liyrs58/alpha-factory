import fs from "fs";
import path from "path";

function dataFile(name: string): string {
  return path.join(process.cwd(), "data", name);
}

function tmpFile(name: string): string {
  return path.join("/tmp", `alpha-factory-${name}`);
}

function candidates(name: string): string[] {
  return [dataFile(name), tmpFile(name)];
}

export function readJsonFile<T>(name: string): T | null {
  for (const p of candidates(name)) {
    try {
      if (fs.existsSync(/* turbopackIgnore: true */ p)) {
        return JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ p, "utf8")) as T;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

export function writeJsonFile(name: string, value: unknown): string {
  const payload = JSON.stringify(value);
  const errors: string[] = [];
  for (const p of candidates(name)) {
    try {
      fs.mkdirSync(/* turbopackIgnore: true */ path.dirname(p), { recursive: true });
      fs.writeFileSync(/* turbopackIgnore: true */ p, payload);
      return p;
    } catch (e) {
      errors.push(`${p}: ${e instanceof Error ? e.message : e}`);
    }
  }
  throw new Error(errors.join("; ") || "write failed");
}

export function removeJsonFile(name: string) {
  for (const p of candidates(name)) {
    try {
      if (fs.existsSync(/* turbopackIgnore: true */ p)) {
        fs.unlinkSync(/* turbopackIgnore: true */ p);
      }
    } catch {
      /* ignore */
    }
  }
}
