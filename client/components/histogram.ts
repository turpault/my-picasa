import { $, _$ } from "../lib/dom";
import { getService } from "../rpc/connect";

const histogramHTML = ` <div>
<div class="histogram">
<canvas class="canvas-histogram"/>
</div>
</div>
`;
export function makeHistogram(e: _$) {
  const histogramSidebar = $(histogramHTML);
  e.append(histogramSidebar);

  async function refreshHistogram(context: string) {
    const s = await getService();
    const histogramData = await s.histogram(context);
    drawHistogram(
      histogramData,
      $(".canvas-histogram", histogramSidebar).get() as HTMLCanvasElement
    );
  }
  return refreshHistogram;
}

export function drawHistogram(
  histogram: { r: number[]; g: number[]; b: number[] },
  canvas: HTMLCanvasElement
) {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const max = Math.max(...histogram.r, ...histogram.g, ...histogram.b);
  const scale = height / max;
  ctx.fillStyle = "rgba(255,0,0,0.5)";
  for (let i = 0; i < histogram.r.length; i++) {
    const h = histogram.r[i] * scale;
    ctx.fillRect(i, height - h, 1, h);
  }
  ctx.fillStyle = "rgba(0,255,0,0.5)";
  for (let i = 0; i < histogram.g.length; i++) {
    const h = histogram.g[i] * scale;
    ctx.fillRect(i, height - h, 1, h);
  }
  ctx.fillStyle = "rgba(0,0,255,0.5)";
  for (let i = 0; i < histogram.b.length; i++) {
    const h = histogram.b[i] * scale;
    ctx.fillRect(i, height - h, 1, h);
  }
}
