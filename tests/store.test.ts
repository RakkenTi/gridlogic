import { describe, expect, it } from 'vitest';
import { countAllBlocks, ProjectStore } from '../src/state/store';

describe('ProjectStore tree operations & undo/redo', () => {
  it('supports adding, nesting, duplicating, deleting, and undo/redo', () => {
    const store = new ProjectStore();
    store.createBlankProject();
    expect(store.getProject().blocks).toHaveLength(0);

    const ifBlock = store.addBlock('if_condition');
    expect(store.getProject().blocks).toHaveLength(1);

    // Since ifBlock is selected and is a container, adding next block nests inside it
    const echoBlock = store.addBlock('pb_echo');
    expect(store.getProject().blocks[0].children).toHaveLength(1);
    expect(store.getProject().blocks[0].children![0].id).toBe(echoBlock.id);

    // Prevent dropping parent inside itself
    expect(
      store.moveBlock(ifBlock.id, { parentId: ifBlock.id, slot: 'children', index: 0 })
    ).toBe(false);

    // Duplicate inner block
    const copy = store.duplicateBlock(echoBlock.id);
    expect(copy).not.toBeNull();
    expect(countAllBlocks(store.getProject().blocks)).toBe(3);

    // Undo duplicate
    expect(store.canUndo()).toBe(true);
    store.undo();
    expect(countAllBlocks(store.getProject().blocks)).toBe(2);

    // Redo duplicate
    expect(store.canRedo()).toBe(true);
    store.redo();
    expect(countAllBlocks(store.getProject().blocks)).toBe(3);

    // Delete block
    store.deleteBlock(copy!.id);
    expect(countAllBlocks(store.getProject().blocks)).toBe(2);
  });

  it('round-trips JSON export and import cleanly', () => {
    const store = new ProjectStore();
    store.loadPreset('smart-airlock');
    const originalCount = countAllBlocks(store.getProject().blocks);
    const json = store.exportProjectJson();

    store.createBlankProject();
    expect(countAllBlocks(store.getProject().blocks)).toBe(0);

    const res = store.importProjectJson(json);
    expect(res.ok).toBe(true);
    expect(countAllBlocks(store.getProject().blocks)).toBe(originalCount);
    expect(store.getProject().name).toBe('Smart Automatic Airlock');
  });

  it('auto-wraps clicked GUI widgets inside a GUI Screen Canvas when none exists', () => {
    const store = new ProjectStore();
    store.createBlankProject();
    store.addBlock('gui_bar');
    expect(store.getProject().blocks).toHaveLength(1);
    expect(store.getProject().blocks[0].type).toBe('gui_screen');
    expect(store.getProject().blocks[0].children).toHaveLength(1);
    expect(store.getProject().blocks[0].children![0].type).toBe('gui_bar');

    // Adding a second GUI widget appends inside the existing gui_screen
    store.addBlock('gui_metrics');
    expect(store.getProject().blocks).toHaveLength(1);
    expect(store.getProject().blocks[0].children).toHaveLength(2);
    expect(store.getProject().blocks[0].children![1].type).toBe('gui_metrics');
  });
});
