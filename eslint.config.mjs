import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import prettier from "eslint-config-prettier/flat";

export default tseslint.config(
  // global ignores (replacement for .eslintignore)
  { ignores: ["**/dist/", "**/node_modules/", "**/*.js", "**/*.cjs", "**/*.mjs"] },

  // base JS rules
  eslint.configs.recommended,

  // TS rules (typed)
  tseslint.configs.recommendedTypeChecked,
  // tseslint.configs.recommendedTypeChecked,

  // project service = auto-detect tsconfigs across packages/*
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        allowDefaultProject: true,
        noWarnOnMultipleProjects: true,
      },
    },

    // keep only non-formatting rules you actually want
    plugins: { import: importPlugin },
    settings: {
      "import/resolver": {
        typescript: {
          project: ["./tsconfig.json", "./packages/*/tsconfig.json"],
        },
      },
    },
    rules: {
      // import hygiene (Prettier doesn’t do this)
      "import/no-useless-path-segments": "error",
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      // leave TS rule tuning to the preset unless you *really* need changes
    },
  },

  // put Prettier last to disable any conflicting formatting rules
  prettier,
);
