// Thumbnail rendering for the media library.
export function thumbKey(assetId, width) {
  return `${assetId}@${width}`;
}
