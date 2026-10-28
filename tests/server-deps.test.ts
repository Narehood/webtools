import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyServerDependencies } from "../scripts/copy-server-deps.mjs";

test("container dependency closure loads server libraries and native codecs without browser packages", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "webtools-runtime-"));
  try {
    const packages = await copyServerDependencies(process.cwd(), root);
    assert.ok(packages.includes("sharp"));
    assert.ok(packages.some((name: string) => name.startsWith(`@img${path.sep}sharp-`)), "include the installed native sharp codec");
    for (const browserPackage of ["react", "pdf-lib", "figlet", "libphonenumber-js", "@zxcvbn-ts"]) {
      await assert.rejects(access(path.join(root, "node_modules", browserPackage)));
    }
    await promisify(execFile)(process.execPath, ["--input-type=module", "--eval", `
      import sharp from 'sharp'; import whoiser from 'whoiser';
      import { ZipFile } from 'yazl'; import { fromBuffer } from 'yauzl';
      const photo = await sharp({create:{width:8,height:6,channels:3,background:'red'}}).png().toBuffer();
      if ((await sharp(photo).metadata()).width !== 8 || typeof whoiser !== 'function') throw Error('Missing runtime dependency');
      const zip = new ZipFile(), chunks = [];
      const result = new Promise((resolve, reject) => { zip.outputStream.on('data', c => chunks.push(c)); zip.outputStream.on('end', resolve); zip.on('error', reject); });
      zip.addBuffer(photo, 'photo.png'); zip.end(); await result;
      await new Promise((resolve, reject) => fromBuffer(Buffer.concat(chunks), {lazyEntries:true}, (error, archive) => { if(error) return reject(error); archive.on('entry', entry => { if(entry.fileName !== 'photo.png') return reject(Error('Bad ZIP')); archive.close(); resolve(); }); archive.readEntry(); }));
    `], { cwd: root });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("container dependency copying preserves nested versions and skips absent optional codecs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "webtools-dependency-graph-"));
  try {
    async function fixture(name: string, manifest: object) {
      const directory = path.join(root, "source/node_modules", name);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "package.json"), JSON.stringify(manifest));
    }
    await fixture("whoiser", { dependencies: { shared: "1" } });
    await fixture("sharp", { dependencies: { shared: "2" }, optionalDependencies: { absent: "1" } });
    await fixture("yauzl", {}); await fixture("yazl", {});
    await fixture("shared", { version: "1" });
    await fixture("sharp/node_modules/shared", { version: "2" });
    const packages = await copyServerDependencies(path.join(root, "source"), path.join(root, "runtime"));
    assert.ok(packages.includes("shared"));
    assert.ok(packages.includes(path.join("sharp", "node_modules", "shared")));
    assert.ok(!packages.includes("absent"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
