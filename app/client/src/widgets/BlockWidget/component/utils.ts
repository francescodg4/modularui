import type React from "react";

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

/**
 * Spread on block UI that the user interacts with in the editor (prompt, gear menu, panels). It keeps clicks from
 * selecting or dragging the widget, and keystrokes such as Backspace from reaching the canvas shortcuts, which would
 * delete the selected widget. React events bubble through portals, so this also covers the panel modal.
 */
export const stopCanvasEvents = {
  onClick: stop,
  onMouseDown: stop,
  onPointerDown: stop,
  onKeyDown: stop,
  onKeyUp: stop,
  onDragStart: stop,
};
