import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(root + "public/alphatab", { recursive: true });
for (const directory of ["font", "soundfont"]) {
  await cp(root + `node_modules/@coderline/alphatab/dist/${directory}`, root + `public/alphatab/${directory}`, { recursive: true });
}
for (const name of ["alphaTab.min.js"]) {
  await cp(root + `node_modules/@coderline/alphatab/dist/${name}`, root + `public/alphatab/${name}`);
}
await cp(root + "node_modules/@coderline/alphatab/LICENSE", root + "public/alphatab/LICENSE");
await cp(root + "node_modules/@coderline/alphatab/LICENSE.header", root + "public/alphatab/LICENSE.header");
