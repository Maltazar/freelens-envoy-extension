import { build, context } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, rm } from "node:fs/promises";

const require = createRequire(import.meta.url);
const hostModules = { react: "React", "react/jsx-runtime": "ReactJsxRuntime", mobx: "Mobx", "mobx-react": "MobxReact" };

// Freelens 2 provides these singletons via C3; never bundle a second React or MobX.
const hostBridge = {
  name: "freelens-host",
  setup(builder) {
    builder.onResolve({ filter: /^(react|react-dom|mobx|mobx-react)(\/.*)?$/ }, ({ path }) => {
      if (!Object.hasOwn(hostModules, path)) throw new Error(`Unsupported host module: ${path}`);
      return { path, namespace: "freelens-host" };
    });
    builder.onLoad({ filter: /.*/, namespace: "freelens-host" }, ({ path }) => {
      const names = Object.keys(require(path)).filter((name) => /^[A-Za-z_$][\w$]*$/.test(name) && !["default", "__esModule"].includes(name));
      return { contents: `const host = globalThis.FreelensExtensionApi.${hostModules[path]};\nexport default host;\n${names.map((name) => `export const ${name} = host[${JSON.stringify(name)}];`).join("\n")}` };
    });
  },
};

const watch = process.argv.includes("--watch");
await mkdir("artifacts", { recursive: true });
if (!watch) await rm("dist", { recursive: true, force: true });

for (const name of ["main", "renderer"]) {
  const options = {
    entryPoints: [`src/${name}.${name === "renderer" ? "tsx" : "ts"}`],
    outfile: `dist/${name}.js`,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2023",
    jsx: "automatic",
    sourcemap: true,
    logLevel: "info",
    plugins: [hostBridge],
  };
  if (watch) await (await context(options)).watch();
  else await build(options);
}