/**
 * BSP Tree Renderer
 * Traverses BSP tree to determine visible subsectors
 * Based on linuxdoom-1.10/r_bsp.c
 */

import type { MapData, MapNode } from '../level/types';
import { NF_SUBSECTOR } from '../level/types';

export class BSPRenderer {
  private mapData: MapData;
  private visibleSubsectors: Set<number>;

  constructor(mapData: MapData) {
    this.mapData = mapData;
    this.visibleSubsectors = new Set();
  }

  /**
   * Traverse BSP tree from camera position and build visible subsector list
   * @param cameraX - Camera X position in DOOM coordinates
   * @param cameraY - Camera Y position in DOOM coordinates
   * @returns Set of visible subsector indices
   */
  getVisibleSubsectors(cameraX: number, cameraY: number): Set<number> {
    this.visibleSubsectors.clear();

    if (this.mapData.nodes.length === 0) {
      // No BSP tree - mark all subsectors as visible
      for (let i = 0; i < this.mapData.subsectors.length; i++) {
        this.visibleSubsectors.add(i);
      }
      return this.visibleSubsectors;
    }

    // Start traversal from root node (last node in array)
    const rootNodeIndex = this.mapData.nodes.length - 1;
    this.traverseNode(rootNodeIndex, cameraX, cameraY);

    return this.visibleSubsectors;
  }

  /**
   * Recursively traverse BSP node
   * @param nodeIndex - Node index (or subsector index if NF_SUBSECTOR flag set)
   * @param x - Camera X position
   * @param y - Camera Y position
   */
  private traverseNode(nodeIndex: number, x: number, y: number): void {
    // Check if this is a subsector
    if ((nodeIndex & NF_SUBSECTOR) !== 0) {
      // This is a subsector - add to visible list
      const subsectorIndex = nodeIndex & ~NF_SUBSECTOR;
      if (subsectorIndex < this.mapData.subsectors.length) {
        this.visibleSubsectors.add(subsectorIndex);
      }
      return;
    }

    // This is a node - determine which side camera is on
    if (nodeIndex >= this.mapData.nodes.length) {
      console.warn(`Invalid node index: ${nodeIndex}`);
      return;
    }

    const node = this.mapData.nodes[nodeIndex];
    const side = this.pointOnSide(x, y, node);

    // Traverse near side first (front-to-back)
    this.traverseNode(node.children[side], x, y);

    // Check if we should traverse far side
    // For now, always traverse both sides (we'll add frustum culling later)
    this.traverseNode(node.children[side ^ 1], x, y);
  }

  /**
   * Determine which side of a BSP partition line a point is on
   * @param x - Point X
   * @param y - Point Y
   * @param node - BSP node with partition line
   * @returns 0 for front/right side, 1 for back/left side
   */
  private pointOnSide(x: number, y: number, node: MapNode): number {
    // Calculate which side of the partition line the point is on
    // Line equation: (x - node.x) * node.dy - (y - node.y) * node.dx
    // If result > 0, point is on front side; otherwise back side

    const dx = x - node.x;
    const dy = y - node.y;

    // Cross product to determine side
    const cross = dx * node.dy - dy * node.dx;

    return cross <= 0 ? 0 : 1;
  }

  /**
   * Get all segs in a subsector
   * @param subsectorIndex - Subsector index
   * @returns Array of seg indices in this subsector
   */
  getSubsectorSegs(subsectorIndex: number): number[] {
    if (subsectorIndex >= this.mapData.subsectors.length) {
      return [];
    }

    const subsector = this.mapData.subsectors[subsectorIndex];
    const segIndices: number[] = [];

    for (let i = 0; i < subsector.numsegs; i++) {
      segIndices.push(subsector.firstseg + i);
    }

    return segIndices;
  }

  /**
   * Get the sector index for a subsector
   * @param subsectorIndex - Subsector index
   * @returns Sector index, or -1 if not found
   */
  getSubsectorSector(subsectorIndex: number): number {
    const segIndices = this.getSubsectorSegs(subsectorIndex);

    if (segIndices.length === 0) {
      return -1;
    }

    // Get sector from first seg's linedef
    const seg = this.mapData.segs[segIndices[0]];
    if (seg.linedef < 0 || seg.linedef >= this.mapData.linedefs.length) {
      return -1;
    }

    const linedef = this.mapData.linedefs[seg.linedef];
    const sidenum = seg.side === 0 ? linedef.sidenum[0] : linedef.sidenum[1];

    if (sidenum < 0 || sidenum >= this.mapData.sidedefs.length) {
      return -1;
    }

    return this.mapData.sidedefs[sidenum].sector;
  }
}
