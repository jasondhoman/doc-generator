import type { CollectedOperation, OpenApiDocument } from './openapi';
import { renderEndpointDocumentation } from '../components/WordEndpointDocumentation';

export async function copyEndpointDocumentation(document: OpenApiDocument, item: CollectedOperation): Promise<void> {
  const { html, plain } = renderEndpointDocumentation(document, item);
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    })]);
    return;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(plain);
    return;
  }

  const textarea = globalThis.document.createElement('textarea');
  textarea.value = plain;
  textarea.style.cssText = 'position:fixed;opacity:0';
  globalThis.document.body.append(textarea);
  textarea.select();
  const copied = globalThis.document.execCommand('copy');
  textarea.remove();
  if (!copied)
    throw new Error('Clipboard access was denied.');
}
