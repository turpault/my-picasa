import { Kernel } from "sharp";
import { range } from "../../../shared/lib/utils";

const defaultKernel = {
  width: 3,
  height: 3,
  kernel: [0, 0, 0, 0, 1, 0, 0, 0, 0],
};

export const convolutionKernels: { [name: string]: Kernel } = {
  ...Object.fromEntries(
    range(2, 10).map((i) => [
      `GAUSSIAN_BLUR_${i}`,
      {
        ...defaultKernel,
        kernel: [1.0, 2.0, 1.0, 2.0, i, 2.0, 1.0, 2.0, 1.0],
        scale: 12 + i,
      },
    ])
  ),
  MOTION_BLUR_RIGHT: {
    ...defaultKernel,
    kernel: [0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0],
  },
  MOTION_BLUR_LEFT: {
    ...defaultKernel,
    kernel: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0],
  },
  MOTION_BLUR: {
    ...defaultKernel,
    kernel: [0.3333, 0.0, 0.0, 0.0, 0.3333, 0.0, 0.0, 0.0, 0.3333],
  },
  SMOOTH_1: {
    ...defaultKernel,
    kernel: [1.0, 1.0, 1.0, 1.0, 5.0, 1.0, 1.0, 1.0, 1.0],
    scale: 13,
  },
  SMOOTH_2: {
    ...defaultKernel,
    kernel: [1.0, 1.0, 1.0, 1.0, 4.0, 1.0, 1.0, 1.0, 1.0],
    scale: 12,
  },
  SMOOTH_3: {
    ...defaultKernel,
    kernel: [1.0, 1.0, 1.0, 1.0, 3.0, 1.0, 1.0, 1.0, 1.0],
    scale: 11,
  },
  SMOOTH_4: {
    ...defaultKernel,
    kernel: [1.0, 1.0, 1.0, 1.0, 2.0, 1.0, 1.0, 1.0, 1.0],
    scale: 10,
  },
  MEAN_SMOOTH: {
    ...defaultKernel,
    kernel: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    scale: 9,
  },
  SHARPEN_1: {
    ...defaultKernel,
    kernel: [0.0, -0.125, 0.0, -0.125, 1.5, -0.125, 0.0, -0.125, 0.0],
  },
  SHARPEN_2: {
    ...defaultKernel,
    kernel: [0.0, -0.25, 0.0, -0.25, 2.0, -0.25, 0.0, -0.25, 0.0],
  },
  SHARPEN_3: {
    ...defaultKernel,
    kernel: [0.0, -0.375, 0.0, -0.375, 2.5, -0.375, 0.0, -0.375, 0.0],
  },
  SHARPEN_4: {
    ...defaultKernel,
    kernel: [0.0, -0.5, 0.0, -0.5, 3.0, -0.5, 0.0, -0.5, 0.0],
  },
  EXTRUDE: {
    ...defaultKernel,
    kernel: [1.0, 1.0, 1.0, 1.0, -7.0, 1.0, 1.0, 1.0, 1.0],
  },
  EMBOSS_V1: {
    ...defaultKernel,
    kernel: [-1.0, -1.0, 0.0, -1.0, 0.0, 1.0, 0.0, 1.0, 1.0],
    scale: 9,
    offset: 128,
  },
  EMBOSS_V2: {
    ...defaultKernel,
    kernel: [0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
    scale: 9,
    offset: 128,
  },
  EMBOSS_V3: {
    ...defaultKernel,
    kernel: [1.0, 1.0, 0.0, 1.0, 0.0, -1.0, 0.0, -1.0, -1.0],
    scale: 9,
    offset: 128,
  },
  EMBOSS_V4: {
    ...defaultKernel,
    kernel: [-2.0, -1.0, 0.0, -1.0, 1.0, 1.0, 0.0, 1.0, 2.0],
    scale: 9,
    offset: 128,
  },
  EMBOSS_V5: {
    ...defaultKernel,
    kernel: [-3.0, -2.0, -1.0, -2.0, 2.0, 2.0, 0.1, 2.0, 3.0],
    scale: 9,
    offset: 128,
  },
  RAISED: {
    ...defaultKernel,
    kernel: [0.0, 0.0, 1.0, 0.0, 2.0, 0.0, -2.0, 0.0, 0.0],
  },
  EDGE_DETECT_HV: {
    ...defaultKernel,
    kernel: [0.0, 1.0, 0.0, 1.0, -4.0, 1.0, 0.0, 1.0, 0.0],
  },
  EDGE_DETECT_H: {
    ...defaultKernel,
    kernel: [0.0, -1.0, 0.0, 0.0, 2.0, 0.0, 0.0, -1.0, 0.0],
  },
  EDGE_DETECT_V: {
    ...defaultKernel,
    kernel: [0.0, 0.0, 0.0, -1.0, 2.0, -1.0, 0.0, 0.0, 0.0],
  },
  EDGE_DETECT_DIFFERENTIAL: {
    ...defaultKernel,
    kernel: [-0.25, 0.0, 0.25, 0.0, 0.0, 0.0, 0.25, 0.0, -0.25],
  },
  EDGE_ENHANCE_H: {
    ...defaultKernel,
    kernel: [0.0, -1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0],
  },
  EDGE_ENHANCE_V: {
    ...defaultKernel,
    kernel: [0.0, 0.0, 0.0, -1.0, 1.0, 0.0, 0.0, 0.0, 0.0],
  },
  PREWITT_H: {
    ...defaultKernel,
    kernel: [1.0, 1.0, 1.0, 0.0, 0.0, 0.0, -1.0, -1.0, -1.0],
  },
  PREWITT_V: {
    ...defaultKernel,
    kernel: [1.0, 0.0, -1.0, 1.0, 0.0, -1.0, 1.0, 0.0, -1.0],
  },
  SOBEL_H: {
    ...defaultKernel,
    kernel: [-1.0, -2.0, -1.0, 0.0, 0.0, 0.0, 1.0, 2.0, 1.0],
  },
  SOBEL_V: {
    ...defaultKernel,
    kernel: [1.0, 0.0, -1.0, 2.0, 0.0, -2.0, 1.0, 0.0, -1.0],
  },
  SOBEL_FELDMAN_H: {
    ...defaultKernel,
    kernel: [3.0, 10.0, 3.0, 0.0, 0.0, 0.0, -3.0, -10.0, -3.0],
  },
  SOBEL_FELDMAN_V: {
    ...defaultKernel,
    kernel: [3.0, 0.0, -3.0, 10.0, 0.0, -10.0, 3.0, 0.0, -3.0],
  },
  LAPLACE: {
    ...defaultKernel,
    kernel: [0.0, 1.0, 0.0, 1.0, -4.0, 1.0, 0.0, 1.0, 0.0],
  },
  LAPLACE_INV: {
    ...defaultKernel,
    kernel: [0.0, -1.0, 0.0, -1.0, 4.0, -1.0, 0.0, -1.0, 0.0],
  },
  LAPLACE_DIAGONAL: {
    ...defaultKernel,
    kernel: [0.25, 0.5, 0.25, 0.5, -3.0, 0.5, 0.25, 0.5, 0.25],
  },
  SCHARR_H: {
    ...defaultKernel,
    kernel: [3.0, 0.0, -3.0, 10.0, 0.0, -10.0, 3.0, 0.0, -3.0],
  },
  SCHARR_V: {
    ...defaultKernel,
    kernel: [-3.0, 0.0, 3.0, -10.0, 0.0, 10.0, 3.0, 0.0, -3.0],
  },
  EDGE_360_KEYA: {
    ...defaultKernel,
    kernel: [-1.0, -1.0, -1.0, -1.0, 8.0, -1.0, -1.0, -1.0, -1.0],
  },
  GRADIENT_DETECT_V: {
    ...defaultKernel,
    kernel: [-1.0, 0.0, 1.0, -1.0, 0.0, 1.0, -1.0, 0.0, 1.0],
  },
  GRADIENT_DETECT_H: {
    ...defaultKernel,
    kernel: [-1.0, -1.0, -1.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0],
  },
  BRIGHTEN: {
    ...defaultKernel,
    kernel: [0.0, 0.0, 0.0, 0.0, 1.1, 0.0, 0.0, 0.0, 0.0],
  },
  DARKEN: {
    ...defaultKernel,
    kernel: [0.0, 0.0, 0.0, 0.0, 0.9, 0.0, 0.0, 0.0, 0.0],
  },
  SPREAD_PIXEL: {
    ...defaultKernel,
    kernel: [0.0, 0.5, 0.0, 0.5, 1.0, 0.5, 0.0, 0.5, 0.0],
  },
};
