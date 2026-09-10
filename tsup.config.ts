import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: {
    tsconfig: "tsconfig.dts.json",
  },
  format: ["cjs", "esm"],
  sourcemap: true,
  clean: true,
});
