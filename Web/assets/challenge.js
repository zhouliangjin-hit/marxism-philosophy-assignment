/* ============================================================
   challenge.js — 闯关模式
   规则（详见 DOCUMENTATION.md 第 4.3 节）：
   - 共 10 关线性解锁：上一关正确率 ≥60%（★）解锁下一关
   - 星级：≥60% ★ / ≥85% ★★ / 100% ★★★，取历史最佳
   - 考试模式作答（答题卡 + 交卷出分），多选少选不得分
   ============================================================ */
"use strict";

const LEVELS = [
  { id: "lv1", name: "哲学起航", sub: "第一章第一节 · 课堂小测1",
    filter: { banks: ["c1s1-q1"] }, intro: "唯物论基础概念热身。" },
  { id: "lv2", name: "物质与意识", sub: "第一章第一节 · 课堂小测2",
    filter: { banks: ["c1s1-q2"] }, intro: "哲学基本问题与物质范畴。" },
  { id: "lv3", name: "辩证之法", sub: "第一章第二&三节 · 课堂练习",
    filter: { banks: ["c1s23"] }, intro: "联系、发展与三大规律。" },
  { id: "lv4", name: "期末试炼", sub: "2024秋期末真题 · 客观题",
    filter: { banks: ["final-2024"] }, intro: "一校三区回忆版原题，全真检验。" },
  { id: "lv5", name: "考研 · 本体论", sub: "考研真题 · 绪论 / 世界物质性 / 规律与能动性",
    filter: { kySections: ["绪论", "世界的物质性", "客观规律性"] }, intro: "考研首轮：唯物论板块。" },
  { id: "lv6", name: "考研 · 辩证法", sub: "考研真题 · 三大规律 / 联系和发展",
    filter: { kySections: ["三大规律", "联系和发展"] }, intro: "量变、否定、对立统一。" },
  { id: "lv7", name: "考研 · 认识论", sub: "考研真题 · 认识和实践 / 真理",
    filter: { kySections: ["认识和实践", "真理"] }, intro: "实践是检验真理的唯一标准。" },
  { id: "lv8", name: "考研 · 历史观", sub: "考研真题 · 历史唯物主义",
    filter: { kySections: ["历史唯物主义", "社会基本矛盾", "阶级", "人民群众", "社会进步"] },
    intro: "社会存在、基本矛盾与人民群众。" },
  { id: "lv9", name: "考研 · 政经初探", sub: "考研真题 · 政治经济学",
    filter: { kySections: ["政治经济学"] }, intro: "商品经济与价值规律。" },
  { id: "lv10", name: "终极挑战", sub: "全题库随机混编",
    filter: { random: 20 }, intro: "融会贯通，冲击满星！" },
];

const starOf = pct => pct >= 100 ? 3 : pct >= 85 ? 2 : pct >= 60 ? 1 : 0;

/** 闯关进度摘要（供关卡页与导图页共用） */
function challengeProgress() {
  const d = Store.data;
  // 第一个未通关关卡的索引：它本身及其之前全部解锁（首关恒解锁）
  const firstUndone = LEVELS.findIndex(l => !((d.levels[l.id] || {}).stars > 0));
  const unlockedUpTo = firstUndone === -1 ? LEVELS.length : firstUndone + 1;
  const totalStars = LEVELS.reduce((s, l) => s + ((d.levels[l.id] || {}).stars || 0), 0);
  return { firstUndone, unlockedUpTo, totalStars };
}

Views.challenge = function () {
  const d = Store.data;
  const { firstUndone, unlockedUpTo, totalStars } = challengeProgress();
  const vip = typeof VIP !== "undefined" && VIP.get();

  $("#view").innerHTML = `
    <h2 class="section-title">闯关模式 <small>CHALLENGE · ${totalStars}/${LEVELS.length * 3} ★</small></h2>
    <div class="challenge-intro">
      <figure class="challenge-figure">
        <img src="${IMG_MANIFESTO}" alt="1848 年《共产党宣言》德文初版扉页" loading="lazy">
        <figcaption>1848 年《共产党宣言》德文初版扉页<span>图片：UNESCO 世界记忆名录</span></figcaption>
      </figure>
      <p class="muted" style="margin-top:-8px">
        规则：考试模式作答，交卷按正确率评星 —— ≥60% 得 ★ 并解锁下一关、≥85% ★★、满分 ★★★；多选题与期末判分标准一致，少选/多选均不得分。</p>
      <p class="muted">闯关不仅是刷题 —— 每通过一关，「闯关导图」中对应分支的知识树也会随之解锁展开。</p>
      <div style="margin:6px 0 2px">
        <button class="btn gold small" id="vipUnlockBtn" title="VIP 特权：直接解锁全部关卡试玩（星级仍需实打实考取）">👑 一键解锁全部关卡</button>
        ${vip ? '<span class="tag gold" style="margin-left:8px">👑 VIP 已解锁全部</span>' : ""}
      </div>
    </div>
    <div class="level-path">
      ${LEVELS.map((l, i) => {
        const rec = d.levels[l.id] || { stars: 0, bestPct: 0, plays: 0 };
        const unlocked = i < unlockedUpTo || vip;
        const qn = pickQuestions(l.filter).length;
        const isNext = i === firstUndone; // 当前待攻关卡（脉冲指引）
        return `
        <div class="level-item ${unlocked ? "unlocked" : "locked"} ${isNext ? "next" : ""}">
          <div class="level-node" data-lv="${i}">${unlocked ? i + 1 : "🔒"}</div>
          <div class="level-body">
            <h3>${escapeHtml(l.name)} ${rec.stars ? "" : '<span class="tag blue" style="font-size:10px">NEW</span>'}</h3>
            <div class="sub">${escapeHtml(l.sub)} · ${qn} 题</div>
            <div class="sub muted" style="font-size:11.5px">${escapeHtml(l.intro)}</div>
            <div class="level-foot">
              <span class="level-stars">${[1, 2, 3].map(n =>
                `<span class="${n <= rec.stars ? "" : "off"}" style="${n <= rec.stars ? "" : "color:var(--line-2)"}">★</span>`).join("")}</span>
              ${rec.plays ? `<span class="level-best">最佳 ${rec.bestPct}% · 已挑战 ${rec.plays} 次</span>` : ""}
              ${unlocked ? `<button class="btn small primary" data-lv="${i}" style="margin-left:auto">
                ${rec.plays ? "再次挑战" : "开始挑战"} ⚑</button>` : `<span class="muted" style="font-size:11.5px;margin-left:auto">通关上一关解锁</span>`}
            </div>
          </div>
        </div>`;
      }).join("")}
    </div>`;

  $("#vipUnlockBtn").onclick = () => VIP.require(() => {
    Views.challenge();
    toast("👑 VIP 特权：全部关卡已解锁，星级自己考！");
  }, "unlock");

  $$("#view [data-lv]").forEach(btn => btn.onclick = () => {
    const lv = LEVELS[+btn.dataset.lv];
    if (+btn.dataset.lv >= unlockedUpTo && !vip) return;
    const qs = pickQuestions(lv.filter);
    startQuiz({
      title: `闯关 · ${lv.name}`,
      questions: qs, mode: "exam", back: "#/challenge",
      onFinish: res => {
        const stars = starOf(res.pct);
        Store.saveLevel(lv.id, { stars, pct: res.pct });
        const next = LEVELS[+btn.dataset.lv + 1];
        return {
          stars,
          message: stars
            ? (next ? `恭喜通关！已解锁下一关「${next.name}」${stars < 3 ? "，可重刷冲击更高星级" : "，满分太棒了！"}`
                      : "恭喜通关全部关卡！")
            : "未达到 60% 通关线，建议回思维导图查漏补缺后再来。",
        };
      },
    });
  });
};
