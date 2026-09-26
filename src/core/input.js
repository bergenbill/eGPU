// Keyboard + mouse input with per-frame "pressed"/"released" edges.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { x: 0, y: 0, nx: 0, ny: 0, inside: false };
    this.buttons = new Set();
    this.bPressed = new Set();
    this.bReleased = new Set();
    this.wheel = 0;
    this.enabled = true;
    this.lastDevice = 'keyboard';

    const prevent = new Set([
      'Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash',
    ]);

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (prevent.has(e.code)) e.preventDefault();
      if (e.metaKey) return; // leave Cmd shortcuts to the browser
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });

    const setPos = (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.nx = (this.mouse.x / r.width) * 2 - 1;
      this.mouse.ny = -(this.mouse.y / r.height) * 2 + 1;
      this.mouse.inside = true;
    };
    window.addEventListener('mousemove', (e) => {
      setPos(e);
      this.mouseMoved = true;
    });
    canvas.addEventListener('mousedown', (e) => {
      setPos(e);
      // Ctrl+click on a Mac is a right click.
      const b = e.button === 0 && e.ctrlKey ? 2 : e.button;
      this.buttons.add(b);
      this.bPressed.add(b);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      const b = e.button === 0 && this.buttons.has(2) && !this.buttons.has(0) ? 2 : e.button;
      if (this.buttons.has(b)) {
        this.buttons.delete(b);
        this.bReleased.add(b);
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 60);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  reset() {
    this.down.clear();
    this.buttons.clear();
  }

  isDown(...codes) {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }
  wasPressed(...codes) {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }
  wasReleased(...codes) {
    for (const c of codes) if (this.released.has(c)) return true;
    return false;
  }
  mouseDown(b) {
    return this.buttons.has(b);
  }
  mousePressed(b) {
    return this.bPressed.has(b);
  }
  mouseReleased(b) {
    return this.bReleased.has(b);
  }

  // Called at the end of every frame.
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.bPressed.clear();
    this.bReleased.clear();
    this.wheel = 0;
    this.mouseMoved = false;
  }
}
