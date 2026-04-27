import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

type PackageJson = {
  version: string;
  repository?: string | { url?: string };
};

function readSupportUrl(pkg: PackageJson): string {
  const r = pkg.repository;
  if (typeof r === "string") {
    if (r.startsWith("http")) return r;
    return `https://github.com/${r.replace(/^\//, "")}`;
  }
  if (r && typeof r === "object" && typeof r.url === "string") {
    let out = r.url.replace(/^git\+/, "");
    if (out.startsWith("git@github.com:")) {
      out = `https://github.com/${out.slice("git@github.com:".length)}`;
    }
    return out.replace(/\.git$/, "");
  }
  return "https://github.com/";
}

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as PackageJson;

export default defineConfig({
  define: {
    __MOSSU_VERSION__: JSON.stringify(pkg.version),
    __MOSSU_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __MOSSU_SUPPORT_URL__: JSON.stringify(readSupportUrl(pkg)),
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three/examples")) {
            return "three-examples";
          }
          if (id.includes("node_modules/three")) {
            return "three";
          }
          if (id.includes("node_modules/camera-controls")) {
            return "camera-controls";
          }
          if (id.includes("node_modules/three-mesh-bvh")) {
            return "three-mesh-bvh";
          }
        },
      },
    },
  },
});
