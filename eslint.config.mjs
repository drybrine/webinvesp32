import nextVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [
      ".claude/**",
      ".next/**",
      ".vercel/**",
      "build/**",
      "coverage/**",
      "dist/**",
      "out/**",
      "api/__pycache__/**",
      "functions/**",
      "node_modules/**",
      "public/**/*.js",
      "**/*.min.js",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-this-alias": "warn",
      "prefer-const": "warn",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]

export default eslintConfig
