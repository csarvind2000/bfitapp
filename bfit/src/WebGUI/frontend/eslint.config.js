import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import js from "@eslint/js"

export default [
  {
    files: ["**/*.{js,jsx}"],
    plugins: { "react-hooks": reactHooks, react },
    ...js.configs.recommended,
    ...react.configs.flat.recommended,
    ...react.configs.flat["jsx-runtime"],
    ...reactHooks.configs['recommended-latest'],
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
