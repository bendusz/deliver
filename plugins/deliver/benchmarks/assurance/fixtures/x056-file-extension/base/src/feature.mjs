export function extension(name) {
  const dot = name.indexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : '';
}
