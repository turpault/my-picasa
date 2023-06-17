import { prng, range, uuid } from "../../shared/lib/utils";
import { AlbumEntryWithMetadata, Cell } from "../../shared/types/types";

export function leaves(nodes: Cell[]) {
  let cnt = 0;
  for (const node of nodes) {
    if (!node.childs) {
      cnt++;
    }
  }
  return cnt;
}
export function leafs(node: Cell): Cell[] {
  if (!node.childs) {
    return [node];
  }
  return [...leafs(node.childs.left), ...leafs(node.childs.right)];
}

export function buildSquareCells(
  list: AlbumEntryWithMetadata[],
  seed: number,
  ratio: number
): Cell {
  const rnd = prng(parseInt(seed.toString(10).replace(".", "")));
  const imgCount = list.length;
  const n = Math.floor(Math.sqrt(imgCount * ratio));
  const m = Math.floor(imgCount / n);
  // Only one image
  if (n === m && n === 1) {
    return {
      id: uuid(),
      split: "v",
      weight: 1,
      image: list[0],
    };
  }
  function splitCell(
    split: "h" | "v",
    count: number
  ): { left: Cell; right: Cell } {
    return {
      left: { id: uuid(), split, weight: 1 / count },
      right: {
        id: uuid(),
        split,
        weight: 1 - 1 / count,
        childs: count > 2 ? splitCell(split, count - 1) : undefined,
      },
    };
  }
  let split: "h" | "v" = m < n ? "h" : "v";
  let root: Cell = {
    id: uuid(),
    split,
    weight: 1,
    childs: n > 1 ? splitCell(split, n) : undefined,
  };
  if (m > 1) {
    split = split === "h" ? "v" : "h";
    leafs(root).forEach((leaf) => {
      leaf.split = split;
      leaf.childs = splitCell(split, m);
    });
  }
  const randomLeaves = leafs(root).sort(() => (rnd() > 0.5 ? -1 : 1));
  for (const img of list) {
    const leaf = randomLeaves.pop();
    if (leaf) {
      leaf.image = img;
    }
  }
  return root;
}

export function buildMosaicCells(
  list: AlbumEntryWithMetadata[],
  seed: number
): Cell {
  const rnd = prng(parseInt(seed.toString(10).replace(".", "")));
  // 1- sort images as portrait/paysage/square
  const portrait: AlbumEntryWithMetadata[] = [];
  const paysage: AlbumEntryWithMetadata[] = [];
  const square: AlbumEntryWithMetadata[] = [];
  for (const i of list) {
    if (Math.abs(1 - i.meta.width / i.meta.height) < 0.1) {
      square.push(i);
    } else if (i.meta.width > i.meta.height) {
      paysage.push(i);
    } else {
      portrait.push(i);
    }
  }

  // Add images
  // Create a binary tree with all the images
  const depth = Math.ceil(Math.log(list.length) / Math.log(2));

  function split(
    node: Cell,
    remainingDepth: number
  ): { node: Cell; allNodes: Cell[] } {
    if (remainingDepth === 0) {
      return { node, allNodes: [node] };
    }
    const { node: leftNode, allNodes: allLeftNodes } = split(
      { id: uuid(), split: node.split === "v" ? "h" : "v", weight: 0 },
      remainingDepth - 1
    );
    const { node: rightNode, allNodes: allRightNodes } = split(
      { id: uuid(), split: node.split === "v" ? "h" : "v", weight: 0 },
      remainingDepth - 1
    );
    node.childs = {
      left: leftNode,
      right: rightNode,
    };
    return { node, allNodes: [node, ...allLeftNodes, ...allRightNodes] };
  }
  const { node: root, allNodes } = split(
    {
      id: uuid(),
      split: "v",
      weight: 0,
    },
    depth
  );

  if (leaves(allNodes) !== Math.pow(2, depth)) {
    throw new Error("Wrong number of leaves");
  }

  const randomized1 = [...allNodes].sort(() => (rnd() > 0.5 ? -1 : 1));
  // Remove extra nodes
  let extraNodeCount = Math.pow(2, depth) - list.length;
  for (const node of randomized1) {
    if (
      extraNodeCount > 0 &&
      node.childs &&
      !node.childs.left.childs &&
      !node.childs.right.childs
    ) {
      //console.info('Removing nodes', node.childs.left.id, node.childs.right.id);
      extraNodeCount--;
      allNodes.splice(allNodes.indexOf(node.childs.left), 1);
      allNodes.splice(allNodes.indexOf(node.childs.right), 1);
      delete node.childs;
    }
  }
  if (leaves(allNodes) !== list.length) {
    throw new Error("Wrong number of leaves");
  }
  // Assign a picture to leaf nodes
  const randomLeaves = leafs(root).sort(() => (rnd() > 0.5 ? -1 : 1));
  const paysagePool = [...paysage];
  const portraitPool = [...portrait];
  const squarePool = [...square];
  for (const node of randomLeaves) {
    if (node.split === "v" && paysagePool.length > 0) {
      node.image = paysagePool.pop();
    } else if (node.split === "h" && portraitPool.length > 0) {
      node.image = portraitPool.pop();
    } else if (squarePool.length > 0) {
      node.image = squarePool.pop();
    } else if (paysagePool.length > 0) {
      node.image = paysagePool.pop();
    } else if (portraitPool.length > 0) {
      node.image = portraitPool.pop();
    } else {
      throw new Error("Not enough images");
    }
  }

  // Balance weights
  function weightOf(node: Cell): { w: number; h: number } {
    if (node.childs) {
      const { w: wLeft, h: hLeft } = weightOf(node.childs.left);
      const { w: wRight, h: hRight } = weightOf(node.childs.right);
      if (node.split === "h") {
        node.childs.left.weight = hLeft / (hLeft + hRight);
        node.childs.right.weight = hRight / (hLeft + hRight);
        return { w: Math.max(wLeft + wRight), h: hLeft + hRight };
      } else {
        // split === "v"
        node.childs.left.weight = wLeft / (wLeft + wRight);
        node.childs.right.weight = wRight / (wLeft + wRight);
        return { w: wLeft + wRight, h: Math.max(hLeft + hRight) };
      }
    }
    if (portrait.includes(node.image!)) {
      return { w: 4, h: 6 };
    }
    if (paysage.includes(node.image!)) {
      return { w: 6, h: 4 };
    }
    if (square.includes(node.image!)) {
      return { w: 5, h: 5 };
    }
    throw new Error("Should not get here");
  }

  weightOf(root);
  return root;
}
