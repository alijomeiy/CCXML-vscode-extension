# Some Notes

- This project is extension for CCXML file to make development more easy
- This project mostly developed by AI tools!

# CCXML Tools

VS Code language support for CCXML files.

## Features

- **CCXML language mode** for `.ccxml` files.
- **Syntax highlighting** for XML-style CCXML documents.
- **Tag completion** based on the W3C CCXML specification.
- **Smart snippets** for CCXML elements:
  - Container elements such as `<transition>` insert opening and closing tags.
  - Empty elements such as `<log />`, `<assign />`, and `<send />` insert self-closing tags.
- **Attribute completion** CCXML tags based on the W3C CCXML specification.
- **Standard event completion** for CCXML events such as `connection.alerting`, `fetch.done`, and `dialog.exit`.
- **Variable completion** for variables declared with `<var name="..." />`.
- **Ctrl+Click / Go to Definition** for CCXML variables.
- **Validation diagnostics** for:
  - Unknown CCXML tags.
  - Missing required attributes.
  - Attributes that are not allowed on a tag.

## Rules Source

The extension uses rule data extracted from the W3C CCXML specification:

https://www.w3.org/TR/ccxml/

Local rule overrides are stored in `data/ccxml-rules.override.json`. These are used for project-specific fixes such as whether an element should be completed as a self-closing tag or as a container tag.

## Commands

```bash
npm run compile
```

Compile the TypeScript extension source into `out/`.

```bash
npm run build
```

Clean and compile the extension.

```bash
npm run extract:ccxml-rules
```

Regenerate CCXML rule data from the W3C specification.

## Project Structure

- `src/extension.ts` activates the extension and registers providers.
- `src/completion.ts` provides tag, attribute, event, and variable completion.
- `src/definition.ts` provides Ctrl+Click / Go to Definition for variables.
- `src/diagnostics.ts` validates CCXML documents.
- `src/schema.ts` loads and merges generated rules with local overrides.
- `data/ccxml-rules.generated.json` contains extracted W3C rule data.
- `data/ccxml-rules.override.json` contains local rule corrections.
- `syntaxes/ccxml.tmLanguage.json` contains syntax highlighting rules.

## Development

Install dependencies:

```bash
npm install
```

Compile:

```bash
npm run compile
```

Then run or package the extension using the standard VS Code extension workflow.
