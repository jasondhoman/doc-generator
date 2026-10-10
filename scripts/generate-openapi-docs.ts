import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, parse } from 'node:path'
import { parse as parseYaml } from 'yaml'

interface OpenApiDocument {
  openapi?: string
  swagger?: string
  [key: string]: unknown
}

const sourceDirectory = 'openapi'
const outputDirectory = 'public/openapi'
const supportedExtensions = new Set(['.json', '.yaml', '.yml'])

function isOpenApiDocument(value: unknown): value is OpenApiDocument {
  return typeof value === 'object'
    && value !== null
    && ('openapi' in value || 'swagger' in value)
}

const files = (await readdir(sourceDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && supportedExtensions.has(parse(entry.name).ext.toLowerCase()))

const documents = await Promise.all(files.map(async ({ name }) => {
  const contents = await readFile(join(sourceDirectory, name), 'utf8')
  const extension = parse(name).ext.toLowerCase()
  const document: unknown = extension === '.json' ? JSON.parse(contents) : parseYaml(contents)

  if (!isOpenApiDocument(document)) {
    throw new Error(`${name} is not an OpenAPI document (missing "openapi" or "swagger").`)
  }

  return { name, document }
}))

await mkdir(outputDirectory, { recursive: true })
await writeFile(
  join(outputDirectory, 'index.json'),
  `${JSON.stringify(documents, null, 2)}\n`,
)
console.log(`Generated documentation for ${documents.length} OpenAPI schema${documents.length === 1 ? '' : 's'}.`)
