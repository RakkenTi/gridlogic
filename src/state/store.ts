import { BLOCK_MAP, createBlockId, createBlockInstance } from '../blocks/catalog';
import { cloneProject, PRESET_SCRIPTS } from '../presets/presets';
import type { BlockType, ScriptBlock, ScriptProject, UpdateFrequencyOption } from '../types';

export type ContainerSlot = 'root' | 'children' | 'elseChildren';

export interface DropTarget {
  parentId: string | null;
  slot: ContainerSlot;
  index: number;
}

const STORAGE_KEY = 'gridlogic_se_project_v1';
const MAX_HISTORY = 50;

function cloneBlocksWithNewIds(blocks: ScriptBlock[]): ScriptBlock[] {
  return blocks.map((b) => ({
    ...b,
    id: createBlockId(),
    params: { ...b.params },
    children: b.children ? cloneBlocksWithNewIds(b.children) : undefined,
    elseChildren: b.elseChildren ? cloneBlocksWithNewIds(b.elseChildren) : undefined,
  }));
}

export function findBlockById(blocks: ScriptBlock[], id: string): ScriptBlock | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.children) {
      const found = findBlockById(b.children, id);
      if (found) return found;
    }
    if (b.elseChildren) {
      const found = findBlockById(b.elseChildren, id);
      if (found) return found;
    }
  }
  return null;
}

export function containsBlockId(block: ScriptBlock, targetId: string): boolean {
  if (block.id === targetId) return true;
  if (block.children?.some((c) => containsBlockId(c, targetId))) return true;
  if (block.elseChildren?.some((c) => containsBlockId(c, targetId))) return true;
  return false;
}

export function findParentList(
  blocks: ScriptBlock[],
  targetId: string,
  parentId: string | null = null,
  slot: ContainerSlot = 'root'
): { list: ScriptBlock[]; index: number; parentId: string | null; slot: ContainerSlot } | null {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.id === targetId) {
      return { list: blocks, index: i, parentId, slot };
    }
    if (b.children) {
      const res = findParentList(b.children, targetId, b.id, 'children');
      if (res) return res;
    }
    if (b.elseChildren) {
      const res = findParentList(b.elseChildren, targetId, b.id, 'elseChildren');
      if (res) return res;
    }
  }
  return null;
}

function getListAtTarget(project: ScriptProject, target: DropTarget): ScriptBlock[] | null {
  if (target.parentId === null || target.slot === 'root') {
    return project.blocks;
  }
  const parent = findBlockById(project.blocks, target.parentId);
  if (!parent) return null;
  if (target.slot === 'elseChildren') {
    if (!parent.elseChildren) parent.elseChildren = [];
    return parent.elseChildren;
  }
  if (!parent.children) parent.children = [];
  return parent.children;
}

export function countAllBlocks(blocks: ScriptBlock[]): number {
  let count = 0;
  for (const b of blocks) {
    count += 1;
    if (b.children) count += countAllBlocks(b.children);
    if (b.elseChildren) count += countAllBlocks(b.elseChildren);
  }
  return count;
}

type Listener = () => void;

export class ProjectStore {
  private project: ScriptProject;
  private selectedBlockId: string | null = null;
  private undoStack: ScriptProject[] = [];
  private redoStack: ScriptProject[] = [];
  private listeners = new Set<Listener>();

  constructor(initialProject?: ScriptProject) {
    if (initialProject) {
      this.project = cloneProject(initialProject);
    } else {
      this.project = this.loadFromStorage() ?? cloneProject(PRESET_SCRIPTS[0].project);
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.saveToStorage();
    for (const fn of this.listeners) fn();
  }

  private pushHistory(): void {
    this.undoStack.push(cloneProject(this.project));
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
  }

  private saveToStorage(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
      }
    } catch {
      // Ignore storage errors in sandboxed iframes
    }
  }

  private loadFromStorage(): ScriptProject | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as ScriptProject;
        if (parsed && Array.isArray(parsed.blocks) && typeof parsed.name === 'string') {
          return parsed;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  getProject(): ScriptProject {
    return this.project;
  }

  getSelectedBlockId(): string | null {
    return this.selectedBlockId;
  }

  selectBlock(id: string | null, silent = false): void {
    this.selectedBlockId = id;
    if (!silent) {
      for (const fn of this.listeners) fn();
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(cloneProject(this.project));
    this.project = prev;
    this.emit();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(cloneProject(this.project));
    this.project = next;
    this.emit();
  }

  updateProjectMeta(patch: {
    name?: string;
    description?: string;
    updateFrequency?: UpdateFrequencyOption;
    sameGridOnly?: boolean;
  }): void {
    this.pushHistory();
    this.project = { ...this.project, ...patch };
    this.emit();
  }

  loadPreset(presetId: string): boolean {
    const preset = PRESET_SCRIPTS.find((p) => p.id === presetId);
    if (!preset) return false;
    this.pushHistory();
    this.project = cloneProject(preset.project);
    this.selectedBlockId = null;
    this.emit();
    return true;
  }

  createBlankProject(): void {
    this.pushHistory();
    this.project = {
      name: 'My Custom Ship Script',
      description: 'Custom Space Engineers script built with GridLogic.',
      updateFrequency: 'Update100',
      sameGridOnly: true,
      blocks: [],
    };
    this.selectedBlockId = null;
    this.emit();
  }

  importProjectJson(jsonText: string): { ok: boolean; error?: string } {
    try {
      const parsed = JSON.parse(jsonText) as ScriptProject;
      if (!parsed || typeof parsed.name !== 'string' || !Array.isArray(parsed.blocks)) {
        return { ok: false, error: 'Invalid GridLogic project JSON format.' };
      }
      this.pushHistory();
      this.project = {
        name: parsed.name,
        description: String(parsed.description ?? ''),
        updateFrequency: parsed.updateFrequency || 'Update100',
        sameGridOnly: parsed.sameGridOnly !== false,
        blocks: cloneBlocksWithNewIds(parsed.blocks),
      };
      this.selectedBlockId = null;
      this.emit();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to parse JSON.' };
    }
  }

  exportProjectJson(): string {
    return JSON.stringify(this.project, null, 2);
  }

  addBlock(type: BlockType, target?: DropTarget): ScriptBlock {
    this.pushHistory();
    const block = createBlockInstance(type);
    const isGuiWidget = Boolean(BLOCK_MAP[type]?.guiWidget);

    if (target) {
      const list = getListAtTarget(this.project, target);
      if (list) {
        const idx = Math.max(0, Math.min(target.index, list.length));
        list.splice(idx, 0, block);
      } else {
        this.project.blocks.push(block);
      }
    } else if (isGuiWidget) {
      // Smart-place GUI widgets inside the selected container (if inside a gui_screen) or the last gui_screen
      const findLastGuiScreen = (list: ScriptBlock[]): ScriptBlock | null => {
        let found: ScriptBlock | null = null;
        for (const item of list) {
          if (item.type === 'gui_screen') found = item;
          if (item.children) {
            const sub = findLastGuiScreen(item.children);
            if (sub) found = sub;
          }
          if (item.elseChildren) {
            const sub = findLastGuiScreen(item.elseChildren);
            if (sub) found = sub;
          }
        }
        return found;
      };
      const selected = this.selectedBlockId ? findBlockById(this.project.blocks, this.selectedBlockId) : null;
      const hostScreen =
        selected && selected.type === 'gui_screen'
          ? selected
          : findLastGuiScreen(this.project.blocks);

      if (hostScreen) {
        if (!hostScreen.children) hostScreen.children = [];
        hostScreen.children.push(block);
      } else {
        const screen = createBlockInstance('gui_screen');
        screen.children = [block];
        this.project.blocks.push(screen);
      }
    } else if (this.selectedBlockId) {
      const selected = findBlockById(this.project.blocks, this.selectedBlockId);
      if (selected && selected.children && type !== 'on_setup' && type !== 'gui_screen') {
        selected.children.push(block);
      } else {
        const loc = findParentList(this.project.blocks, this.selectedBlockId);
        if (loc && type !== 'on_setup') {
          loc.list.splice(loc.index + 1, 0, block);
        } else {
          this.project.blocks.push(block);
        }
      }
    } else {
      if (type === 'on_setup') {
        this.project.blocks.unshift(block);
      } else {
        this.project.blocks.push(block);
      }
    }
    this.selectedBlockId = block.id;
    this.emit();
    return block;
  }

  moveBlock(blockId: string, target: DropTarget): boolean {
    const loc = findParentList(this.project.blocks, blockId);
    if (!loc) return false;
    const moving = loc.list[loc.index];

    // Prevent dropping a container into itself or its own descendants
    if (target.parentId && containsBlockId(moving, target.parentId)) {
      return false;
    }

    // Prevent nesting on_setup inside another block
    if (moving.type === 'on_setup' && target.parentId !== null) {
      return false;
    }

    this.pushHistory();
    const freshLoc = findParentList(this.project.blocks, blockId);
    if (!freshLoc) return false;
    const [removed] = freshLoc.list.splice(freshLoc.index, 1);

    const destList = getListAtTarget(this.project, target);
    if (!destList) {
      this.project.blocks.push(removed);
    } else {
      let insertIndex = target.index;
      if (freshLoc.list === destList && freshLoc.index < insertIndex) {
        insertIndex -= 1;
      }
      insertIndex = Math.max(0, Math.min(insertIndex, destList.length));
      destList.splice(insertIndex, 0, removed);
    }
    this.selectedBlockId = removed.id;
    this.emit();
    return true;
  }

  nudgeBlock(blockId: string, direction: -1 | 1): boolean {
    const loc = findParentList(this.project.blocks, blockId);
    if (!loc) return false;
    const nextIdx = loc.index + direction;
    if (nextIdx < 0 || nextIdx >= loc.list.length) return false;
    this.pushHistory();
    const fresh = findParentList(this.project.blocks, blockId);
    if (!fresh) return false;
    const [item] = fresh.list.splice(fresh.index, 1);
    fresh.list.splice(nextIdx, 0, item);
    this.emit();
    return true;
  }

  updateBlockParam(
    blockId: string,
    key: string,
    value: string | number | boolean,
    recordHistory = true
  ): void {
    const block = findBlockById(this.project.blocks, blockId);
    if (!block) return;
    if (block.params[key] === value) return;
    if (recordHistory) this.pushHistory();
    const target = findBlockById(this.project.blocks, blockId);
    if (!target) return;
    target.params[key] = value;
    if (key === 'hasElse' && value === true && !target.elseChildren) {
      target.elseChildren = [];
    }
    this.emit();
  }

  toggleBlockDisabled(blockId: string): void {
    const block = findBlockById(this.project.blocks, blockId);
    if (!block) return;
    this.pushHistory();
    const target = findBlockById(this.project.blocks, blockId);
    if (!target) return;
    target.disabled = !target.disabled;
    this.emit();
  }

  toggleBlockCollapsed(blockId: string): void {
    const block = findBlockById(this.project.blocks, blockId);
    if (!block) return;
    block.collapsed = !block.collapsed;
    this.emit();
  }

  duplicateBlock(blockId: string): ScriptBlock | null {
    const loc = findParentList(this.project.blocks, blockId);
    if (!loc) return null;
    this.pushHistory();
    const fresh = findParentList(this.project.blocks, blockId);
    if (!fresh) return null;
    const [copy] = cloneBlocksWithNewIds([fresh.list[fresh.index]]);
    fresh.list.splice(fresh.index + 1, 0, copy);
    this.selectedBlockId = copy.id;
    this.emit();
    return copy;
  }

  deleteBlock(blockId: string): boolean {
    const loc = findParentList(this.project.blocks, blockId);
    if (!loc) return false;
    this.pushHistory();
    const fresh = findParentList(this.project.blocks, blockId);
    if (!fresh) return false;
    fresh.list.splice(fresh.index, 1);
    if (this.selectedBlockId === blockId) {
      this.selectedBlockId = null;
    }
    this.emit();
    return true;
  }
}
