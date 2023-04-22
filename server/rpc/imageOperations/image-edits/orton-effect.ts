export function applyOrtonEffect(buffer: ArrayBuffer, width: number, height: number, blurAmount: number, brightness: number): ArrayBuffer {
  // Create a Uint8ClampedArray view of the buffer
  const data = new Uint8ClampedArray(buffer);

  // Create a copy of the original image data to preserve it
  const originalData = new Uint8ClampedArray(data);

  // Apply a Gaussian blur to the original image data
  const blurredData = applyGaussianBlur(originalData, width, height, blurAmount);

  // Blend the blurred data with the original data using the specified brightness value
  for (let i = 0; i < data.length; i += 4) {
    const r = originalData[i] * brightness + blurredData[i] * (1 - brightness);
    const g = originalData[i + 1] * brightness + blurredData[i + 1] * (1 - brightness);
    const b = originalData[i + 2] * brightness + blurredData[i + 2] * (1 - brightness);
    const a = originalData[i + 3];

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }

  // Return the updated buffer
  return buffer;
}

function applyGaussianBlur(data: Uint8ClampedArray, width: number, height: number, blurAmount: number): Uint8ClampedArray {
  const blurRadius = Math.round(blurAmount);
  const kernelSize = blurRadius * 2 + 1;
  const kernel = createGaussianKernel(blurRadius, kernelSize);
  const blurredData = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let j = -blurRadius; j <= blurRadius; j++) {
        for (let i = -blurRadius; i <= blurRadius; i++) {
          const pixelIndex = (y + j) * width + (x + i);
          const kernelIndex = (j + blurRadius) * kernelSize + (i + blurRadius);
          if (pixelIndex >= 0 && pixelIndex < data.length) {
            r += data[pixelIndex * 4] * kernel[kernelIndex];
            g += data[pixelIndex * 4 + 1] * kernel[kernelIndex];
            b += data[pixelIndex * 4 + 2] * kernel[kernelIndex];
            a += data[pixelIndex * 4 + 3] * kernel[kernelIndex];
          }
        }
      }

      const pixelIndex = y * width + x;
      blurredData[pixelIndex * 4] = Math.round(r);
      blurredData[pixelIndex * 4 + 1] = Math.round(g);
      blurredData[pixelIndex * 4 + 2] = Math.round(b);
      blurredData[pixelIndex * 4 + 3] = Math.round(a);
    }
  }

  return blurredData;
}

function createGaussianKernel(radius: number, size: number): number[] {
  const kernel = new Array<number>(size * size);
  const sigma = radius / 3;

  let sum = 0;
  for (let j = -radius; j <= radius; j++) {
  for (let i = -radius; i <= radius; i++) {
  const index = (j + radius) * size + (i + radius);
  const value = Math.exp(-(i * i + j * j) / (2 * sigma * sigma));
  kernel[index] = value;
  sum += value;
  }
  }
  
  // Normalize the kernel so that its values sum up to 1
  for (let i = 0; i < kernel.length; i++) {
  kernel[i] /= sum;
  }
  
  return kernel;
  }