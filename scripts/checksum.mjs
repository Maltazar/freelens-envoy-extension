import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";

for (const file of await readdir("artifacts")) {
  if (!file.endsWith(".tgz")) continue;
  const digest = createHash("sha256").update(await readFile(`artifacts/${file}`)).digest("hex");
  await writeFile(`artifacts/${file}.sha256`, `${digest}  ${file}\n`);
  console.log(`Created artifacts/${file}.sha256`);
}