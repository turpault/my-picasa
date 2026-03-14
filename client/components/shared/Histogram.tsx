import { useRef, useEffect, useCallback } from "react";
import { usePicisaService } from "../../context/AppContext";

function drawHistogram(
  histogram: { r: number[]; g: number[]; b: number[] },
  canvas: HTMLCanvasElement,
) {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const max = Math.max(...histogram.r, ...histogram.g, ...histogram.b);
  if (max === 0) return;
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

interface HistogramProps {
  context: string | null;
}

export function Histogram({ context }: HistogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const service = usePicisaService();

  const refresh = useCallback(async () => {
    if (!context || !service || !canvasRef.current) return;
    const data = await service.histogram(context);
    if (!data) return;
    drawHistogram(data, canvasRef.current);
  }, [context, service]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <canvas ref={canvasRef} className="canvas-histogram" />;
}
