import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, parse, relative } from 'node:path'
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

async function findSchemaFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) return findSchemaFiles(file)
    return entry.isFile() && supportedExtensions.has(parse(entry.name).ext.toLowerCase()) ? [file] : []
  }))

  return files.flat().sort()
}

const files = await findSchemaFiles(sourceDirectory)
const documents = await Promise.all(files.map(async (file) => {
  const name = relative(sourceDirectory, file)
  const contents = await readFile(file, 'utf8')
  const extension = parse(file).ext.toLowerCase()
  const document: unknown = extension === '.json' ? JSON.parse(contents) : parseYaml(contents)

  if (!isOpenApiDocument(document)) {
    throw new Error(`${name} is not an OpenAPI document (missing "openapi" or "swagger").`)
  }

  return { name, project: dirname(name) === '.' ? 'Root' : dirname(name), document }
}))

await mkdir(outputDirectory, { recursive: true })
await writeFile(
  join(outputDirectory, 'index.json'),
  `${JSON.stringify(documents, null, 2)}\n`,
)
console.log(`Generated documentation for ${documents.length} OpenAPI schema${documents.length === 1 ? '' : 's'}.`)
