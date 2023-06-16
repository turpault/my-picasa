import { AlbumEntryWithMetadata, Cell } from "../types/types";

export function calculateImagePositions(
  cell: Cell,
  gutter: number,
  left: number,
  top: number,
  width: number,
  height: number
): {
  images: {
    left: number;
    top: number;
    width: number;
    height: number;
    entry: AlbumEntryWithMetadata;
    cell: Cell;
  }[];
  gutters: {
    left: number;
    top: number;
    width: number;
    height: number;
    direction: "h" | "v";
    leftCell: Cell;
    rightCell: Cell;
  }[];
} {
  if (cell.childs) {
    if (cell.split === "v") {
      const totalWeight = cell.childs.left.weight + cell.childs.right.weight;
      const leftCalc = calculateImagePositions(
        cell.childs.left,
        gutter,
        left,
        top,
        (cell.childs.left.weight / totalWeight) * width,
        height
      );
      const rightCalc = calculateImagePositions(
        cell.childs.right,
        gutter,
        left + (cell.childs.left.weight / totalWeight) * width,
        top,
        (cell.childs.right.weight / totalWeight) * width,
        height
      );
      const gutterPos = {
        top,
        left: (cell.childs.left.weight / totalWeight) * width - gutter / 2,
        width: gutter,
        height,
        leftCell: cell.childs.left,
        rightCell: cell.childs.right,
        direction: cell.split,
      };
      return {
        images: [...leftCalc.images, ...rightCalc.images],
        gutters: [gutterPos, ...leftCalc.gutters, ...rightCalc.gutters],
      };
    } else {
      const totalWeight = cell.childs.left.weight + cell.childs.right.weight;
      const topCalc = calculateImagePositions(
        cell.childs.left,
        gutter,
        left,
        top,
        width,
        (cell.childs.left.weight / totalWeight) * height
      );
      const bottomCalc = calculateImagePositions(
        cell.childs.right,
        gutter,
        left,
        top + (cell.childs.left.weight / totalWeight) * height,
        width,
        (cell.childs.right.weight / totalWeight) * height
      );
      const gutterPos = {
        top:
          top + (cell.childs.left.weight / totalWeight) * height - gutter / 2,
        left,
        width,
        height: gutter,
        leftCell: cell.childs.left,
        rightCell: cell.childs.right,
        direction: cell.split,
      };
      return {
        images: [...topCalc.images, ...bottomCalc.images],
        gutters: [gutterPos, ...topCalc.gutters, ...bottomCalc.gutters],
      };
    }
  } else {
    return {
      images: [
        {
          cell,
          left: left + gutter / 2,
          top: top + gutter / 2,
          width: width - gutter,
          height: height - gutter,
          entry: cell.image!,
        },
      ],
      gutters: [],
    };
  }
}
