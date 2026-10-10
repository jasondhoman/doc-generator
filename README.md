# API documentation generator

Copy OpenAPI JSON, YAML, or YML files into `openapi/`. The React site generates an API selector and reference pages for each file, including endpoints, parameters, request bodies, response schemas, and responses. Schema labels use TypeScript-style types, so OpenAPI `integer`, `int32`, and `int64` values display as `number`.

Each endpoint has a **Copy for Word** button. It copies rich HTML for pasting into Microsoft Word and a plain-text equivalent for other applications.

```bash
pnpm install
pnpm dev
```

The app and schema generator are written in TypeScript. Run `pnpm typecheck` to check them without building the site.

The schema index is regenerated when `pnpm dev` or `pnpm build` runs. To regenerate it without starting the app:

```bash
pnpm docs
```

`openapi/example.yaml` is a working example and can be removed once you add your schemas.
