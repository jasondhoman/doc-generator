export const methodOrder = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
export type HttpMethod = typeof methodOrder[number];

export type Reference = { $ref?: string };
export type SchemaObject = {
  type?: string;
  format?: string;
  enum?: Array<string | number | boolean | null>;
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
  example?: unknown;
} & Reference;
export type MediaTypeObject = {
  schema?: SchemaObject;
  example?: unknown;
  examples?: Record<string, { value?: unknown }>;
};
export type ParameterObject = {
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
} & Reference;
export type RequestBodyObject = { content?: Record<string, MediaTypeObject> };
export type ResponseObject = {
  description?: string;
  content?: Record<string, MediaTypeObject>;
} & Reference;
export type OperationObject = {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses?: Record<string, ResponseObject>;
};
export type PathItem = Partial<Record<HttpMethod, OperationObject>> & {
  summary?: string;
  description?: string;
  parameters?: ParameterObject[];
};
export type OpenApiDocument = {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string; description?: string };
  paths?: Record<string, PathItem>;
} & Record<string, unknown>;
export type GeneratedDocument = { name: string; project: string; document: OpenApiDocument };
export type CollectedOperation = {
  path: string;
  method: HttpMethod;
  operation: OperationObject;
  pathParameters: ParameterObject[];
  pathSummary?: string;
  pathDescription?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOpenApiDocument(value: unknown): value is OpenApiDocument {
  return isRecord(value) && (typeof value.openapi === 'string' || typeof value.swagger === 'string');
}

export function isGeneratedDocument(value: unknown): value is GeneratedDocument {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.project === 'string'
    && isOpenApiDocument(value.document);
}

export function resolveRef<T extends Reference>(document: OpenApiDocument, value: T | undefined): T | undefined {
  if (!value?.$ref?.startsWith('#/'))
    return value;

  return value.$ref
    .slice(2)
    .split('/')
    .reduce<unknown>((current, key) => isRecord(current) ? current[key] : undefined, document) as T | undefined;
}

export function schemaLabel(document: OpenApiDocument, schema: SchemaObject | undefined): string {
  if (schema?.$ref?.startsWith('#/components/schemas/'))
    return schema.$ref.split('/').at(-1) ?? 'object';

  const resolved = resolveRef(document, schema);
  if (!resolved)
    return 'Not defined';
  if (resolved.type === 'array')
    return `Array<${schemaLabel(document, resolved.items)}>`;
  if (resolved.enum)
    return resolved.enum.map(value => typeof value === 'string' ? `'${value}'` : String(value)).join(' | ');
  if (resolved.type === 'integer' || resolved.type === 'number')
    return 'number';
  return resolved.type ?? 'object';
}

function schemaExample(document: OpenApiDocument, schema: SchemaObject | undefined, references = new Set<string>()): unknown {
  if (!schema)
    return undefined;
  if (schema.example !== undefined)
    return schema.example;
  if (schema.$ref) {
    if (references.has(schema.$ref))
      return undefined;
    const resolved = resolveRef(document, schema);
    return schemaExample(document, resolved, new Set([...references, schema.$ref]));
  }
  if (schema.enum?.length)
    return schema.enum[0];
  if (schema.type === 'array') {
    const item = schemaExample(document, schema.items, references);
    return item === undefined ? [] : [item];
  }
  if (schema.type === 'object' || schema.properties) {
    return Object.fromEntries(Object.entries(schema.properties ?? {})
      .flatMap(([name, property]) => {
        const value = schemaExample(document, property, references);
        return value === undefined ? [] : [[name, value]];
      }));
  }
  if (schema.type === 'boolean')
    return true;
  if (schema.type === 'integer' || schema.type === 'number')
    return 0;
  if (schema.type === 'string')
    return 'string';
  return undefined;
}

export function responseExample(document: OpenApiDocument, mediaType: MediaTypeObject): unknown {
  if (mediaType.example !== undefined)
    return mediaType.example;

  const namedExample = Object.values(mediaType.examples ?? {})
    .find(example => example.value !== undefined)
    ?.value;
  return namedExample ?? schemaExample(document, mediaType.schema);
}

export function collectOperations(document: OpenApiDocument): CollectedOperation[] {
  return Object.entries(document.paths ?? {}).flatMap(([path, pathItem]) =>
    methodOrder.flatMap((method) => {
      const operation = pathItem[method];
      return operation
        ? [{
            path,
            method,
            operation,
            pathParameters: pathItem.parameters ?? [],
            pathSummary: pathItem.summary,
            pathDescription: pathItem.description,
          }]
        : [];
    }),
  );
}

export function operationAnchor(item: CollectedOperation): string {
  return item.operation.operationId ?? `${item.method}-${item.path.replaceAll(/[^a-z0-9]+/gi, '-')}`;
}

export function endpointTitle(item: CollectedOperation): string {
  return item.operation.summary ?? item.pathSummary ?? item.operation.operationId ?? item.path;
}

export function endpointDescription(item: CollectedOperation): string {
  return item.operation.description ?? item.pathDescription ?? 'No description provided.';
}
