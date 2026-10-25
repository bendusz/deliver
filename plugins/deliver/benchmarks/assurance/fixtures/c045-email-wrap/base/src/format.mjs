// Plain-text formatting for outgoing emails.
export function indent(text, prefix) {
  return text.split('\n').map((line) => prefix + line).join('\n');
}
