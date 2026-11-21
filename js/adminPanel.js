import { DEFAULT_SERVER_CONFIG, LIVE_CONFIG } from "./config.js";
import { getEventList } from "./registries.js";
import * as svc from "./firebaseService.js";

export class AdminPanel {
  constructor(hooks) {
    this.hooks = hooks; // { getMyFish, isInGame, grantAdminLevels, grantAdminSkillPts, healAdminFull, toggleGodMode, isGodMode, addToast }
    this.modal = document.getElementById("admin-modal");
    this.activeTab = "config";
    this.cachedUsers = [];
    this._renderSkeleton();
  }

  open() {
    this.modal.classList.remove("hidden");
    this._renderTabContent();
  }

  close() {
    this.modal.classList.add("hidden");
  }

  _renderSkeleton() {
    this.modal.innerHTML = `
      <div class="modal-box admin-box">
        <div class="admin-top">
          <h2>🛠️ ADMIN CONTROL PANEL</h2>
          <button id="btn-close-admin" class="chat-close-btn" type="button">✕</button>
        </div>
        <div class="admin-tabs">
          <button class="admin-tab active" data-tab="config" type="button">⚙️ Cấu hình Server</button>
          <button class="admin-tab" data-tab="world" type="button">👹 Thế giới & Boss</button>
          <button class="admin-tab" data-tab="users" type="button">👥 Người chơi & Test</button>
        </div>
        <div id="admin-body" class="admin-body"></div>
      </div>
    `;

    this.modal.querySelector("#btn-close-admin").onclick = () => this.close();
    this.modal.querySelectorAll(".admin-tab").forEach(btn => {
      btn.onclick = () => {
        this.activeTab = btn.dataset.tab;
        this.modal.querySelectorAll(".admin-tab").forEach(b => b.classList.toggle("active", b === btn));
        this._renderTabContent();
      };
    });
  }

  async _renderTabContent() {
    const body = document.getElementById("admin-body");
    if (this.activeTab === "config") {
      this._renderConfigTab(body);
    } else if (this.activeTab === "world") {
      this._renderWorldTab(body);
    } else {
      await this._renderUsersTab(body);
    }
  }

  _renderConfigTab(body) {
    const fields = [
      { key: "foodCount",        label: "Mật độ Mồi ăn",        step: 100 },
      { key: "itemCount",        label: "Số Item Buff trên map", step: 1 },
      { key: "itemRespawnSec",   label: "Hồi Item Buff (giây)",  step: 1 },
      { key: "aomaWeight",       label: "Trọng số Buff Ảo Ma",   step: 1 },
      { key: "aiCount",          label: "Số lượng Cá AI",        step: 2 },
      { key: "bossHpBase",       label: "Máu gốc Boss",          step: 50 },
      { key: "bossHpPerLevel",   label: "Máu Boss / cấp",        step: 10 },
      { key: "bossDmgBase",      label: "Sát thương gốc Boss",   step: 5 },
      { key: "bossDmgPerLevel",  label: "ST Boss / cấp",         step: 0.5 },
      { key: "bossSpeed",        label: "Tốc độ bơi Boss",       step: 0.5 },
      { key: "bossRespawnSec",   label: "Hồi sinh Boss (giây)",  step: 5 },
      { key: "expGlobalMult",    label: "Hệ số EXP toàn map",    step: 0.5 },
      { key: "reviveCost",       label: "Giá Hồi Sinh (Coin)",   step: 10 },
      { key: "kingFishCost",     label: "Giá Cá Vua (Coin)",     step: 10 },
      { key: "eventDurationSec", label: "Thời lượng Event (s)",  step: 5 }
    ];

    body.innerHTML = `
      <div class="admin-grid">
        ${fields.map(f => `
          <label class="admin-field">
            <span>${f.label}</span>
            <input type="number" step="${f.step}" id="adm-cfg-${f.key}" value="${LIVE_CONFIG[f.key]}" />
          </label>
        `).join("")}
      </div>
      <div class="admin-footer-actions">
        <button id="adm-save-cfg" class="btn-revive" type="button">💾 Lưu & Áp Dụng Toàn Server</button>
        <button id="adm-reset-cfg" class="btn-outline" type="button">↩️ Mặc định</button>
      </div>
    `;

    body.querySelector("#adm-save-cfg").onclick = async () => {
      const next = {};
      fields.forEach(f => {
        const v = Number(document.getElementById(`adm-cfg-${f.key}`).value);
        if (Number.isFinite(v) && v >= 0) next[f.key] = v;
      });
      await svc.saveGlobalConfig(next);
      this.hooks.addToast("✅ Đã lưu cấu hình lên CSDL & đồng bộ toàn server!");
    };

    body.querySelector("#adm-reset-cfg").onclick = async () => {
      if (!confirm("Khôi phục toàn bộ thông số server về mặc định?")) return;
      await svc.saveGlobalConfig({ ...DEFAULT_SERVER_CONFIG });
      this._renderConfigTab(body);
      this.hooks.addToast("↩️ Đã khôi phục cấu hình mặc định!");
    };
  }

  _renderWorldTab(body) {
    const events = getEventList();
    body.innerHTML = `
      <div class="admin-section">
        <h4>👹 Triệu Hồi Boss Tùy Chỉnh</h4>
        <div class="admin-grid">
          <label class="admin-field"><span>Tên Boss</span><input type="text" id="adm-b-name" value="Boss Hủy Diệt" /></label>
          <label class="admin-field"><span>Cấp độ</span><input type="number" id="adm-b-lvl" value="25" /></label>
          <label class="admin-field"><span>Máu (HP)</span><input type="number" id="adm-b-hp" value="5000" /></label>
          <label class="admin-field"><span>Sát thương</span><input type="number" id="adm-b-dmg" value="120" /></label>
        </div>
        <div class="admin-row-btns">
          <button id="adm-summon-here" class="btn-small" type="button">📍 Triệu hồi gần tôi</button>
          <button id="adm-summon-center" class="btn-small" type="button">🎯 Triệu hồi giữa map</button>
        </div>
        <div class="admin-row-btns" style="margin-top:8px;">
          <button id="adm-respawn-bosses" class="btn-small" type="button">🔄 Hồi sinh 3 Boss</button>
          <button id="adm-kill-bosses" class="btn-danger" type="button">💀 Xóa toàn bộ Boss</button>
          <button id="adm-reset-map" class="btn-danger" type="button">🗺️ Reset toàn bộ Map</button>
        </div>
      </div>

      <div class="admin-section">
        <h4>🎉 Điều Khiển Sự Kiện (Event)</h4>
        <div class="admin-row-btns">
          <select id="adm-ev-select" class="admin-select">
            ${events.map(e => `<option value="${e.id}">${e.title}</option>`).join("")}
          </select>
          <button id="adm-ev-start" class="btn-small" type="button">▶️ Kích hoạt ngay</button>
          <button id="adm-ev-stop" class="btn-outline" type="button">⏹️ Tắt Event</button>
        </div>
      </div>

      <div class="admin-section">
        <h4>📢 Thông Báo Toàn Server & Chat</h4>
        <div class="admin-row-btns">
          <input type="text" id="adm-broadcast-txt" class="admin-text-input" placeholder="Nhập thông báo gửi toàn bộ người chơi..." />
          <button id="adm-broadcast-send" class="btn-small" type="button">📢 Gửi</button>
          <button id="adm-clear-chat" class="btn-danger" type="button">🧹 Xóa Chat</button>
        </div>
      </div>
    `;

    const doSummon = async (nearMe) => {
      const me = this.hooks.getMyFish();
      const name = body.querySelector("#adm-b-name").value.trim() || "Boss Admin";
      const level = Math.max(1, Number(body.querySelector("#adm-b-lvl").value) || 15);
      const hp = Math.max(100, Number(body.querySelector("#adm-b-hp").value) || 3000);
      const dmg = Math.max(5, Number(body.querySelector("#adm-b-dmg").value) || 80);
      const x = nearMe && me ? Math.round(me.x + 220) : 4800;
      const y = nearMe && me ? Math.round(me.y) : 4800;
      await svc.adminSummonBoss({ name, level, hp, dmg, x, y });
      this.hooks.addToast(`👹 Đã triệu hồi ${name} (Cấp ${level})!`);
    };

    body.querySelector("#adm-summon-here").onclick = () => doSummon(true);
    body.querySelector("#adm-summon-center").onclick = () => doSummon(false);
    body.querySelector("#adm-respawn-bosses").onclick = async () => {
      await svc.adminRespawnDefaultBosses();
      this.hooks.addToast("🔄 Đã hồi sinh toàn bộ 3 Boss mặc định!");
    };
    body.querySelector("#adm-kill-bosses").onclick = async () => {
      await svc.adminKillAllBosses();
      this.hooks.addToast("💀 Đã tiêu diệt toàn bộ Boss trên map!");
    };
    body.querySelector("#adm-reset-map").onclick = async () => {
      await svc.resetWorldMap();
      this.hooks.addToast("🗺️ Đã reset toàn bộ Map về ban đầu!");
    };
    body.querySelector("#adm-ev-start").onclick = async () => {
      const evId = body.querySelector("#adm-ev-select").value;
      await svc.adminTriggerEvent(evId);
      this.hooks.addToast("🎉 Đã kích hoạt sự kiện toàn server!");
    };
    body.querySelector("#adm-ev-stop").onclick = async () => {
      await svc.adminStopEvent();
      this.hooks.addToast("⏹️ Đã tắt sự kiện hiện tại!");
    };
    body.querySelector("#adm-broadcast-send").onclick = async () => {
      const txt = body.querySelector("#adm-broadcast-txt").value.trim();
      if (!txt) return;
      await svc.sendServerBroadcast(txt);
      body.querySelector("#adm-broadcast-txt").value = "";
    };
    body.querySelector("#adm-clear-chat").onclick = async () => {
      if (!confirm("Xóa toàn bộ tin nhắn Chat?")) return;
      await svc.clearAllChat();
      this.hooks.addToast("🧹 Đã dọn sạch khung Chat!");
    };
  }

  async _renderUsersTab(body) {
    body.innerHTML = `<div style="padding:12px;">Đang tải danh sách người chơi...</div>`;
    const inGameNow = this.hooks.isInGame();
    const godOn = this.hooks.isGodMode();
    const users = await svc.fetchAllUsers();
    this.cachedUsers = users;

    body.innerHTML = `
      <div class="admin-section">
        <h4>⚡ Công Cụ Test Nhanh Cho Admin (Trong Trận)</h4>
        <div class="admin-row-btns">
          <button id="adm-lvl-5" class="btn-small" ${!inGameNow ? "disabled" : ""} type="button">⬆️ +5 Cấp</button>
          <button id="adm-lvl-10" class="btn-small" ${!inGameNow ? "disabled" : ""} type="button">⬆️ +10 Cấp</button>
          <button id="adm-sp-5" class="btn-small" ${!inGameNow ? "disabled" : ""} type="button">✨ +5 Điểm Skill</button>
          <button id="adm-heal" class="btn-small" ${!inGameNow ? "disabled" : ""} type="button">❤️ Hồi Đầy Máu</button>
          <button id="adm-god" class="${godOn ? "btn-revive" : "btn-outline"}" ${!inGameNow ? "disabled" : ""} type="button">
            🛡️ God Mode: ${godOn ? "BẬT" : "TẮT"}
          </button>
        </div>
      </div>

      <div class="admin-section">
        <h4>👥 Quản Lý Tài Khoản (${users.length} người chơi)</h4>
        <div class="admin-user-list">
          ${users.map(u => `
            <div class="admin-user-row">
              <div class="au-info">
                <b>${this._esc(u.nickname || "Ẩn danh")}</b>
                <div class="au-sub">🪙 ${u.coins || 0} Coin • 🏆 ${u.bestScore || 0} đ</div>
              </div>
              <div class="au-btns">
                <button class="btn-small au-coin" data-uid="${u.uid}" type="button">Sửa Coin</button>
                <button class="btn-outline au-score" data-uid="${u.uid}" type="button">Reset Điểm</button>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    body.querySelector("#adm-lvl-5").onclick = () => this.hooks.grantAdminLevels(5);
    body.querySelector("#adm-lvl-10").onclick = () => this.hooks.grantAdminLevels(10);
    body.querySelector("#adm-sp-5").onclick = () => this.hooks.grantAdminSkillPts(5);
    body.querySelector("#adm-heal").onclick = () => this.hooks.healAdminFull();
    body.querySelector("#adm-god").onclick = () => {
      this.hooks.toggleGodMode();
      this._renderUsersTab(body);
    };

    body.querySelectorAll(".au-coin").forEach(btn => {
      btn.onclick = async () => {
        const uid = btn.dataset.uid;
        const u = this.cachedUsers.find(x => x.uid === uid);
        const val = prompt(`Nhập số Coin mới cho [${u?.nickname}]:`, String(u?.coins || 0));
        if (val === null) return;
        const num = Math.max(0, Math.floor(Number(val)));
        if (!Number.isFinite(num)) return alert("Số không hợp lệ!");
        await svc.adminUpdateUser(uid, { coins: num });
        this.hooks.onUserDataModified(uid, { coins: num });
        this._renderUsersTab(body);
      };
    });

    body.querySelectorAll(".au-score").forEach(btn => {
      btn.onclick = async () => {
        const uid = btn.dataset.uid;
        if (!confirm("Đặt Best Score của người chơi này về 0?")) return;
        await svc.adminUpdateUser(uid, { bestScore: 0 });
        this.hooks.onUserDataModified(uid, { bestScore: 0 });
        this._renderUsersTab(body);
      };
    });
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
}