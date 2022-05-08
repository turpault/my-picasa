/*
When you rotate a rectangle W x H, the bounding box takes the dimensions W' = W |cos Θ| + H |sin Θ|, H' = W |sin Θ| + H |cos Θ|.

If you need to fit that in a W" x H" rectangle, the scaling factor is the smallest of W"/W' and H"/H'.
*/
/**
 * 
 * @param w 
 * @param h 
 * @param o 
 * @returns The rectangle size needed to fit the rotated rectangle, and the ratio size needed to make the new rectangle fit in the passed rect
 */
export function rotateRectangle(w: number, h: number, o: number): {
  w: number, h: number, ratio: number
} {
  const W = w*Math.abs(Math.cos(o)) + h*Math.abs(Math.sin(o));
  const H = w*Math.abs(Math.sin(o)) + h*Math.abs(Math.cos(o));
  const R = Math.max(W/w, H/h);

    return {
      w:W, h:H, ratio: R
    }
}

