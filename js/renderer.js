import { MAP_SIZE, EVO_TIERS, BOSS_VISION_RADIUS, BOSS_VORTEX_RADIUS } from "./config.js";
import { getFishConfig } from "./registries.js";

export function getTierFromLevel(lvl) {
  return Math.min(EVO_TIERS.length, 1 + Math.floor(lvl / 10));
}

export function getFishRadius(level, tier, sizeMult = 1) {
  const t = Math.min(EVO_TIERS.length, Math.max(1, tier));
  const baseR = EVO_TIERS[t - 1].baseRadius;
  const subLevel = t === 1 ? (level - 1) : (level % 10);
  return baseR * (1 + Math.max(0, subLevel) * 0.042) * sizeMult;
}

function loadOptionalImage(paths) {
  const obj = { img: new Image(), ready: false };
  let idx = 0;
  obj.img.onload = () => { obj.ready = true; };
  obj.img.onerror = () => {
    idx += 1;
    if (idx < paths.length) obj.img.src = paths[idx];
  };
  obj.img.src = paths[0];
  return obj;
}

function isImgOk(obj) {
  return !!(obj && obj.ready && obj.img && obj.img.complete && obj.img.naturalWidth > 0);
}

export class GameRenderer {
  constructor(canvas, miniCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.miniCanvas = miniCanvas;
    this.miniCtx = miniCanvas.getContext("2d");

    this.dpr = 1;
    this.logicalW = window.innerWidth;
    this.logicalH = window.innerHeight;
    this.miniLogicalSize = 150;

    this.foodImg = loadOptionalImage(["./Data/Images/thuc-an.png", "./Data/Images/thuc-an.webp", "./Data/Images/thuc-an.jpg"]);
    this.slashImg = loadOptionalImage(["./Data/Images/slash-effect.png", "./Data/Images/slash-effect.webp"]);
    this.domainImg = loadOptionalImage(["./Data/Images/king-domain.png", "./Data/Images/king-domain.webp"]);

    this.bossVortexImg = loadOptionalImage(["./Data/Images/boss-vortex.png", "./Data/Images/boss-vortex.webp"]);
    this.bossDomainImg = loadOptionalImage(["./Data/Images/boss-domain.png", "./Data/Images/boss-domain.webp"]);
    this.bossTornadoImg = loadOptionalImage(["./Data/Images/boss-tornado.png", "./Data/Images/boss-tornado.webp"]);

    this.itemImgs = {
      speed: loadOptionalImage(["./Data/Images/item-speed.png", "./Data/Images/item-speed.webp"]),
      magnet: loadOptionalImage(["./Data/Images/item-magnet.png", "./Data/Images/item-magnet.webp"]),
      exp: loadOptionalImage(["./Data/Images/item-exp.png", "./Data/Images/item-exp.webp"]),
      poison: loadOptionalImage(["./Data/Images/item-poison.png", "./Data/Images/item-poison.webp"]),
      luck: loadOptionalImage(["./Data/Images/item-luck.png", "./Data/Images/item-luck.webp"]),
      aoma: loadOptionalImage(["./Data/Images/item-aoma.png", "./Data/Images/item-aoma.webp"]),
      ironman: loadOptionalImage(["./Data/Images/item-ironman.png", "./Data/Images/item-ironman.webp"])
    };

    this.skillImgs = {
      swordWave: loadOptionalImage(["./Data/Images/skill-sword-wave.png", "./Data/Images/skill-sword-wave.webp"]),
      swordStorm: loadOptionalImage(["./Data/Images/skill-sword-storm.png", "./Data/Images/skill-sword-storm.webp"]),
      turtleQuake: loadOptionalImage(["./Data/Images/skill-turtle-quake.png", "./Data/Images/skill-turtle-quake.webp"]),
      turtleBarrier: loadOptionalImage(["./Data/Images/skill-turtle-barrier.png", "./Data/Images/skill-turtle-barrier.webp"]),
      birdBolt: loadOptionalImage(["./Data/Images/skill-bird-bolt.png", "./Data/Images/skill-bird-bolt.webp"]),
      kingGuard: loadOptionalImage(["./Data/Images/skill-king-guard.png", "./Data/Images/skill-king-guard.webp"]),
      kingPillar: loadOptionalImage(["./Data/Images/skill-king-pillar.png", "./Data/Images/skill-king-pillar.webp"])
    };

    this.fishSpriteCache = {};

    this.corals = Array.from({ length: 180 }, () => ({
      x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE,
      r: 30 + Math.random() * 70, hue: 160 + Math.random() * 180
    }));
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.logicalW = window.innerWidth;
    this.logicalH = window.innerHeight;
    this.canvas.width = Math.floor(this.logicalW * this.dpr);
    this.canvas.height = Math.floor(this.logicalH * this.dpr);

    const rect = this.miniCanvas.getBoundingClientRect();
    this.miniLogicalSize = rect.width > 10 ? rect.width : (this.logicalW <= 768 ? 92 : 150);
    this.miniCanvas.width = Math.floor(this.miniLogicalSize * this.dpr);
    this.miniCanvas.height = Math.floor(this.miniLogicalSize * this.dpr);
  }

  _getFishSprite(species, tier) {
    const key = species === "boss" ? "boss" : `${species}-${tier}`;
    if (!this.fishSpriteCache[key]) {
      const entry = { img: new Image(), ready: false };
      entry.img.onload = () => { entry.ready = true; };
      entry.img.src = `./Data/Images/${key}.png`;
      this.fishSpriteCache[key] = entry;
    }
    return this.fishSpriteCache[key];
  }

  renderWorld(state) {
    const { ctx, logicalW: w, logicalH: h, dpr } = this;
    const {
      camera, bubbles, foods, mapItems, poisonClouds, projectiles, afterimages,
      aiFishes, remotePlayers, bossesState, myFish, effStats, domainCheck,
      biteEffects, reflectEffects, visualRings, screenSlashes, judgmentPillars, floatingTexts, top1Uid
    } = state;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const viewScale = Math.min(1.0, Math.max(0.56, Math.min(w, h) / 760));
    const halfW = (w / 2) / viewScale + 140, halfH = (h / 2) / viewScale + 140;
    const minX = camera.x - halfW, maxX = camera.x + halfW, minY = camera.y - halfH, maxY = camera.y + halfH;
    const inView = (ox, oy, pad = 0) => ox >= minX - pad && ox <= maxX + pad && oy >= minY - pad && oy <= maxY + pad;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0b5b8c"); grad.addColorStop(0.55, "#053356"); grad.addColorStop(1, "#02182b");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

    ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = "#a5f3fc";
    for (let i = 0; i < 6; i++) {
      const rx = ((i * 340 - camera.x * 0.2) % (w + 400)) - 100;
      ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx + 120, 0); ctx.lineTo(rx + 280, h); ctx.lineTo(rx + 40, h); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(viewScale, viewScale); ctx.translate(-camera.x, -camera.y);
    ctx.strokeStyle = "rgba(77, 184, 255, 0.5)"; ctx.lineWidth = 10; ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);

    this.corals.forEach(c => {
      if (!inView(c.x, c.y, c.r)) return;
      ctx.fillStyle = `hsla(${c.hue}, 55%, 32%, 0.22)`; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
    });
    bubbles.forEach(b => {
      if (!inView(b.x, b.y, 10)) return;
      ctx.strokeStyle = "rgba(200, 244, 255, 0.35)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
    });

    const t = performance.now() / 1000, nowMs = Date.now();

    Object.values(bossesState).forEach(b => {
      if (!b || !b.alive) return;
      if ((b.absUntil || 0) > nowMs) this._drawBossDomain(b.x, b.y, BOSS_VISION_RADIUS, t);
      if ((b.vortexUntil || 0) > nowMs) this._drawBossVortex(b.x, b.y, BOSS_VORTEX_RADIUS, t);
    });

    const mySpec = myFish ? getFishConfig(myFish.species).skills[3] : null;
    if (myFish && myFish.ultTimer > 0 && mySpec?.domainRadius) this._drawDomain(myFish.x, myFish.y, mySpec.domainRadius, t);
    Object.values(remotePlayers).forEach(p => {
      const sp = getFishConfig(p.species).skills[3];
      if (p.ultActive && sp?.domainRadius) this._drawDomain(p.x, p.y, sp.domainRadius, t);
    });

    // Thái Cổ Kết Giới (Skill Cuối Rùa Cấp 40)
    if (myFish?.ultFinisher?.type === "turtleBarrier") {
      this._drawTurtleBarrier(myFish.x, myFish.y, myFish.ultFinisher.radius, t);
    }

    (poisonClouds || []).forEach(pc => {
      if (!inView(pc.x, pc.y, pc.radius)) return;
      ctx.save(); ctx.globalAlpha = Math.min(1, pc.life / pc.maxLife) * 0.55;
      const pg = ctx.createRadialGradient(pc.x, pc.y, pc.radius * 0.15, pc.x, pc.y, pc.radius);
      pg.addColorStop(0, "rgba(74, 222, 128, 0.85)"); pg.addColorStop(0.6, "rgba(22, 163, 74, 0.5)"); pg.addColorStop(1, "rgba(21, 128, 61, 0)");
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(pc.x, pc.y, pc.radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });

    (mapItems || []).forEach(it => {
      if (!inView(it.x, it.y, 40)) return;
      const bob = Math.sin(t * 3.5 + it.phase) * 4, imgObj = this.itemImgs[it.type];
      ctx.save(); ctx.translate(it.x, it.y + bob);
      const og = ctx.createRadialGradient(0, 0, 4, 0, 0, 26);
      og.addColorStop(0, "rgba(255,255,255,0.45)"); og.addColorStop(0.6, it.color + "66"); og.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = og; ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
      if (isImgOk(imgObj)) ctx.drawImage(imgObj.img, -20, -20, 40, 40);
      else {
        ctx.fillStyle = "rgba(6, 28, 49, 0.9)"; ctx.strokeStyle = it.color; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.font = it.fallbackText ? "bold 12px Segoe UI" : "18px Segoe UI"; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(it.fallbackText || it.icon, 0, 1);
      }
      ctx.restore();
    });

    foods.forEach(f => {
      if (!inView(f.x, f.y, 40)) return;
      const pulse = Math.sin(t * 3.5 + f.phase) * 1.5, bobY = Math.sin(t * 2.5 + f.phase) * 3;
      if (isImgOk(this.foodImg)) {
        const size = (f.r * 5.2) + pulse * 2;
        if (f.val > 20) {
          ctx.save(); ctx.globalAlpha = 0.38 + Math.sin(t * 5 + f.phase) * 0.12;
          ctx.fillStyle = "#ffd43b"; ctx.beginPath(); ctx.arc(f.x, f.y + bobY, size * 0.38, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        ctx.drawImage(this.foodImg.img, f.x - size / 2, f.y + bobY - size / 2, size, size);
      } else {
        ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.r + pulse, 0, Math.PI * 2); ctx.fill();
      }
    });

    // Vòng sóng kỹ năng (Chấn động / Hoàng uy / Long ngâm)
    (visualRings || []).forEach(vr => {
      const a = vr.life / vr.maxLife;
      ctx.save(); ctx.globalAlpha = a * 0.85; ctx.translate(vr.x, vr.y);
      const curR = vr.radius * (1.1 - a * 0.45);
      const imgObj = vr.spriteKey ? this.skillImgs[vr.spriteKey] : null;
      if (isImgOk(imgObj)) ctx.drawImage(imgObj.img, -curR, -curR, curR * 2, curR * 2);
      else {
        ctx.strokeStyle = vr.color || "#fde047"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, 0, curR, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    });

    // Đạn & Kiếm khí
    projectiles.forEach(pr => {
      ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(pr.angle || Math.atan2(pr.vy, pr.vx));
      const imgObj = pr.spriteKey ? this.skillImgs[pr.spriteKey] : null;
      const rad = pr.radius || 14;
      if (isImgOk(imgObj)) {
        ctx.drawImage(imgObj.img, -rad * 1.4, -rad * 1.4, rad * 2.8, rad * 2.8);
      } else if (pr.spriteKey === "swordWave") {
        ctx.strokeStyle = "#e0f2fe"; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(-10, 0, rad, -1.1, 1.1); ctx.stroke();
      } else {
        ctx.fillStyle = pr.color; ctx.beginPath(); ctx.arc(0, 0, rad * 0.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });

    afterimages.forEach(af => {
      ctx.save(); ctx.globalAlpha = (af.life / af.maxLife) * 0.48;
      this._drawFish(af.x, af.y, af.angle, af.species, af.level, af.tier, af.sizeMult, "", 1, 1, false, false, false, 0, false, false, 0, "", t, true);
      ctx.restore();
    });

    const myDomRadius = (myFish && myFish.ultTimer > 0 && mySpec?.domainRadius) || 0;

    aiFishes.forEach(ai => {
      if (!inView(ai.x, ai.y, 140)) return;
      const lbl = ai.elite ? `⭐ ${ai.name} [Cấp ${ai.level}]` : `${ai.name} [Cấp ${ai.level}]`;
      this._drawFish(ai.x, ai.y, ai.angle, ai.species, ai.level, ai.tier, 1, lbl, ai.hp, ai.maxHp, ai.elite, false, false, 0, false, !!ai.suppressed, ai.stunTimer || 0, "", t, false);
    });

    Object.values(remotePlayers).forEach(p => {
      const pSup = myDomRadius > 0 && Math.hypot(p.x - myFish.x, p.y - myFish.y) <= myDomRadius;
      this._drawFish(p.x, p.y, p.angle, p.species, p.level || 1, p.tier || 1, p.sizeMult || 1, p.name, p.hp, p.maxHp, p.uid === top1Uid, false, p.shield, p.chomping ? 0.8 : 0, !!p.ultActive, pSup, p.stunned ? 1 : 0, "", t, false);
    });

    Object.values(bossesState).forEach(b => {
      if (!b || !b.alive) return;
      const bSup = myDomRadius > 0 && Math.hypot(b.x - myFish.x, b.y - myFish.y) <= myDomRadius;
      const isHungry = (b.hungryUntil || 0) > nowMs, isAbs = (b.absUntil || 0) > nowMs;
      const bossBuffLabel = isAbs ? "🔥 SỨC MẠNH TUYỆT ĐỐI" : (isHungry ? "💢 CON MỒI TRƯỚC MẮT" : "");
      this._drawFish(b.x, b.y, b.angle || 0, "boss", b.level || 10, b.tier || 2, 1.35, `${b.name} (Cấp ${b.level || 10})`, b.hp, b.maxHp, false, true, isAbs, 0.35, isHungry || isAbs, bSup, 0, bossBuffLabel, t, false);
    });

    if (myFish) {
      // Cận Vệ Hoàng Kim xoay quanh Cá Vua
      (myFish.kingGuards || []).forEach(g => {
        const ga = t * 3.5 + g.angleOffset;
        const gx = myFish.x + Math.cos(ga) * 125, gy = myFish.y + Math.sin(ga) * 125;
        ctx.save(); ctx.translate(gx, gy); ctx.rotate(ga + Math.PI / 2);
        if (isImgOk(this.skillImgs.kingGuard)) ctx.drawImage(this.skillImgs.kingGuard.img, -28, -28, 56, 56);
        else {
          ctx.fillStyle = "#facc15"; ctx.beginPath(); ctx.ellipse(0, 0, 22, 11, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
        }
        ctx.restore();
      });

      const chomp = myFish.chompTimer > 0 ? myFish.chompTimer / 0.22 : 0;
      const flyScale = myFish.knockbackFly ? (1 + Math.sin(myFish.knockbackFly.progress * Math.PI) * 0.45) : 1;
      const rollSpin = myFish.rollTimer > 0 ? t * 18 : myFish.angle;
      const finLabel = myFish.ultFinisher?.type === "birdMeteor" ? "☄️ LƯU TINH HỦY DIỆT" : "";
      this._drawFish(myFish.x, myFish.y, rollSpin, myFish.species, myFish.level, myFish.tier, myFish.sizeMult * flyScale, myFish.name, myFish.hp, effStats.maxHp, myFish.uid === top1Uid, false, myFish.shieldTimer > 0, chomp, myFish.ultTimer > 0, domainCheck.suppressed, myFish.stunTimer, finLabel, t, false);
    }

    Object.values(bossesState).forEach(b => {
      if (b?.alive && b.rangedStrike && nowMs <= b.rangedStrike.expiresAt) this._drawBossTornado(b.rangedStrike, nowMs, t);
    });

    // Hải Vương Phán Quyết: Cột Sét Long Ấn giáng xuống đầu địch
    (judgmentPillars || []).forEach(jp => {
      const a = jp.life / jp.maxLife;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(jp.x, jp.y);
      if (isImgOk(this.skillImgs.kingPillar)) {
        ctx.drawImage(this.skillImgs.kingPillar.img, -80, -280, 160, 320);
      } else {
        const bg = ctx.createLinearGradient(-35, 0, 35, 0);
        bg.addColorStop(0, "rgba(251,191,36,0)"); bg.addColorStop(0.5, "#fef08a"); bg.addColorStop(1, "rgba(251,191,36,0)");
        ctx.fillStyle = bg; ctx.fillRect(-35, -320, 70, 330);
        ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, 62 * (1.2 - a * 0.3), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    });

    // Vạn Kiếm Trảm Không: Vết kiếm chém đan xen khắp màn hình
    (screenSlashes || []).forEach(sl => {
      const a = sl.life / sl.maxLife;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(sl.x, sl.y); ctx.rotate(sl.angle);
      if (isImgOk(this.skillImgs.swordStorm)) {
        ctx.drawImage(this.skillImgs.swordStorm.img, -sl.len / 2, -45, sl.len, 90);
      } else {
        ctx.strokeStyle = "#e0f2fe"; ctx.lineWidth = 5 * a + 2;
        ctx.beginPath(); ctx.moveTo(-sl.len / 2, 0); ctx.lineTo(sl.len / 2, 0); ctx.stroke();
        ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 12 * a;
        ctx.globalAlpha = a * 0.4;
        ctx.beginPath(); ctx.moveTo(-sl.len / 2, 0); ctx.lineTo(sl.len / 2, 0); ctx.stroke();
      }
      ctx.restore();
    });

    this._drawBiteEffects(biteEffects);
    this._drawReflectEffects(reflectEffects);

    floatingTexts.forEach(ft => {
      ctx.font = `bold ${Math.round(16 * (ft.scale || 1))}px Segoe UI`;
      ctx.fillStyle = ft.color; ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.lineWidth = 3;
      ctx.strokeText(ft.text, ft.x, ft.y); ctx.fillText(ft.text, ft.x, ft.y);
    });

    ctx.restore();
  }

  _drawTurtleBarrier(x, y, radius, t) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y);
    if (isImgOk(this.skillImgs.turtleBarrier)) {
      ctx.rotate(t * 0.6); ctx.globalAlpha = 0.72;
      ctx.drawImage(this.skillImgs.turtleBarrier.img, -radius, -radius, radius * 2, radius * 2);
    } else {
      const g = ctx.createRadialGradient(0, 0, radius * 0.7, 0, 0, radius);
      g.addColorStop(0, "rgba(250, 204, 21, 0.05)");
      g.addColorStop(0.85, "rgba(234, 179, 8, 0.25)");
      g.addColorStop(1, "rgba(254, 240, 138, 0.85)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fef08a"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

    // Thức ăn
    foods.forEach(f => {
      if (!inView(f.x, f.y, 40)) return;
      const pulse = Math.sin(t * 3.5 + f.phase) * 1.5;
      const bobY = Math.sin(t * 2.5 + f.phase) * 3;
      if (isImgOk(this.foodImg)) {
        const size = (f.r * 5.2) + pulse * 2;
        if (f.val > 20) {
          ctx.save(); ctx.globalAlpha = 0.38 + Math.sin(t * 5 + f.phase) * 0.12;
          ctx.fillStyle = "#ffd43b"; ctx.beginPath(); ctx.arc(f.x, f.y + bobY, size * 0.38, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        ctx.drawImage(this.foodImg.img, f.x - size / 2, f.y + bobY - size / 2, size, size);
      } else {
        ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.r + pulse, 0, Math.PI * 2); ctx.fill();
      }
    });

    projectiles.forEach(pr => {
      ctx.fillStyle = pr.color; ctx.beginPath(); ctx.arc(pr.x, pr.y, 10, 0, Math.PI * 2); ctx.fill();
    });

    afterimages.forEach(af => {
      ctx.save();
      ctx.globalAlpha = (af.life / af.maxLife) * 0.48;
      this._drawFish(af.x, af.y, af.angle, af.species, af.level, af.tier, af.sizeMult, "", 1, 1, false, false, false, 0, false, false, 0, "", t, true);
      ctx.restore();
    });

    const myDomRadius = (myFish && myFish.ultTimer > 0 && getFishConfig(myFish.species).ultimate.domainRadius) || 0;

    aiFishes.forEach(ai => {
      if (!inView(ai.x, ai.y, 120)) return;
      this._drawFish(ai.x, ai.y, ai.angle, ai.species, ai.level, ai.tier, 1, ai.name, ai.hp, ai.maxHp, false, false, false, 0, false, !!ai.suppressed, 0, "", t, false);
    });

    Object.values(remotePlayers).forEach(p => {
      const pSuppressed = myDomRadius > 0 && Math.hypot(p.x - myFish.x, p.y - myFish.y) <= myDomRadius;
      this._drawFish(p.x, p.y, p.angle, p.species, p.level || 1, p.tier || 1, p.sizeMult || 1, p.name, p.hp, p.maxHp, p.uid === top1Uid, false, p.shield, p.chomping ? 0.8 : 0, !!p.ultActive, pSuppressed, p.stunned ? 1 : 0, "", t, false);
    });

    Object.values(bossesState).forEach(b => {
      if (!b || !b.alive) return;
      const bSuppressed = myDomRadius > 0 && Math.hypot(b.x - myFish.x, b.y - myFish.y) <= myDomRadius;
      const isHungry = (b.hungryUntil || 0) > nowMs;
      const isAbs = (b.absUntil || 0) > nowMs;
      const bossBuffLabel = isAbs ? "🔥 SỨC MẠNH TUYỆT ĐỐI" : (isHungry ? "💢 CON MỒI TRƯỚC MẮT" : "");
      this._drawFish(b.x, b.y, b.angle || 0, "boss", b.level || 10, b.tier || 2, 1.35, `${b.name} (Cấp ${b.level || b.tier * 5})`, b.hp, b.maxHp, false, true, isAbs, 0.35, isHungry || isAbs, bSuppressed, 0, bossBuffLabel, t, false);
    });

    if (myFish) {
      const chomp = myFish.chompTimer > 0 ? myFish.chompTimer / 0.22 : 0;
      const flyScale = myFish.knockbackFly ? (1 + Math.sin(myFish.knockbackFly.progress * Math.PI) * 0.45) : 1;
      this._drawFish(myFish.x, myFish.y, myFish.angle, myFish.species, myFish.level, myFish.tier, myFish.sizeMult * flyScale, myFish.name, myFish.hp, effStats.maxHp, myFish.uid === top1Uid, false, myFish.shieldTimer > 0, chomp, myFish.ultTimer > 0, domainCheck.suppressed, myFish.stunTimer, "", t, false);
    }

    Object.values(bossesState).forEach(b => {
      if (!b || !b.alive || !b.rangedStrike) return;
      if (nowMs <= b.rangedStrike.expiresAt) {
        this._drawBossTornado(b.rangedStrike, nowMs, t);
      }
    });

    this._drawBiteEffects(biteEffects);
    this._drawReflectEffects(reflectEffects);

    floatingTexts.forEach(ft => {
      ctx.font = `bold ${Math.round(16 * (ft.scale || 1))}px Segoe UI`;
      ctx.fillStyle = ft.color; ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.lineWidth = 3;
      ctx.strokeText(ft.text, ft.x, ft.y); ctx.fillText(ft.text, ft.x, ft.y);
    });

    ctx.restore();
  }

  renderMinimap(myFish, remotePlayers, bossesState, top1Uid) {
    const mw = this.miniLogicalSize, mctx = this.miniCtx;
    mctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    mctx.clearRect(0, 0, mw, mw);
    const scale = mw / MAP_SIZE;

    Object.values(remotePlayers).forEach(p => {
      const mx = p.x * scale, my = p.y * scale;
      if (p.uid === top1Uid) { mctx.font = "12px Segoe UI"; mctx.textAlign = "center"; mctx.fillText("👑", mx, my + 4); }
      else { mctx.fillStyle = "#ffd43b"; mctx.beginPath(); mctx.arc(mx, my, 3.2, 0, Math.PI * 2); mctx.fill(); }
    });

    Object.values(bossesState).forEach(b => {
      if (b && b.alive) {
        mctx.fillStyle = "#ff3b3b"; mctx.beginPath(); mctx.arc(b.x * scale, b.y * scale, 4.8, 0, Math.PI * 2); mctx.fill();
      }
    });

    if (myFish) {
      const mx = myFish.x * scale, my = myFish.y * scale;
      if (myFish.uid === top1Uid) { mctx.font = "12px Segoe UI"; mctx.textAlign = "center"; mctx.fillText("👑", mx, my + 4); }
      else { mctx.fillStyle = "#51cf66"; mctx.beginPath(); mctx.arc(mx, my, 3.8, 0, Math.PI * 2); mctx.fill(); }
    }
  }

  _drawBossVortex(x, y, radius, t) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-t * 3.5);
    if (isImgOk(this.bossVortexImg)) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.bossVortexImg.img, -radius, -radius, radius * 2, radius * 2);
    } else {
      const g = ctx.createRadialGradient(0, 0, 20, 0, 0, radius);
      g.addColorStop(0, "rgba(56, 189, 248, 0.05)");
      g.addColorStop(0.6, "rgba(14, 165, 233, 0.35)");
      g.addColorStop(1, "rgba(186, 230, 253, 0.7)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#e0f2fe"; ctx.lineWidth = 3;
      for (let arm = 0; arm < 4; arm++) {
        ctx.save(); ctx.rotate((Math.PI / 2) * arm); ctx.beginPath();
        for (let a = 0; a < 2.2; a += 0.2) {
          const rr = (a / 2.2) * radius, px = Math.cos(a * 2.2) * rr, py = Math.sin(a * 2.2) * rr;
          if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
  }

  _drawBossDomain(x, y, radius, t) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = 0.28;
    if (isImgOk(this.bossDomainImg)) {
      ctx.rotate(t * 0.25);
      ctx.drawImage(this.bossDomainImg.img, -radius, -radius, radius * 2, radius * 2);
    } else {
      const g = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
      g.addColorStop(0, "rgba(126, 34, 206, 0.15)");
      g.addColorStop(0.75, "rgba(190, 18, 60, 0.42)");
      g.addColorStop(1, "rgba(244, 63, 94, 0.85)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(t * 0.3); ctx.strokeStyle = "#fda4af"; ctx.lineWidth = 5; ctx.setLineDash([28, 16]);
      ctx.beginPath(); ctx.arc(0, 0, radius - 6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
  }

  _drawBossTornado(strike, nowMs, t) {
    const ctx = this.ctx, isTriggered = nowMs >= strike.triggerAt;
    ctx.save(); ctx.translate(strike.x, strike.y);
    ctx.strokeStyle = isTriggered ? "#38bdf8" : "#facc15"; ctx.lineWidth = 3;
    ctx.fillStyle = isTriggered ? "rgba(56, 189, 248, 0.25)" : "rgba(250, 204, 21, 0.18)";
    ctx.beginPath(); ctx.arc(0, 0, strike.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    if (isTriggered) {
      if (isImgOk(this.bossTornadoImg)) {
        const w = strike.radius * 2.4, h = strike.radius * 3.0;
        ctx.drawImage(this.bossTornadoImg.img, -w / 2, -h * 0.78, w, h);
      } else {
        for (let i = 0; i < 6; i++) {
          const prog = i / 5, ry = -prog * strike.radius * 1.9, rx = Math.sin(t * 18 + i) * 10, rw = strike.radius * (0.35 + prog * 0.75);
          ctx.strokeStyle = i % 2 === 0 ? "#bae6fd" : "#38bdf8"; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.ellipse(rx, ry, rw, rw * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  _drawBiteEffects(biteEffects) {
    const ctx = this.ctx;
    biteEffects.forEach(ef => {
      const alpha = ef.life / ef.maxLife;
      ctx.save(); ctx.globalAlpha = alpha;
      if (ef.critSpark) {
        ctx.strokeStyle = "#ff922b"; ctx.lineWidth = 4;
        for (let k = 0; k < 8; k++) {
          const a = (Math.PI * 2 * k) / 8;
          ctx.beginPath(); ctx.moveTo(ef.x + Math.cos(a) * 8, ef.y + Math.sin(a) * 8);
          ctx.lineTo(ef.x + Math.cos(a) * ef.radius * (1.2 - alpha * 0.4), ef.y + Math.sin(a) * ef.radius * (1.2 - alpha * 0.4)); ctx.stroke();
        }
      } else if (ef.effectType === "swordSlash") {
        ctx.translate(ef.x, ef.y); ctx.rotate(ef.angle);
        if (isImgOk(this.slashImg)) {
          const sz = ef.radius * 2.5;
          ctx.drawImage(this.slashImg.img, -sz * 0.35, -sz / 2, sz, sz);
        } else {
          const R = ef.radius * 1.15;
          const g = ctx.createLinearGradient(-R * 0.3, -R, R * 0.9, R);
          g.addColorStop(0, "rgba(56, 189, 248, 0.2)"); g.addColorStop(0.5, "#e0f2fe"); g.addColorStop(1, "rgba(56, 189, 248, 0.2)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0, 0, R, -1.25, 1.25); ctx.quadraticCurveTo(R * 0.35, 0, Math.cos(-1.25) * R, Math.sin(-1.25) * R); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-R * 0.2, -R * 0.9); ctx.lineTo(R * 1.15, R * 0.9); ctx.stroke();
        }
      } else {
        const progress = 1 - alpha, snap = Math.min(1, progress * 1.65), R = ef.radius * 0.88, jawGap = R * 0.72 * (1 - snap * 0.86);
        ctx.translate(ef.x, ef.y); ctx.rotate(ef.angle);
        if (Math.cos(ef.angle) < 0) ctx.scale(1, -1);
        const drawJaw = (dir) => {
          ctx.save(); ctx.translate(0, -dir * jawGap);
          ctx.strokeStyle = "rgba(225, 29, 72, 0.85)"; ctx.lineWidth = Math.max(2.5, R * 0.11);
          ctx.beginPath(); ctx.moveTo(-R * 0.62, -dir * R * 0.08); ctx.quadraticCurveTo(0, -dir * R * 0.34, R * 0.62, -dir * R * 0.08); ctx.stroke();
          ctx.fillStyle = "#fff5f5"; ctx.strokeStyle = "#be123c"; ctx.lineWidth = 1.3;
          [-0.14, 0.14].forEach(pos => {
            ctx.beginPath(); ctx.moveTo(R * (pos - 0.08), -dir * R * 0.1); ctx.lineTo(R * pos, dir * R * 0.24); ctx.lineTo(R * (pos + 0.08), -dir * R * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
          });
          [-1, 1].forEach(side => {
            const bx = side * R * 0.4, fg = ctx.createLinearGradient(bx, -dir * R * 0.12, bx, dir * R * 0.68);
            fg.addColorStop(0, "#ffffff"); fg.addColorStop(0.75, "#ffe4e6"); fg.addColorStop(1, "#fda4af");
            ctx.fillStyle = fg; ctx.strokeStyle = "#9f1239"; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(bx - side * R * 0.15, -dir * R * 0.14);
            ctx.quadraticCurveTo(bx + side * R * 0.04, dir * R * 0.28, bx - side * R * 0.05, dir * R * 0.66);
            ctx.quadraticCurveTo(bx - side * R * 0.08, dir * R * 0.25, bx + side * R * 0.12, -dir * R * 0.12);
            ctx.closePath(); ctx.fill(); ctx.stroke();
          });
          ctx.restore();
        };
        drawJaw(1); drawJaw(-1);
        if (snap > 0.7) { ctx.strokeStyle = "#fff1f2"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-R * 0.75, 0); ctx.lineTo(R * 0.75, 0); ctx.stroke(); }
      }
      ctx.restore();
    });
  }

  _drawReflectEffects(reflectEffects) {
    const ctx = this.ctx;
    reflectEffects.forEach(rf => {
      const a = rf.life / rf.maxLife;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(rf.x, rf.y);
      const rad = 46 * (1.2 - a * 0.4); ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 4;
      for (let k = 0; k < 10; k++) {
        const ang = (Math.PI * 2 * k) / 10 + a * 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(ang) * 10, Math.sin(ang) * 10); ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad); ctx.stroke();
      }
      ctx.fillStyle = "rgba(245, 158, 11, 0.35)"; ctx.beginPath(); ctx.arc(0, 0, rad * 0.65, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }

  _drawDomain(x, y, radius, t) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y);
    if (isImgOk(this.domainImg)) {
      ctx.rotate(t * 0.4); ctx.globalAlpha = 0.72;
      ctx.drawImage(this.domainImg.img, -radius, -radius, radius * 2, radius * 2);
    } else {
      const grad = ctx.createRadialGradient(0, 0, radius * 0.15, 0, 0, radius);
      grad.addColorStop(0, "rgba(251, 191, 36, 0.10)"); grad.addColorStop(0.7, "rgba(185, 28, 28, 0.18)"); grad.addColorStop(1, "rgba(245, 158, 11, 0.42)");
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(t * 0.45); ctx.strokeStyle = "rgba(253, 224, 71, 0.85)"; ctx.lineWidth = 3; ctx.setLineDash([18, 10]);
      ctx.beginPath(); ctx.arc(0, 0, radius - 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
  }

  _drawSuperSaiyanAura(r, t) {
    const ctx = this.ctx;
    ctx.save();
    const flameCount = 14;
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      const baseR = pass === 0 ? r * 1.48 : r * 1.25;
      for (let i = 0; i <= flameCount * 2; i++) {
        const ang = (Math.PI * 2 * i) / (flameCount * 2);
        const flicker = Math.sin(t * 24 + i * 2.1 + pass) * (r * 0.16);
        const upBias = Math.sin(ang) < 0 ? Math.abs(Math.sin(ang)) * r * 0.32 : 0;
        const rad = (i % 2 === 0 ? baseR + r * 0.36 + upBias : baseR * 0.85) + flicker;
        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = pass === 0 ? "rgba(250, 204, 21, 0.42)" : "rgba(254, 249, 195, 0.58)"; ctx.fill();
      ctx.strokeStyle = pass === 0 ? "#f59e0b" : "#fef08a"; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  }

  // Khiên Đất Tổ Ong nhẹ & tối ưu (không dùng clip() tránh giật/đơ)
  _drawHoneycombShield(r, t) {
    const ctx = this.ctx;
    const safeR = Math.max(12, Math.min(200, r || 24));
    const shieldR = safeR * 1.48;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, shieldR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(234, 179, 8, 0.25)";
    ctx.fill();

    // Vẽ tổ ong 7 ô lục giác gọn nhẹ ngay giữa khiên
    const hexR = Math.max(10, shieldR * 0.34);
    const dx = hexR * 1.5;
    const dy = hexR * 1.732;
    const offsets = [
      [0, 0],
      [0, -dy], [0, dy],
      [-dx, -dy * 0.5], [-dx, dy * 0.5],
      [dx, -dy * 0.5], [dx, dy * 0.5]
    ];
    ctx.strokeStyle = "rgba(253, 224, 71, 0.85)";
    ctx.lineWidth = 2;
    offsets.forEach(([ox, oy]) => {
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = (Math.PI / 3) * k;
        const vx = ox + Math.cos(ang) * hexR * 0.92;
        const vy = oy + Math.sin(ang) * hexR * 0.92;
        if (k === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.stroke();
    });

    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, shieldR + Math.sin(t * 10) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawEnergyFin(x, y, len, width, angleOffset, baseColor, glowColor, wag) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angleOffset + wag);
    const grad = ctx.createLinearGradient(0, 0, -len, 0);
    grad.addColorStop(0, baseColor); grad.addColorStop(0.55, glowColor); grad.addColorStop(1, "rgba(255,255,255,0.9)");
    ctx.fillStyle = grad; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-len * 0.45, -width * 1.15, -len, -width * 0.25);
    ctx.quadraticCurveTo(-len * 0.55, width * 0.35, 0, width * 0.25);
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }

  _drawFish(x, y, angle, species, level, tier, sizeMult, name, hp, maxHp, isTop1, isBoss, hasShield, chompRatio, ultActive, isSuppressed, stunSeconds, statusLabel, t, isAfterimage) {
    const ctx = this.ctx;
    const r = getFishRadius(level, tier, sizeMult);
    const fishCfg = isBoss ? null : getFishConfig(species);
    const cfg = isBoss
      ? { color: "#0f172a", midColor: "#1e3a5f", bellyColor: "#cbd5e1", accent: "#38bdf8", finGlow: "#a5f3fc" }
      : fishCfg.visual;

    ctx.save(); ctx.translate(x, y);

    if (!isAfterimage) {
      if (ultActive) this._drawSuperSaiyanAura(r, t);
      else if (tier >= 3 || isBoss) {
        const ag = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.55);
        ag.addColorStop(0, isBoss ? "rgba(56,189,248,0.45)" : "rgba(186,230,253,0.35)"); ag.addColorStop(1, "rgba(0,0,0,0)");
        ctx.save(); ctx.globalAlpha = (isBoss ? 0.34 : 0.12 + (tier - 2) * 0.06) + Math.sin(t * 4) * 0.05;
        ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }

      if (ultActive && fishCfg?.skills?.[3]?.shieldVisual === "honeycomb") {
        this._drawHoneycombShield(r, t);
      } else if (hasShield) {
        ctx.strokeStyle = isBoss ? "#fb7185" : "#51cf66"; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.38, 0, Math.PI * 2); ctx.stroke();
      }
    }

    ctx.save(); ctx.rotate(angle);
    if (Math.cos(angle) < 0) ctx.scale(1, -1);

    const sprite = this._getFishSprite(isBoss ? "boss" : species, tier);
    if (isImgOk(sprite)) {
      const swimTilt = Math.sin(t * (7 + tier * 0.7)) * 0.08, stretch = 1 + Math.sin(t * 9) * 0.03;
      const drawW = r * 3.1, drawH = drawW * (sprite.img.naturalHeight / (sprite.img.naturalWidth || 1));
      ctx.rotate(swimTilt); ctx.translate(chompRatio * r * 0.22, 0); ctx.scale(stretch, 2 - stretch);
      ctx.drawImage(sprite.img, -drawW / 2, -drawH / 2, drawW, drawH);
    } else {
      const swimWag = Math.sin(t * (7.5 + tier * 0.7)) * 0.22, finWag = Math.sin(t * 8.5) * 0.16;
      if (species === "turtle") {
        ctx.fillStyle = cfg.color; ctx.strokeStyle = "#14532d"; ctx.lineWidth = 1.8;
        ctx.save(); ctx.translate(-r * 0.55, r * 0.45); ctx.rotate(0.5 - finWag); ctx.beginPath(); ctx.ellipse(0, 0, r * 0.34, r * 0.15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
        ctx.save(); ctx.translate(r * 0.35, r * 0.52); ctx.rotate(-0.45 + finWag * 1.4); ctx.beginPath(); ctx.ellipse(0, 0, r * 0.46, r * 0.18, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
        ctx.save(); ctx.translate(r * 0.85, 0); ctx.fillStyle = cfg.midColor; ctx.beginPath(); ctx.ellipse(0, -r * 0.05, r * 0.38, r * 0.25, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.rotate(0.1 + chompRatio * 0.45); ctx.fillStyle = cfg.bellyColor; ctx.beginPath(); ctx.moveTo(0, r * 0.05); ctx.lineTo(r * 0.32, r * 0.08); ctx.lineTo(r * 0.05, r * 0.22); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(r * 0.12, -r * 0.1, r * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(r * 0.15, -r * 0.1, r * 0.045, 0, Math.PI * 2); ctx.fill(); ctx.restore();

        const sg = ctx.createRadialGradient(-r * 0.1, -r * 0.3, r * 0.1, 0, 0, r);
        sg.addColorStop(0, cfg.accent); sg.addColorStop(0.6, cfg.color); sg.addColorStop(1, "#14532d");
        ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(-r * 0.95, r * 0.18); ctx.bezierCurveTo(-r * 0.8, -r * 0.92, r * 0.75, -r * 0.88, r * 0.88, r * 0.18);
        ctx.quadraticCurveTo(0, r * 0.35, -r * 0.95, r * 0.18); ctx.closePath(); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = tier >= 3 ? "#ffd43b" : "#8ce99a"; ctx.stroke();
        if (tier >= 3) this._drawEnergyFin(-r * 0.2, -r * 0.62, r * 0.75, r * 0.28, -0.35, cfg.midColor, cfg.finGlow, finWag);
      } else {
        const bodyLen = (isBoss || species === "swordfish") ? r * 1.25 : r * 1.08, bodyH = species === "butterfish" ? r * 0.78 : r * 0.56;
        ctx.save(); ctx.translate(-bodyLen * 0.82, 0); ctx.rotate(swimWag);
        if (tier >= 3 || isBoss) {
          this._drawEnergyFin(0, -bodyH * 0.15, r * 1.15, r * 0.42, -0.35, cfg.midColor, cfg.finGlow, 0);
          this._drawEnergyFin(0, bodyH * 0.15, r * 0.95, r * 0.35, 0.35, cfg.midColor, cfg.finGlow, 0);
        } else {
          const tg = ctx.createLinearGradient(0, 0, -r * 0.9, 0); tg.addColorStop(0, cfg.color); tg.addColorStop(1, cfg.accent);
          ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-r * 0.5, -r * 0.65, -r * 0.92, -r * 0.68);
          ctx.quadraticCurveTo(-r * 0.48, 0, -r * 0.92, r * 0.68); ctx.quadraticCurveTo(-r * 0.5, r * 0.65, 0, 0); ctx.fill();
          ctx.strokeStyle = cfg.bellyColor; ctx.lineWidth = 1.4; ctx.stroke();
        }
        ctx.restore();

        if (tier >= 3 || isBoss) {
          this._drawEnergyFin(r * 0.15, -bodyH * 0.78, r * 1.55, r * 0.36, -0.25, cfg.midColor, cfg.finGlow, finWag * 0.5);
          this._drawEnergyFin(-r * 0.22, -bodyH * 0.68, r * 1.25, r * 0.28, -0.2, cfg.color, cfg.finGlow, -finWag * 0.4);
        } else {
          ctx.fillStyle = cfg.midColor; ctx.beginPath(); ctx.moveTo(r * 0.18, -bodyH * 0.72); ctx.quadraticCurveTo(-r * 0.25, -bodyH * 1.55, -r * 0.58, -bodyH * 0.55); ctx.closePath(); ctx.fill();
        }

        const bg = ctx.createLinearGradient(0, -bodyH, 0, bodyH);
        bg.addColorStop(0, cfg.color); bg.addColorStop(0.52, cfg.midColor); bg.addColorStop(0.75, cfg.bellyColor); bg.addColorStop(1, cfg.bellyColor);
        ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(bodyLen * 0.95, -bodyH * 0.05);
        ctx.bezierCurveTo(bodyLen * 0.45, -bodyH * 1.05, -bodyLen * 0.45, -bodyH * 0.92, -bodyLen * 0.88, -bodyH * 0.14);
        ctx.lineTo(-bodyLen * 0.88, bodyH * 0.16);
        ctx.bezierCurveTo(-bodyLen * 0.45, bodyH * 0.92, bodyLen * 0.35, bodyH * 0.95, bodyLen * 0.86, bodyH * 0.15);
        ctx.closePath(); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = isBoss ? "#38bdf8" : "rgba(255,255,255,0.45)"; ctx.stroke();

        if (species === "swordfish") {
          const sw = ctx.createLinearGradient(bodyLen * 0.75, 0, bodyLen * 1.65, 0); sw.addColorStop(0, cfg.color); sw.addColorStop(1, "#f0f9ff");
          ctx.fillStyle = sw; ctx.beginPath(); ctx.moveTo(bodyLen * 0.78, -bodyH * 0.18); ctx.lineTo(bodyLen * 1.68, -bodyH * 0.02); ctx.lineTo(bodyLen * 0.78, bodyH * 0.14); ctx.closePath(); ctx.fill();
        }
        if (isBoss || tier >= 3 || species === "kingfish") {
          ctx.fillStyle = isBoss ? "#1e293b" : "#ffd43b";
          ctx.beginPath(); ctx.moveTo(bodyLen * 0.55, -bodyH * 0.42); ctx.lineTo(bodyLen * 0.15, -bodyH * 1.25);
          ctx.lineTo(bodyLen * 0.3, -bodyH * 0.55); ctx.lineTo(-bodyLen * 0.05, -bodyH * 1.12); ctx.lineTo(bodyLen * 0.1, -bodyH * 0.52); ctx.closePath(); ctx.fill();
        }

        const jawAngle = (isBoss || species === "kingfish" ? 0.18 : 0.06) + chompRatio * 0.52;
        ctx.save(); ctx.translate(bodyLen * 0.55, bodyH * 0.16); ctx.rotate(jawAngle);
        ctx.fillStyle = "#450a0a"; ctx.beginPath(); ctx.moveTo(0, -bodyH * 0.12); ctx.lineTo(r * 0.45, 0); ctx.lineTo(0, bodyH * 0.14); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#fff";
        for (let k = 0; k < 3; k++) { const tx = r * (0.1 + k * 0.11); ctx.beginPath(); ctx.moveTo(tx, bodyH * 0.08); ctx.lineTo(tx + 3, -bodyH * 0.06); ctx.lineTo(tx + 6, bodyH * 0.08); ctx.fill(); }
        ctx.fillStyle = cfg.bellyColor; ctx.beginPath(); ctx.moveTo(-r * 0.1, bodyH * 0.06); ctx.lineTo(r * 0.46, bodyH * 0.04); ctx.quadraticCurveTo(r * 0.15, bodyH * 0.28, -r * 0.12, bodyH * 0.22); ctx.closePath(); ctx.fill(); ctx.restore();

        const ex = bodyLen * 0.52, ey = -bodyH * 0.22;
        ctx.fillStyle = isBoss ? "#e0f2fe" : "#fff"; ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.16, r * 0.13, -0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = isBoss ? "#0284c7" : "#0f172a"; ctx.beginPath(); ctx.arc(ex + r * 0.04, ey, r * 0.075, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex + r * 0.06, ey - r * 0.04, r * 0.03, 0, Math.PI * 2); ctx.fill();
        if (tier >= 3 || isBoss) this._drawEnergyFin(bodyLen * 0.22, bodyH * 0.35, r * 1.25, r * 0.26, 0.28, cfg.midColor, cfg.finGlow, finWag);
      }
    }
    ctx.restore();

    if (!isAfterimage) {
      const barW = Math.max(56, r * 1.6), barY = -r - 24;
      ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(-barW / 2, barY, barW, 8);
      const hpRatio = Math.max(0, Math.min(1, (hp || 0) / (maxHp || 1)));
      ctx.fillStyle = isBoss ? "#ff3b3b" : "#51cf66"; ctx.fillRect(-barW / 2, barY, barW * hpRatio, 8);
      ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1; ctx.strokeRect(-barW / 2, barY, barW, 8);

      ctx.font = isBoss ? "bold 14px Segoe UI" : "bold 12px Segoe UI";
      ctx.textAlign = "center"; ctx.fillStyle = isBoss ? "#ff8787" : "#fff";
      ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 3;
      const label = `${isTop1 ? "👑 " : ""}${name}`;
      ctx.strokeText(label, 0, barY - 6); ctx.fillText(label, 0, barY - 6);

      if (statusLabel) {
        ctx.font = "bold 12px Segoe UI"; ctx.fillStyle = "#fde047";
        ctx.strokeText(statusLabel, 0, barY - 22); ctx.fillText(statusLabel, 0, barY - 22);
      }
      if (stunSeconds > 0) {
        const stunText = stunSeconds > 0.15 && stunSeconds < 20 ? `💫 CHOÁNG (${stunSeconds.toFixed(1)}s)` : "💫 CHOÁNG!";
        ctx.font = "bold 14px Segoe UI"; ctx.fillStyle = "#facc15";
        ctx.strokeText(stunText, 0, barY - 24); ctx.fillText(stunText, 0, barY - 24);
      }
      if (isSuppressed) {
        ctx.font = "bold 12px Segoe UI"; ctx.fillStyle = "#ff4d6d";
        ctx.strokeText("🩸 Áp chế huyết mạch", 0, r + 22); ctx.fillText("🩸 Áp chế huyết mạch", 0, r + 22);
      }
    }
    ctx.restore();
  }
}