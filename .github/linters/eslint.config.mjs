import json from "@eslint/json";

export default [
  {
    ignores: [
      "tmp/**",
      "node_modules/**",
      "_site/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
    rules: { "json/no-duplicate-keys": "error" },
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        history: "readonly",
        Storage: "readonly",
        getComputedStyle: "readonly",
        innerWidth: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-unreachable": "error",
      "no-constant-condition": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-unsafe-finally": "error",
      eqeqeq: "error",
    },
  },
];
