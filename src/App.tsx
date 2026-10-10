import type { ChangeEvent } from 'react';
import type { CopyStatus } from './components/Operation';
import type { CollectedOperation, GeneratedDocument } from './lib/openapi';
import { useEffect, useMemo, useState } from 'react';
import { Operation } from './components/Operation';
import { copyEndpointDocumentation } from './lib/clipboard';
import {
  collectOperations,
  endpointTitle,
  isGeneratedDocument,
  operationAnchor,
} from './lib/openapi';
import './App.css';

function App() {
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [error, setError] = useState('');
  const [copyResult, setCopyResult] = useState<Record<string, CopyStatus>>({});

  useEffect(() => {
    fetch('/openapi/index.json')
      .then((response) => {
        if (!response.ok)
          throw new Error('Generated OpenAPI index was not found.');
        return response.json() as Promise<unknown>;
      })
      .then((loaded) => {
        if (!Array.isArray(loaded) || !loaded.every(isGeneratedDocument))
          throw new Error('Generated OpenAPI index is invalid.');
        setDocuments(loaded);
        setSelectedName(loaded[0]?.name ?? '');
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Documentation could not load.'));
  }, []);

  const selected = documents.find(({ name }) => name === selectedName);
  const operations = useMemo(() => selected ? collectOperations(selected.document) : [], [selected]);
  const projectGroups = useMemo(() => documents.reduce<Record<string, GeneratedDocument[]>>((groups, document) => {
    groups[document.project] ??= [];
    groups[document.project].push(document);
    return groups;
  }, {}), [documents]);

  if (error) {
    return (
      <main className="empty-state">
        <h1>Documentation could not load</h1>
        <p>{error}</p>
      </main>
    );
  }
  if (!selected) {
    return (
      <main className="empty-state">
        <p className="eyebrow">OpenAPI documentation</p>
        <h1>No schemas yet</h1>
        <p>
          Add a
          <code>.json</code>
          ,
          <code>.yaml</code>
          , or
          <code>.yml</code>
          {' '}
          file to
          <code>openapi/</code>
          , then restart the dev server.
        </p>
      </main>
    );
  }

  const info = selected.document.info ?? {};
  const copyEndpoint = async (item: CollectedOperation): Promise<void> => {
    const anchor = operationAnchor(item);
    try {
      await copyEndpointDocumentation(selected.document, item);
      setCopyResult({ [anchor]: 'copied' });
    }
    catch {
      setCopyResult({ [anchor]: 'failed' });
    }
  };
  const selectDocument = (event: ChangeEvent<HTMLSelectElement>): void => setSelectedName(event.target.value);

  return (
    <div className="app-shell">
      <header>
        <a className="brand" href="/">API Docs</a>
        <label>
          <span className="sr-only">Select API</span>
          <select value={selectedName} onChange={selectDocument}>
            {Object.entries(projectGroups).map(([project, projectDocuments]) => (
              <optgroup key={project} label={project}>
                {projectDocuments.map(({ name, document }) => <option key={name} value={name}>{document.info?.title ?? name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      </header>
      <div className="layout">
        <aside>
          <p className="sidebar-title">Endpoints</p>
          <nav>
            {operations.map(item => (
              <a href={`#${operationAnchor(item)}`} key={`${item.method}-${item.path}`}>
                <span className={`method method-${item.method}`}>{item.method}</span>
                <span>{endpointTitle(item)}</span>
              </a>
            ))}
          </nav>
        </aside>
        <main>
          <section className="intro">
            <p className="eyebrow">
              OpenAPI
              {selected.document.openapi ?? selected.document.swagger}
            </p>
            <h1>{info.title ?? selected.name}</h1>
            <p>{info.description ?? 'Interactive reference generated from your OpenAPI schema.'}</p>
            {info.version && (
              <span className="version">
                v
                {info.version}
              </span>
            )}
          </section>
          {operations.length
            ? operations.map(item => <Operation document={selected.document} item={item} copyResult={copyResult[operationAnchor(item)]} key={`${item.method}-${item.path}`} onCopy={copyEndpoint} />)
            : <p>This schema does not define any paths.</p>}
        </main>
      </div>
    </div>
  );
}

export default App;
