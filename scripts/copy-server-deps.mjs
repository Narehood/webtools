import { cp, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SERVER_PACKAGES = ["whoiser", "sharp", "yauzl", "yazl"];

// Copy the installed dependency closure, preserving npm's nested layout and exact
// lockfile versions. Optional native packages are included only when installed
// for the build platform (including sharp's Alpine/musl @img codecs).
export async function copyServerDependencies(source, destination) {
  const sourceRoot = path.resolve(source);
  const modules = path.join(sourceRoot, "node_modules");
  const copied = new Set();

  async function locate(name, parent) {
    for (let current = parent; ; current = path.dirname(current)) {
      const candidate = path.join(current, "node_modules", name);
      try { if ((await stat(path.join(candidate, "package.json"))).isFile()) return candidate; }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (current === sourceRoot) return null;
    }
  }

  async function include(name, parent, optional = false) {
    const directory = await locate(name, parent);
    if (!directory) {
      if (optional) return;
      throw new Error(`Missing server runtime dependency: ${name}`);
    }
    if (copied.has(directory)) return;
    copied.add(directory);
    const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    const target = path.join(destination, "node_modules", path.relative(modules, directory));
    await mkdir(path.dirname(target), { recursive: true });
    await cp(directory, target, { recursive: true, filter: (file) => file !== path.join(directory, "node_modules") });
    const optionalNames = manifest.optionalDependencies || {};
    for (const dependency of Object.keys({ ...manifest.dependencies, ...optionalNames })) {
      await include(dependency, directory, Object.hasOwn(optionalNames, dependency));
    }
  }

  for (const name of SERVER_PACKAGES) await include(name, sourceRoot);
  return [...copied].map((directory) => path.relative(modules, directory));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const destination = process.argv[2];
  if (!destination) throw new Error("Pass a destination directory");
  await copyServerDependencies(process.cwd(), path.resolve(destination));
}
