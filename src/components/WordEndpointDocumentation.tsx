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

export function WordEndpointDocumentation({ document }: { document: EndpointDocumentation }) {
  return (
    <>
      <h1>{document.title}</h1>
      <p><strong>{document.endpoint}</strong></p>
      <p>{document.description}</p>
      {document.parameters.length > 0 && (
        <>
          <h2>Parameters</h2>
          <table border={1} cellPadding={6} cellSpacing={0}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Location</th>
                <th>Required</th>
                <th>Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {document.parameters.map(parameter => (
                <tr key={`${parameter.location}-${parameter.name}`}>
                  <td>{parameter.name}</td>
                  <td>{parameter.location}</td>
                  <td>{parameter.required}</td>
                  <td>{parameter.type}</td>
                  <td>{parameter.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {document.requestBodies.length > 0 && (
        <>
          <h2>Request body</h2>
          <ul>
            {document.requestBodies.map(body => (
              <li key={body.type}>
                <strong>{body.type}</strong>
                :
                {' '}
                {body.schema}
              </li>
            ))}
          </ul>
        </>
      )}
      {document.responses.length > 0 && (
        <>
          <h2>Responses</h2>
          <ul>
            {document.responses.map(response => (
              <li key={response.status}>
                <strong>{response.status}</strong>
                :
                {response.description}
                {response.schemas.length > 0 && (
                  <ul>
                    {response.schemas.map(schema => (
                      <li key={schema.type}>
                        <strong>{schema.type}</strong>
                        :
                        {' '}
                        {schema.schema}
                        {schema.example !== undefined && <pre>{JSON.stringify(schema.example, null, 2)}</pre>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export function renderEndpointDocumentation(document: OpenApiDocument, item: CollectedOperation): { html: string; plain: string } {
  const endpointDocument = buildEndpointDocumentation(document, item);
  const plain = [
    endpointDocument.title,
    endpointDocument.endpoint,
    endpointDocument.description,
    endpointDocument.parameters.length && `Parameters\n${endpointDocument.parameters.map(({ name, location, required, type, description }) => `• ${name} (${location}, ${required}; ${type}): ${description}`).join('\n')}`,
    endpointDocument.requestBodies.length && `Request body\n${endpointDocument.requestBodies.map(({ type, schema }) => `• ${type}: ${schema}`).join('\n')}`,
    endpointDocument.responses.length && `Responses\n${endpointDocument.responses.map(({ status, description, schemas }) => `• ${status}: ${description}${schemas.length ? ` (${schemas.map(({ type, schema, example }) => `${type}: ${schema}${example === undefined ? '' : ` = ${JSON.stringify(example)}`}`).join(', ')})` : ''}`).join('\n')}`,
  ].filter(Boolean).join('\n\n');

  return {
    html: renderToStaticMarkup(<WordEndpointDocumentation document={endpointDocument} />),
    plain,
  };
}
