import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist", "server");
await rm(resolve(root, "dist"), { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, "platform", "worker.js"), resolve(output, "index.js"));
await cp(resolve(root, "platform", "lib.js"), resolve(output, "lib.js"));
console.log("Built THEARD event operations worker.");
