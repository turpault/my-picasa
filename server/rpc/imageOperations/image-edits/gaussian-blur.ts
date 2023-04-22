export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function gaussianBlur(buffer: Buffer, width: number, height: number, channels: number, radius: number, region: Region): Buffer {
  const diameter = radius * 2 + 1;
  const radiusSquared = radius * radius;
  const kernel: number[] = [];

  // Calculate kernel
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) {
      const weight = Math.exp(-(i * i + j * j) / (2 * radiusSquared));
      kernel.push(weight);
      sum += weight;
    }
  }

  // Normalize kernel
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= sum;
  }

  const blurredPixels = Buffer.alloc(buffer.length);

  // Iterate over the pixels within the region
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const pixelIndex = (y * width + x) * channels;
      const pixel = new Array(channels).fill(0);

      // Convolve kernel with pixel neighborhood
      for (let i = -radius; i <= radius; i++) {
        const pixelY = Math.min(Math.max(y + i, 0), height - 1);
        for (let j = -radius; j <= radius; j++) {
          const pixelX = Math.min(Math.max(x + j, 0), width - 1);
          const kernelIndex = (i + radius) * diameter + j + radius;
          const weight = kernel[kernelIndex];
          const neighborhoodPixelIndex = (pixelY * width + pixelX) * channels;
          for (let c = 0; c < channels; c++) {
            pixel[c] += buffer[neighborhoodPixelIndex + c] * weight;
          }
        }
      }

      for (let c = 0; c < channels; c++) {
        blurredPixels[pixelIndex + c] = pixel[c];
      }
    }
  }

  return blurredPixels;
}
