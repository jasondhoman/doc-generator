import type { CollectedOperation, OpenApiDocument } from '../lib/openapi';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import {

  endpointDescription,
  endpointTitle,

  resolveRef,
  responseExample,
  schemaLabel,
} from '../lib/openapi';

type ParameterRow = {
  name: string;
  location: string;
  required: string;
  type: string;
  description: string;
};
type SchemaRow = { type: string; schema: string; example?: unknown };
type ResponseRow = { status: string; description: string; schemas: SchemaRow[] };
export type EndpointDocumentation = {
  title: string;
  endpoint: string;
  description: string;
  parameters: ParameterRow[];
  requestBodies: SchemaRow[];
  responses: ResponseRow[];
};

export function buildEndpointDocumentation(document: OpenApiDocument, item: CollectedOperation): EndpointDocumentation {
  const parameters = [...item.pathParameters, ...(item.operation.parameters ?? [])].map((parameter) => {
    const resolved = resolveRef(document, parameter) ?? parameter;
    return {
      name: resolved.name ?? 'Unnamed parameter',
      location: resolved.in ?? 'unknown',
      required: resolved.required ? 'Required' : 'Optional',
      type: schemaLabel(document, resolved.schema),
      description: resolved.description ?? '—',
    };
  });
  const requestBodies = Object.entries((resolveRef(document, item.operation.requestBody) ?? item.operation.requestBody)?.content ?? {})
    .map(([type, value]) => ({ type, schema: schemaLabel(document, value.schema), example: responseExample(document, value) }));
  const responses = Object.entries(item.operation.responses ?? {}).map(([status, response]) => {
    const resolved = resolveRef(document, response) ?? response;
    return {
      status,
      description: resolved.description ?? 'No description',
      schemas: Object.entries(resolved.content ?? {})
        .map(([type, value]) => ({ type, schema: schemaLabel(document, value.schema), example: responseExample(document, value) })),
    };
  });

  return {
    title: endpointTitle(item),
    endpoint: `${item.method.toUpperCase()} ${item.path}`,
    description: endpointDescription(item),
    parameters,
    requestBodies,
    responses,
  };
}

function jsonObject(entries: Array<[string, string]>): string {
  if (entries.length === 0)
    return '{}';

  return JSON.stringify(Object.fromEntries(entries), null, 2);
}

function requestBodyExample(bodies: SchemaRow[]): string {
  const example = bodies.find(body => body.example !== undefined)?.example;
  return example === undefined ? '{}' : JSON.stringify(example, null, 2);
}

export function WordEndpointDocumentation({ document }: { document: EndpointDocumentation }) {
  const requestBody = requestBodyExample(document.requestBodies);
  const payload = requestBody === '{}'
    ? jsonObject(document.parameters
        .filter(parameter => ['query', 'path', 'cookie'].includes(parameter.location.toLowerCase()))
        .map(parameter => [parameter.name, parameter.type]))
    : requestBody;
  const requestHeaders = jsonObject(document.parameters
    .filter(parameter => parameter.location.toLowerCase() === 'header')
    .map(parameter => [parameter.name, parameter.type]));
  const rows = [
    { label: 'Endpoint Path', value: document.endpoint.replace(/^[A-Z]+\s+/, '') },
    { label: 'HTTP Method', value: document.endpoint.split(' ')[0] },
    { label: 'Payload', value: payload },
    { label: 'Request Header', value: requestHeaders },
    { label: 'Request Body', value: requestBody },
  ];

  return (
    <div>
      <p>{document.description}</p>
      <ul>
        {rows.map(row => (
          <li key={row.label}>
            <strong>
              {row.label}
            </strong>
            :
            {['Payload', 'Request Body'].includes(row.label)
              ? (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {row.value}
                  </pre>
                )
              : (
                  <>
                    {' '}
                    {row.value}
                  </>
                )}
          </li>
        ))}
      </ul>
      <strong>Response:</strong>
      {document.responses.map(response => (
        <div key={response.status}>
          <p>{response.status}</p>
          {response.schemas.map((schema, index) => (
            schema.example === undefined
              ? null
              : <pre key={`${schema.type}-${index}`}>{JSON.stringify(schema.example, null, 2)}</pre>
          ))}
        </div>
      ))}
    </div>
  );
}

export function renderEndpointDocumentation(document: OpenApiDocument, item: CollectedOperation): { html: string; plain: string } {
  const endpointDocument = buildEndpointDocumentation(document, item);
  const requestBody = requestBodyExample(endpointDocument.requestBodies);
  const payload = requestBody === '{}'
    ? jsonObject(endpointDocument.parameters
        .filter(parameter => ['query', 'path', 'cookie'].includes(parameter.location.toLowerCase()))
        .map(parameter => [parameter.name, parameter.type]))
    : requestBody;
  const requestHeaders = jsonObject(endpointDocument.parameters
    .filter(parameter => parameter.location.toLowerCase() === 'header')
    .map(parameter => [parameter.name, parameter.type]));
  const responseEntries = endpointDocument.responses.map((response) => {
    const examples = response.schemas
      .filter(schema => schema.example !== undefined)
      .map(schema => JSON.stringify(schema.example, null, 2));
    return `${response.status}${examples.length ? `\n${examples.join('\n')}` : ''}`;
  });

  const lines = [
    endpointDocument.description,
    '',
    `• Endpoint Path: ${endpointDocument.endpoint.replace(/^[A-Z]+\s+/, '')}`,
    `• HTTP Method: ${endpointDocument.endpoint.split(' ')[0]}`,
    `• Payload: ${payload}`,
    `• Request Header: ${requestHeaders}`,
    `• Request Body: ${requestBody}`,
    `• Response:\n${responseEntries.map(entry => `  - ${entry}`).join('\n')}`,
  ].filter((line, index, list) => index !== 1 || list[index - 1] !== '');

  const plain = lines.join('\n');

  return {
    html: renderToStaticMarkup(<WordEndpointDocumentation document={endpointDocument} />),
    plain,
  };
}
