import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'

const methodOrder = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const
type HttpMethod = typeof methodOrder[number]

interface Reference { $ref?: string }
interface SchemaObject extends Reference {
  type?: string
  format?: string
  enum?: Array<string | number | boolean | null>
  items?: SchemaObject
}
interface MediaTypeObject { schema?: SchemaObject }
interface ParameterObject extends Reference {
  name?: string
  in?: string
  required?: boolean
  description?: string
  schema?: SchemaObject
}
interface RequestBodyObject { content?: Record<string, MediaTypeObject> }
interface ResponseObject extends Reference {
  description?: string
  content?: Record<string, MediaTypeObject>
}
interface OperationObject {
  operationId?: string
  summary?: string
  description?: string
  parameters?: ParameterObject[]
  requestBody?: RequestBodyObject
  responses?: Record<string, ResponseObject>
}
type PathItem = Partial<Record<HttpMethod, OperationObject>> & { parameters?: ParameterObject[] }
interface OpenApiDocument extends Record<string, unknown> {
  openapi?: string
  swagger?: string
  info?: { title?: string; version?: string; description?: string }
  paths?: Record<string, PathItem>
}
interface GeneratedDocument { name: string; project: string; document: OpenApiDocument }
interface CollectedOperation {
  path: string
  method: HttpMethod
  operation: OperationObject
  pathParameters: ParameterObject[]
}
type CopyStatus = 'copied' | 'failed'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOpenApiDocument(value: unknown): value is OpenApiDocument {
  return isRecord(value) && (typeof value.openapi === 'string' || typeof value.swagger === 'string')
}

function isGeneratedDocument(value: unknown): value is GeneratedDocument {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.project === 'string'
    && isOpenApiDocument(value.document)
}

function resolveRef<T extends Reference>(document: OpenApiDocument, value: T | undefined): T | undefined {
  if (!value?.$ref?.startsWith('#/')) return value

  return value.$ref
    .slice(2)
    .split('/')
    .reduce<unknown>((current, key) => isRecord(current) ? current[key] : undefined, document) as T | undefined
}

function schemaLabel(document: OpenApiDocument, schema: SchemaObject | undefined): string {
  if (schema?.$ref?.startsWith('#/components/schemas/')) return schema.$ref.split('/').at(-1) ?? 'object'

  const resolved = resolveRef(document, schema)
  if (!resolved) return 'Not defined'
  if (resolved.type === 'array') return `Array<${schemaLabel(document, resolved.items)}>`
  if (resolved.enum) return resolved.enum.map((value) => typeof value === 'string' ? `'${value}'` : String(value)).join(' | ')
  if (resolved.type === 'integer' || resolved.type === 'number') return 'number'
  return resolved.type ?? 'object'
}

function collectOperations(document: OpenApiDocument): CollectedOperation[] {
  return Object.entries(document.paths ?? {}).flatMap(([path, pathItem]) =>
    methodOrder.flatMap((method) => {
      const operation = pathItem[method]
      return operation ? [{ path, method, operation, pathParameters: pathItem.parameters ?? [] }] : []
    }),
  )
}

function operationAnchor(item: CollectedOperation): string {
  return item.operation.operationId ?? `${item.method}-${item.path.replaceAll(/[^a-zA-Z0-9]+/g, '-')}`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character)
}

function endpointDocumentation(document: OpenApiDocument, item: CollectedOperation): { html: string; plain: string } {
  const parameters = [...item.pathParameters, ...(item.operation.parameters ?? [])]
  const content = Object.entries(item.operation.requestBody?.content ?? {})
  const responses = Object.entries(item.operation.responses ?? {})
  const title = item.operation.summary ?? item.operation.operationId ?? item.path
  const parameterRows = parameters.map((parameter) => {
    const resolved = resolveRef(document, parameter) ?? parameter
    return {
      name: resolved.name ?? 'Unnamed parameter',
      location: resolved.in ?? 'unknown',
      required: resolved.required ? 'Required' : 'Optional',
      type: schemaLabel(document, resolved.schema),
      description: resolved.description ?? '—',
    }
  })
  const requestRows = content.map(([type, value]) => ({ type, schema: schemaLabel(document, value.schema) }))
  const responseRows = responses.map(([status, response]) => {
    const resolved = resolveRef(document, response) ?? response
    return {
      status,
      description: resolved.description ?? 'No description',
      schemas: Object.entries(resolved.content ?? {}).map(([type, value]) => ({ type, schema: schemaLabel(document, value.schema) })),
    }
  })
  const endpoint = `${item.method.toUpperCase()} ${item.path}`
  const plain = [
    title, endpoint, item.operation.description,
    parameterRows.length && `Parameters\n${parameterRows.map(({ name, location, required, type, description }) => `• ${name} (${location}, ${required}; ${type}): ${description}`).join('\n')}`,
    requestRows.length && `Request body\n${requestRows.map(({ type, schema }) => `• ${type}: ${schema}`).join('\n')}`,
    responseRows.length && `Responses\n${responseRows.map(({ status, description, schemas }) => `• ${status}: ${description}${schemas.length ? ` (${schemas.map(({ type, schema }) => `${type}: ${schema}`).join(', ')})` : ''}`).join('\n')}`,
  ].filter(Boolean).join('\n\n')
  const parameterTable = parameterRows.map(({ name, location, required, type, description }) =>
    `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(location)}</td><td>${escapeHtml(required)}</td><td>${escapeHtml(type)}</td><td>${escapeHtml(description)}</td></tr>`,
  ).join('')
  const requestList = requestRows.map(({ type, schema }) => `<li><strong>${escapeHtml(type)}</strong>: ${escapeHtml(schema)}</li>`).join('')
  const responseList = responseRows.map(({ status, description, schemas }) =>
    `<li><strong>${escapeHtml(status)}</strong>: ${escapeHtml(description)}${schemas.length ? `<ul>${schemas.map(({ type, schema }) => `<li><strong>${escapeHtml(type)}</strong>: ${escapeHtml(schema)}</li>`).join('')}</ul>` : ''}</li>`,
  ).join('')
  const html = [
    `<h1>${escapeHtml(title)}</h1>`, `<p><strong>${escapeHtml(endpoint)}</strong></p>`,
    item.operation.description && `<p>${escapeHtml(item.operation.description)}</p>`,
    parameterTable && `<h2>Parameters</h2><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>Name</th><th>Location</th><th>Required</th><th>Type</th><th>Description</th></tr></thead><tbody>${parameterTable}</tbody></table>`,
    requestList && `<h2>Request body</h2><ul>${requestList}</ul>`,
    responseList && `<h2>Responses</h2><ul>${responseList}</ul>`,
  ].filter(Boolean).join('')

  return { html, plain }
}

async function copyDocumentation(document: OpenApiDocument, item: CollectedOperation): Promise<void> {
  const { html, plain } = endpointDocumentation(document, item)
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    })])
    return
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(plain)
    return
  }

  const textarea = globalThis.document.createElement('textarea')
  textarea.value = plain
  textarea.style.cssText = 'position:fixed;opacity:0'
  globalThis.document.body.append(textarea)
  textarea.select()
  const copied = globalThis.document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Clipboard access was denied.')
}

interface OperationProps {
  document: OpenApiDocument
  item: CollectedOperation
  copyResult?: CopyStatus
  onCopy: (item: CollectedOperation) => void
}

function Operation({ document, item, copyResult, onCopy }: OperationProps) {
  const parameters = [...item.pathParameters, ...(item.operation.parameters ?? [])]
  const content = item.operation.requestBody?.content
  const responses = Object.entries(item.operation.responses ?? {})

  return (
    <article className="operation" id={operationAnchor(item)}>
      <div className="operation-heading">
        <span className={`method method-${item.method}`}>{item.method}</span>
        <code>{item.path}</code>
        <button className="copy-button" type="button" onClick={() => onCopy(item)}>{copyResult === 'copied' ? 'Copied for Word' : 'Copy for Word'}</button>
      </div>
      {copyResult === 'failed' && <p className="copy-error" role="alert">Could not access the clipboard. Try again or copy the text manually.</p>}
      <h2>{item.operation.summary ?? item.operation.operationId ?? item.path}</h2>
      {item.operation.description && <p>{item.operation.description}</p>}
      {parameters.length > 0 && <section><h3>Parameters</h3><div className="table">{parameters.map((parameter) => {
        const resolved = resolveRef(document, parameter) ?? parameter
        return <div className="table-row" key={`${resolved.in}-${resolved.name}`}><div><strong>{resolved.name ?? 'Unnamed parameter'}</strong><small>{resolved.in ?? 'unknown'}{resolved.required ? ' · required' : ''}</small></div><code>{schemaLabel(document, resolved.schema)}</code><span>{resolved.description ?? '—'}</span></div>
      })}</div></section>}
      {content && <section><h3>Request body</h3>{Object.entries(content).map(([type, value]) => <div className="content-row" key={type}><code>{type}</code><span>{schemaLabel(document, value.schema)}</span></div>)}</section>}
      {responses.length > 0 && <section><h3>Responses</h3>{responses.map(([status, response]) => {
        const resolved = resolveRef(document, response) ?? response
        return <div className="content-row" key={status}><strong>{status}</strong><div><span>{resolved.description ?? 'No description'}</span>{Object.entries(resolved.content ?? {}).map(([type, value]) => <code className="response-schema" key={type}>{type}: {schemaLabel(document, value.schema)}</code>)}</div></div>
      })}</section>}
    </article>
  )
}

function App() {
  const [documents, setDocuments] = useState<GeneratedDocument[]>([])
  const [selectedName, setSelectedName] = useState('')
  const [error, setError] = useState('')
  const [copyResult, setCopyResult] = useState<Record<string, CopyStatus>>({})

  useEffect(() => {
    fetch('/openapi/index.json')
      .then((response) => {
        if (!response.ok) throw new Error('Generated OpenAPI index was not found.')
        return response.json() as Promise<unknown>
      })
      .then((loaded) => {
        if (!Array.isArray(loaded) || !loaded.every(isGeneratedDocument)) throw new Error('Generated OpenAPI index is invalid.')
        setDocuments(loaded)
        setSelectedName(loaded[0]?.name ?? '')
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Documentation could not load.'))
  }, [])

  const selected = documents.find(({ name }) => name === selectedName)
  const operations = useMemo(() => selected ? collectOperations(selected.document) : [], [selected])
  const projectGroups = useMemo(() => documents.reduce<Record<string, GeneratedDocument[]>>((groups, document) => {
    groups[document.project] ??= []
    groups[document.project].push(document)
    return groups
  }, {}), [documents])
  if (error) return <main className="empty-state"><h1>Documentation could not load</h1><p>{error}</p></main>
  if (!selected) return <main className="empty-state"><p className="eyebrow">OpenAPI documentation</p><h1>No schemas yet</h1><p>Add a <code>.json</code>, <code>.yaml</code>, or <code>.yml</code> file to <code>openapi/</code>, then restart the dev server.</p></main>

  const info = selected.document.info ?? {}
  const copyEndpoint = async (item: CollectedOperation): Promise<void> => {
    const anchor = operationAnchor(item)
    try {
      await copyDocumentation(selected.document, item)
      setCopyResult({ [anchor]: 'copied' })
    } catch {
      setCopyResult({ [anchor]: 'failed' })
    }
  }
  const selectDocument = (event: ChangeEvent<HTMLSelectElement>): void => setSelectedName(event.target.value)

  return (
    <div className="app-shell">
      <header><a className="brand" href="/">API Docs</a><label><span className="sr-only">Select API</span><select value={selectedName} onChange={selectDocument}>{Object.entries(projectGroups).map(([project, projectDocuments]) => <optgroup key={project} label={project}>{projectDocuments.map(({ name, document }) => <option key={name} value={name}>{document.info?.title ?? name}</option>)}</optgroup>)}</select></label></header>
      <div className="layout">
        <aside><p className="sidebar-title">Endpoints</p><nav>{operations.map((item) => <a href={`#${operationAnchor(item)}`} key={`${item.method}-${item.path}`}><span className={`method method-${item.method}`}>{item.method}</span><span>{item.operation.summary ?? item.path}</span></a>)}</nav></aside>
        <main>
          <section className="intro"><p className="eyebrow">OpenAPI {selected.document.openapi ?? selected.document.swagger}</p><h1>{info.title ?? selected.name}</h1><p>{info.description ?? 'Interactive reference generated from your OpenAPI schema.'}</p>{info.version && <span className="version">v{info.version}</span>}</section>
          {operations.length ? operations.map((item) => <Operation document={selected.document} item={item} copyResult={copyResult[operationAnchor(item)]} key={`${item.method}-${item.path}`} onCopy={copyEndpoint} />) : <p>This schema does not define any paths.</p>}
        </main>
      </div>
    </div>
  )
}

export default App
