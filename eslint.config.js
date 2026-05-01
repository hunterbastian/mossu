import js from "@eslint/js";
import tseslint from "typescript-eslint";

const browserGlobals = {
  AudioContext: "readonly",
  CustomEvent: "readonly",
  DOMException: "readonly",
  Event: "readonly",
  HTMLAnchorElement: "readonly",
  HTMLCanvasElement: "readonly",
  HTMLElement: "readonly",
  ImageData: "readonly",
  KeyboardEvent: "readonly",
  PointerEvent: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  WebGL2RenderingContext: "readonly",
  WebGLRenderingContext: "readonly",
  cancelAnimationFrame: "readonly",
  console: "readonly",
  document: "readonly",
  localStorage: "readonly",
  navigator: "readonly",
  performance: "readonly",
  requestAnimationFrame: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  window: "readonly",
};

const nodeGlobals = {
  Buffer: "readonly",
  console: "readonly",
  clearTimeout: "readonly",
  process: "readonly",
  setTimeout: "readonly",
};

export default [
  {
    ignores: [
      ".codex-tmp/",
      ".contract-test-build/",
      "coverage/",
      "dist/",
      "node_modules/",
      "output/",
      "playwright-report/",
      "test-results/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "vite.config.ts", "playwright.config.ts"],
    languageOptions: {
      globals: browserGlobals,
    },
    rules: {
      "no-undef": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs", "eslint.config.js"],
    languageOptions: {
      globals: nodeGlobals,
    },
    rules: {
      "no-undef": "off",
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "no-useless-assignment": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
];
