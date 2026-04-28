/* eslint-env node */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  env: { browser: true, node: true, es2022: true },
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
  ],
  settings: { react: { version: "detect" } },
  rules: {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
  overrides: [
    {
      // Architecture review P0: vendor adapters must never be imported from
      // client-routable code paths. Components never import vendors regardless
      // of `.server.ts` suffix; API routes are the only allowed call site.
      files: ["app/components/**/*.{ts,tsx}", "app/routes/**/*.{ts,tsx}"],
      excludedFiles: ["app/routes/api.*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "**/services/avatar/**",
                  "**/services/voice/**",
                  "**/services/llm/**",
                ],
                message:
                  "Vendor adapters must not be imported from components or non-API routes. Use API actions or .server.ts re-exports.",
              },
            ],
          },
        ],
      },
    },
  ],
  ignorePatterns: ["build", "node_modules", "public/build", "worker/dist"],
};
