export class InputController {
  constructor(opts) {
    this.canvas = opts.canvas;
    this.onBiteStart = opts.onBiteStart;
    this.onBiteEnd = opts.onBiteEnd;
    this.onSkill = opts.onSkill;
    this.onUltimate = opts.onUltimate;
    this.onHotbarSelect = opts.onHotbarSelect;
    this.onModeChange = opts.onModeChange;

    this.mousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.isTouchDevice = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    this.inputMode = this.isTouchDevice ? "touch" : "mouse";
    this.joystick = { active: false, touchId: null, angle: 0, power: 0 };

    this.joystickZone = document.getElementById("joystick-zone");
    this.joystickBase = document.getElementById("joystick-base");
    this.joystickKnob = document.getElementById("joystick-knob");
    this.btnBite = document.getElementById("btn-mobile-bite");
    this.btnSkill = document.getElementById("btn-mobile-skill");
    this.btnUlt = document.getElementById("btn-mobile-ult");

    this._bindEvents();
  }

  resetJoystick() {
    this.joystick.active = false;
    this.joystick.touchId = null;
    this.joystick.power = 0;
    this.joystickKnob.style.transform = "translate(0px, 0px)";
  }

  _updateJoystick(touch) {
    const rect = this.joystickBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxDist = rect.width * 0.42;

    const dx = touch.clientX - cx;
    const dy = touch.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(maxDist, dist);
    const angle = Math.atan2(dy, dx);

    if (dist > 4) this.joystick.angle = angle;
    this.joystick.power = clamped / maxDist;
    this.joystickKnob.style.transform = `translate(${Math.cos(angle) * clamped}px, ${Math.sin(angle) * clamped}px)`;
  }

  _bindEvents() {
    this.canvas.addEventListener("mousemove", (e) => {
      if (this.inputMode === "touch" && this.joystick.active) return;
      this.inputMode = "mouse";
      this.mousePos.x = e.clientX;
      this.mousePos.y = e.clientY;
    });

    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        this.inputMode = "mouse";
        this.onBiteStart();
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.onBiteEnd();
    });

    this.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.onSkill();
    });

    window.addEventListener("keydown", (e) => {
      if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
      if (e.code === "Space") { e.preventDefault(); this.onSkill(); }
      if (e.code === "KeyE" || e.code === "KeyR") { e.preventDefault(); this.onUltimate(); }
      if (["Digit1", "Digit2", "Digit3"].includes(e.code)) {
        this.onHotbarSelect(Number(e.code.replace("Digit", "")) - 1);
      }
    });

    window.addEventListener("touchstart", (e) => {
      if (e.target.closest("#chat-widget")) return;
      this.isTouchDevice = true;
      this.inputMode = "touch";
      this.onModeChange(true);
    }, { passive: true });

    this.joystickZone.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.inputMode = "touch";
      if (this.joystick.touchId === null && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        this.joystick.active = true;
        this.joystick.touchId = t.identifier;
        this._updateJoystick(t);
      }
    }, { passive: false });

    this.joystickZone.addEventListener("touchmove", (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const t of e.changedTouches) {
        if (t.identifier === this.joystick.touchId) {
          this._updateJoystick(t);
          break;
        }
      }
    }, { passive: false });

    const endJoy = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joystick.touchId) {
          this.resetJoystick();
          break;
        }
      }
    };
    this.joystickZone.addEventListener("touchend", endJoy);
    this.joystickZone.addEventListener("touchcancel", endJoy);

    this.btnBite.addEventListener("touchstart", (e) => {
      e.preventDefault(); e.stopPropagation();
      this.inputMode = "touch";
      this.onBiteStart();
    }, { passive: false });

    const stopBite = (e) => { e.preventDefault(); this.onBiteEnd(); };
    this.btnBite.addEventListener("touchend", stopBite, { passive: false });
    this.btnBite.addEventListener("touchcancel", stopBite, { passive: false });

    this.btnSkill.addEventListener("touchstart", (e) => {
      e.preventDefault(); e.stopPropagation();
      this.inputMode = "touch";
      this.onSkill();
    }, { passive: false });

    this.btnUlt.addEventListener("touchstart", (e) => {
      e.preventDefault(); e.stopPropagation();
      this.inputMode = "touch";
      this.onUltimate();
    }, { passive: false });
  }
}