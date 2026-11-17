// Vice Harbor — input.js
// Keyboard state and pointer-lock mouse look for the player controller.
//
// Keyboard state is keyed by KeyboardEvent.code (layout independent, so
// WASD stays WASD on any keyboard). Two kinds of reads are offered:
//   isDown(code)  — level-triggered: true while the key is physically held.
//   pressed(code) — edge-triggered: true exactly once per physical press,
//                   and reading it consumes the press.
// Mouse deltas accumulate from mousemove events only while the pointer is
// locked to the game element; consumeMouse() drains the accumulator.
// A left mousedown while locked raises a click flag that consumeClick()
// drains — the combat code uses it so menu clicks never fire the weapon.

export function createInput(dom) {
  const down = new Set();       // codes currently held down
  const pressedSet = new Set(); // codes pressed since they were last consumed
  let mouseDX = 0;              // accumulated horizontal mouse movement
  let mouseDY = 0;              // accumulated vertical mouse movement
  let isLocked = false;         // mirrors the pointerlockchange state
  let clickPending = false;     // a left click landed while locked

  function onKeyDown(e) {
    // Held keys auto-repeat in the browser; a repeat is not a new press.
    if (e.repeat) return;
    down.add(e.code);
    pressedSet.add(e.code);
  }

  function onKeyUp(e) {
    down.delete(e.code);
  }

  function onBlur() {
    // The window lost focus (alt-tab, OS overlay): drop all held state so
    // the player does not keep "running" against a wall on return.
    down.clear();
    pressedSet.clear();
    clickPending = false;
  }

  function onMouseMove(e) {
    if (!isLocked) return;
    mouseDX += e.movementX || 0;
    mouseDY += e.movementY || 0;
  }

  function onMouseDown(e) {
    if (isLocked && e.button === 0) clickPending = true;
  }

  function onLockChange() {
    isLocked = document.pointerLockElement === dom;
    if (!isLocked) {
      // Losing the lock means the player opened a menu or the browser
      // took the pointer back; stale held keys must not leak through.
      onBlur();
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    // Level-triggered read: is this key held right now?
    isDown(code) {
      return down.has(code);
    },

    // Edge-triggered read: true once per physical press. Reading consumes
    // the press, and endFrame() discards presses nobody read in time.
    pressed(code) {
      if (!pressedSet.has(code)) return false;
      pressedSet.delete(code);
      return true;
    },

    // Raw accumulators, exposed for HUD/debug overlays.
    get mouseDX() { return mouseDX; },
    get mouseDY() { return mouseDY; },

    // Drain the accumulated mouse movement and zero the counters.
    consumeMouse() {
      const out = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return out;
    },

    // Drain the click flag: true if the player clicked while locked.
    consumeClick() {
      const wasClicked = clickPending;
      clickPending = false;
      return wasClicked;
    },

    // Ask the browser to lock the pointer onto the game element.
    lock() {
      if (!isLocked) dom.requestPointerLock();
    },

    // Release the pointer lock (menus, pause screens).
    unlock() {
      if (isLocked) document.exitPointerLock();
    },

    // True while the pointer is locked to the game element.
    get locked() {
      return isLocked;
    },

    // Per-frame housekeeping: presses are single-frame events, so any
    // press that no system consumed during this frame expires here.
    endFrame() {
      pressedSet.clear();
    },
  };
}
