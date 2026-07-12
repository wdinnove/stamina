import DOMPurify from 'dompurify';

/** HTML riche (Tiptap) nettoyé avant `dangerouslySetInnerHTML` — retire scripts/handlers/attributs dangereux */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html);
}
