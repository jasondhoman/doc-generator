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
  const requestBodies = Object.entries(item.operation.requestBody?.content ?? {})
    .map(([type, value]) => ({ type, schema: schemaLabel(document, value.schema) }));
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

function formatListValue(value: string | undefined): string {
  return value?.trim() ? value.trim() : '';
}

export function WordEndpointDocumentation({ document }: { document: EndpointDocumentation }) {
  const payload = formatListValue(document.requestBodies.map(body => `${body.type}: ${body.schema}`).join('; '));
  const headerParameters = document.parameters.filter(parameter => parameter.location.toLowerCase() === 'header');
  const payloadFromParameters = document.parameters
    .filter(parameter => ['query', 'path', 'cookie'].includes(parameter.location.toLowerCase()))
    .map(parameter => `${parameter.name} (${parameter.type})`)
    .join(', ');
  const requestHeaders = formatListValue(headerParameters.map(parameter => `${parameter.name} (${parameter.type})`).join(', '));
  const requestBody = formatListValue(document.requestBodies.map(body => `${body.type}: ${body.schema}`).join('; '));
  const responseContentType = formatListValue(document.responses.flatMap(response => response.schemas.map(schema => schema.type)).join(', '));
  const response = formatListValue(document.responses.map(({ status, description, schemas }) => `${status}: ${description}${schemas.length ? ` (${schemas.map(({ type, schema, example }) => `${type}: ${schema}${example === undefined ? '' : ` = ${JSON.stringify(example)}`}`).join(', ')})` : ''}`).join('; '));

  const rows = [
    { label: 'Endpoint Path', value: document.endpoint.replace(/^[A-Z]+\s+/, '') },
    { label: 'HTTP Method', value: document.endpoint.split(' ')[0] },
    { label: 'Payload', value: payload || payloadFromParameters },
    { label: 'Request Header', value: requestHeaders },
    { label: 'Request Body', value: requestBody },
    { label: 'Response Content Type', value: responseContentType },
    { label: 'Response', value: response },
  ];

  return (
    <div>
      <p>{document.description}</p>
      <ul>
        {rows.map(row => (
          <li key={row.label}>
            <strong>{row.label}:</strong>
            {' '}
            {row.value}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function renderEndpointDocumentation(document: OpenApiDocument, item: CollectedOperation): { html: string; plain: string } {
  const endpointDocument = buildEndpointDocumentation(document, item);
  const payload = formatListValue(endpointDocument.requestBodies.map(body => `${body.type}: ${body.schema}`).join('; '));
  const payloadFromParameters = formatListValue(endpointDocument.parameters
    .filter(parameter => ['query', 'path', 'cookie'].includes(parameter.location.toLowerCase()))
    .map(parameter => `${parameter.name} (${parameter.type})`)
    .join(', '));
  const requestHeaders = formatListValue(endpointDocument.parameters
    .filter(parameter => parameter.location.toLowerCase() === 'header')
    .map(parameter => `${parameter.name} (${parameter.type})`)
    .join(', '));
  const requestBody = formatListValue(endpointDocument.requestBodies.map(body => `${body.type}: ${body.schema}`).join('; '));
  const responseContentType = formatListValue(endpointDocument.responses.flatMap(response => response.schemas.map(schema => schema.type)).join(', '));
  const response = formatListValue(endpointDocument.responses.map(({ status, description, schemas }) => `${status}: ${description}${schemas.length ? ` (${schemas.map(({ type, schema, example }) => `${type}: ${schema}${example === undefined ? '' : ` = ${JSON.stringify(example)}`}`).join(', ')})` : ''}`).join('; '));

  const lines = [
    endpointDocument.description,
    '',
    `* Endpoint Path: ${endpointDocument.endpoint.replace(/^[A-Z]+\s+/, '')}`,
    `* HTTP Method: ${endpointDocument.endpoint.split(' ')[0]}`,
    `* Payload: ${payload || payloadFromParameters}`,
    `* Request Header: ${requestHeaders}`,
    `* Request Body: ${requestBody}`,
    `* Response Content Type: ${responseContentType}`,
    `* Response: ${response}`,
  ].filter((line, index, list) => index !== 1 || list[index - 1] !== '');

  const plain = lines.join('\n');

  return {
    html: renderToStaticMarkup(<WordEndpointDocumentation document={endpointDocument} />),
    plain,
  };
}
