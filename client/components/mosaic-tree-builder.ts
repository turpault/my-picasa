import { uuid } from "../../shared/lib/utils";
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

export function buildCells(list: AlbumEntryWithMetadata[]): Cell {
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

  const randomized1 = [...allNodes].sort(() => Math.random() - 0.5);
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
  const randomized = [...allNodes].sort(() => Math.random() - 0.5);
  if (leaves(randomized) !== list.length) {
    throw new Error("Wrong number of leaves");
  }

  for (const img of list) {
    let found = false;
    for (const node of randomized) {
      if (!node.childs && !node.image) {
        // There's still room left
        found = true;
        break;
      }
    }
    if (!found) {
      // no available slot, pick a random one and split
      for (const node of randomized) {
        if (!node.childs) {
          const copy = { ...node };
          node.image = undefined;
          const { allNodes: newNodes } = split(node, 1);
          node.childs!.left = {
            ...copy,
            split: copy.split === "v" ? "h" : "v",
          };
          randomized.push(node.childs!.right);
          randomized.push(node);
          randomized.splice(randomized.indexOf(node), 1);
          break;
        }
      }
    }

    found = false;
    // Find a node with no childs
    for (const node of randomized) {
      if (
        !found &&
        !node.childs &&
        node.split === "v" &&
        paysage.includes(img) &&
        !node.image
      ) {
        found = true;
        node.image = img;
        break;
      }
      if (
        !found &&
        !node.childs &&
        node.split === "h" &&
        portrait.includes(img) &&
        !node.image
      ) {
        found = true;
        node.image = img;
        break;
      }
      if (!found && !node.childs && square.includes(img) && !node.image) {
        found = true;
        node.image = img;
        break;
      }
    }
    if (!found) {
      for (const node of randomized) {
        if (!node.image && !node.childs) {
          node.image = img;
          found = true;
          break;
        }
      }
    }
    if (!found) {
      throw new Error("Should have found");
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
