import type { CollectedOperation, OpenApiDocument } from '../lib/openapi';
import {

  endpointDescription,
  endpointTitle,

  operationAnchor,
  resolveRef,
  responseExample,
  schemaLabel,
  schemaProperties,
} from '../lib/openapi';

export type CopyStatus = 'copied' | 'failed';

type OperationProps = {
  document: OpenApiDocument;
  item: CollectedOperation;
  copyResult?: CopyStatus;
  onCopy: (item: CollectedOperation) => void;
};

export function Operation({ document, item, copyResult, onCopy }: OperationProps) {
  const parameters = [...item.pathParameters, ...(item.operation.parameters ?? [])];
  const content = item.operation.requestBody?.content;
  const responses = Object.entries(item.operation.responses ?? {});

  return (
    <article className="operation" id={operationAnchor(item)}>
      <div className="operation-heading">
        <span className={`method method-${item.method}`}>{item.method}</span>
        <code>{item.path}</code>
        <button className="copy-button" type="button" onClick={() => onCopy(item)}>{copyResult === 'copied' ? 'Copied for Word' : 'Copy for Word'}</button>
      </div>
      {copyResult === 'failed' && <p className="copy-error" role="alert">Could not access the clipboard. Try again or copy the text manually.</p>}
      <h2>{endpointTitle(item)}</h2>
      <p>{endpointDescription(item)}</p>
      {parameters.length > 0 && (
        <section>
          <h3>Parameters</h3>
          <div className="table">
            {parameters.map((parameter) => {
              const resolved = resolveRef(document, parameter) ?? parameter;
              return (
                <div className="table-row" key={`${resolved.in}-${resolved.name}`}>
                  <div>
                    <strong>{resolved.name ?? 'Unnamed parameter'}</strong>
                    <small>
                      {resolved.in ?? 'unknown'}
                      {resolved.required ? ' · required' : ''}
                    </small>
                  </div>
                  <code>{schemaLabel(document, resolved.schema)}</code>
                  <span>{resolved.description ?? '—'}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {content && (
        <section>
          <h3>Request body</h3>
          {Object.entries(content).map(([type, value]) => {
            const properties = schemaProperties(document, value.schema);
            return (
              <div key={type}>
                <div className="content-row">
                  <code>{type}</code>
                  <span>{schemaLabel(document, value.schema)}</span>
                </div>
                {properties.length > 0 && (
                  <div className="table request-properties">
                    {properties.map(property => (
                      <div className="table-row" key={property.name}>
                        <div>
                          <strong>{property.name}</strong>
                          <small>{property.required ? 'required' : 'optional'}</small>
                        </div>
                        <code>{property.type}</code>
                        <span>{property.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
      {responses.length > 0 && (
        <section>
          <h3>Responses</h3>
          <div className="table">
            {responses.map(([status, response]) => {
              const resolved = resolveRef(document, response) ?? response;
              const schemas = Object.entries(resolved.content ?? {});
              const examples = schemas.flatMap(([type, value]) => {
                const example = responseExample(document, value);
                return example === undefined ? [] : [{ type, example }];
              });
              return (
                <div className="table-row" key={status}>
                  <div><strong>{status}</strong></div>
                  <code>{schemas.length ? schemas.map(([type, value]) => `${type}: ${schemaLabel(document, value.schema)}`).join(', ') : 'No schema'}</code>
                  <div>
                    <span>{resolved.description ?? 'No description'}</span>
                    {examples.map(({ type, example }) => (
                      <pre className="response-example" key={type}>{JSON.stringify(example, null, 2)}</pre>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </article>
  );
}
