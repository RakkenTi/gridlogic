import type { BlockType } from '../types';

export type DragPayload =
  | { kind: 'palette'; blockType: BlockType }
  | { kind: 'existing'; blockId: string };

let activeDrag: DragPayload | null = null;

export function setActiveDrag(payload: DragPayload | null): void {
  activeDrag = payload;
}

export function getActiveDrag(): DragPayload | null {
  return activeDrag;
}
