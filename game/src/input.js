// input.js — keyboard + mouse-look state, pointer lock helpers.
export function createInput() {
  const input = {
    keys: new Set(),
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    locked: false,
    _onKeyDown: null,
    _onKeyUp: null,
    _onMouseMove: null,
    _onMouseDown: null,
    _onMouseUp: null,
    _onLockChange: null,
    _onBlur: null,
  };

  input._onKeyDown = (e) => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    input.keys.add(e.code);
    // Ignore key auto-repeat: a held key must not re-fire actions (holding P
    // would otherwise toggle pause on/off every repeat tick).
    if (e.repeat) return;
    if (input.onKey) input.onKey(e.code);
  };
  input._onKeyUp = (e) => input.keys.delete(e.code);
  // Window blur (alt-tab, devtools, ...) must not leave keys stuck down.
  input._onBlur = () => {
    input.keys.clear();
    input.mouseDown = false;
    input.mouseDX = 0;
    input.mouseDY = 0;
  };
  input._onMouseMove = (e) => {
    if (input.locked) {
      input.mouseDX += e.movementX || 0;
      input.mouseDY += e.movementY || 0;
    }
  };
  input._onMouseDown = (e) => { if (e.button === 0) input.mouseDown = true; };
  input._onMouseUp = (e) => { if (e.button === 0) input.mouseDown = false; };
  input._onLockChange = () => {
    input.locked = document.pointerLockElement === document.body;
  };

  window.addEventListener('keydown', input._onKeyDown);
  window.addEventListener('keyup', input._onKeyUp);
  window.addEventListener('blur', input._onBlur);
  window.addEventListener('mousemove', input._onMouseMove);
  window.addEventListener('mousedown', input._onMouseDown);
  window.addEventListener('mouseup', input._onMouseUp);
  document.addEventListener('pointerlockchange', input._onLockChange);

  input.down = (code) => input.keys.has(code);
  input.consumeMouse = () => {
    const dx = input.mouseDX, dy = input.mouseDY;
    input.mouseDX = 0; input.mouseDY = 0;
    return { dx, dy };
  };
  input.requestLock = () => {
    try {
      const p = document.body.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => { /* needs a real user gesture */ });
    } catch (err) { /* headless / denied */ }
  };
  input.exitLock = () => {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (err) { /* noop */ }
  };
  return input;
}
