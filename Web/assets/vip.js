/* ============================================================
   vip.js — VIP（整活）系统
   纯公益玩笑：本站免费，"VIP" 只是个梗。
   - 导图"一键展开全部"、闯关"一键解锁全部"需要 VIP；
   - 开通方式：看"广告"（给 GitHub 项目点星，倒计时后自动开通，
     不检测真点没点）或直接开通（也不收费）；
   - VIP 状态存独立 localStorage 键，不进学习存档、不影响备份。
   ============================================================ */
"use strict";

const VIP = {
  KEY: "mayuan.vip.v1",
  REPO_URL: "https://github.com/zhouliangjin-hit/marxism-philosophy-assignment",
  active: false,
  get() {
    if (this.active) return true;
    try { return JSON.parse(localStorage.getItem(this.KEY) || "{}").vip === true; }
    catch { return false; }
  },
  grant() {
    this.active = true;
    try { localStorage.setItem(this.KEY, JSON.stringify({ vip: true, ts: Date.now() })); } catch { /* 忽略 */ }
    document.body.classList.add("is-vip");
    this.badge();
    document.dispatchEvent(new Event("vipchange"));
  },
  /** 需要 VIP 的动作：已是 VIP 直接执行，否则走开通流程，成功后执行原动作 */
  require(action, benefit) {
    if (this.get()) { action(); return; }
    openVipModal(action, benefit);
  },
  badge() {
    if (!this.get() || document.querySelector(".vip-badge")) return;
    const brand = document.querySelector(".brand");
    if (!brand) return;
    const b = document.createElement("span");
    b.className = "vip-badge";
    b.title = "VIP 会员（公益玩笑版，不收费）";
    b.textContent = "👑VIP";
    brand.appendChild(b);
  }
};

function openVipModal(onGranted, benefit) {
  const benefitText = benefit === "unlock" ? "一键解锁全部闯关关卡" : "一键展开全部思维导图";
  const overlay = document.createElement("div");
  overlay.className = "vip-overlay";
  overlay.innerHTML = `
    <div class="vip-card" role="dialog" aria-modal="true" aria-label="VIP 开通">
      <button class="vip-close" aria-label="关闭">✕</button>
      <div class="vip-crown">👑</div>
      <h3>开通 VIP</h3>
      <p class="vip-desc">解锁特权：<strong>${benefitText}</strong><br>
      <span class="muted">（玩笑：本站纯公益，VIP 分文不取）</span></p>
      <button class="btn primary vip-watch">📺 观看广告，免费开通</button>
      <button class="btn gold vip-direct">💎 我是土豪，直接开通</button>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".vip-close").onclick = close;
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
  overlay.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  overlay.querySelector(".vip-close").focus();
  overlay.querySelector(".vip-direct").onclick = () => {
    VIP.grant(); close();
    toast("💎 土豪你好！VIP 已开通（并没有收费）");
    onGranted();
  };
  overlay.querySelector(".vip-watch").onclick = () => {
    overlay.querySelector(".vip-card").innerHTML = `
      <div class="vip-crown">📺</div>
      <h3>广告时间</h3>
      <p class="vip-desc">请给我们的 GitHub 项目点一颗 ⭐<br>
      <a href="${VIP.REPO_URL}" target="_blank" rel="noopener">marxism-philosophy-assignment ↗</a></p>
      <p class="muted" style="font-size:12px">（不检测你点没点，广告放完自动开通）</p>
      <div class="vip-countdown" role="progressbar" aria-label="广告播放进度"><i></i><span>5</span></div>`;
    const bar = overlay.querySelector(".vip-countdown i");
    const num = overlay.querySelector(".vip-countdown span");
    let t = 5, done = false;
    requestAnimationFrame(() => { bar.style.width = "100%"; });
    const timer = setInterval(() => {
      t--;
      if (t <= 0 && !done) {
        done = true;
        clearInterval(timer);
        VIP.grant(); close();
        toast("👑 VIP 开通成功！特权已生效");
        onGranted();
      } else if (!done) {
        num.textContent = t;
      }
    }, 1000);
  };
}

// 页面加载时若已是 VIP，挂上徽标
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => VIP.badge(), { once: true });
} else {
  VIP.badge();
}
