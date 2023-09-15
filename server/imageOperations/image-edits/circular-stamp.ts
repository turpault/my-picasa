export interface Point {
  x: number;
  y: number;
}

export function copyCircularPortionInPlace(buffer: Buffer, width: number, height: number, channels: number, center: Point, radius: number, destinationCenter: Point) {
  const radiusSquared = radius * radius;

  const xMin = Math.max(0, Math.floor(center.x - radius));
  const xMax = Math.min(width, Math.ceil(center.x + radius));
  const yMin = Math.max(0, Math.floor(center.y - radius));
  const yMax = Math.min(height, Math.ceil(center.y + radius));

  for (let y = yMin; y < yMax; y++) {
    const dy = y - center.y;
    const sourceY = y * width;
    const destinationY = (y - destinationCenter.y) * width;
    for (let x = xMin; x < xMax; x++) {
      const dx = x - center.x;
      if (dx * dx + dy * dy > radiusSquared) {
        continue;
      }
      const sourceIndex = (sourceY + x) * channels;
      const destinationIndex = (destinationY + (x - destinationCenter.x)) * channels;
      for (let c = 0; c < channels; c++) {
        buffer.writeUInt32BE(buffer.readUInt32BE(sourceIndex + c), destinationIndex + c);
      }
    }
  }
}
