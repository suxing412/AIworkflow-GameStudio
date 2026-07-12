// pool.js — 拉取制核心（D3）：在池排序 + agent 领单（原子）。
// 领单 = store.move(池→在途)，改名的原子性保证并发同抢只有一个成功。
const store = require('./core/store');
const gates = require('./gates');

const PRI = { P0: 0, P1: 1, P2: 2, P3: 3 };

function poolFor(cfg, 职能) {
  for (const [pool, c] of Object.entries(cfg.执行池 || {})) {
    if ((c.职能 || []).includes(职能)) return pool;
  }
  return null;
}

// 在池单，可选按职能过滤，按 优先级 > 创建时间 排序。
function listPool(root, cfg, 职能) {
  let items = store.list(root, '池');
  if (职能) items = items.filter((t) => t.fm.职能 === 职能);
  items.sort((a, b) => (PRI[a.fm.优先级] ?? 9) - (PRI[b.fm.优先级] ?? 9)
    || String(a.fm.创建时间 || '').localeCompare(String(b.fm.创建时间 || '')));
  return items;
}

// 在途口径（占用在途上限的状态）：在途 + 质检 + 待定夺（都还没交还给你我做终态决定）。
function inFlight(root) {
  return [...store.list(root, '在途'), ...store.list(root, '质检'), ...store.list(root, '待定夺')];
}

function depsSatisfied(root, t) {
  const deps = t.fm.依赖;
  if (!deps) return true;
  const arr = Array.isArray(deps) ? deps : String(deps).split(/[，,\s]+/).filter(Boolean);
  return arr.every((id) => { const d = store.find(root, id); return d && d.state === '完成'; });
}

// 领单：某 agent 领本职能队首可领单。校验 职能匹配 / 闸门额度锁 / 在途上限 / 一人一张 / 依赖。
async function claim(root, cfg, agentId, now) {
  const agent = (cfg.agents || []).find((a) => a.id === agentId);
  if (!agent) return { ok: false, error: `agent 未注册：${agentId}` };
  if (agent.上线 === false) return { ok: false, error: `${agentId} 未上线` };
  const 职能 = agent.职能;
  const poolName = agent.执行池 || poolFor(cfg, 职能);
  if (!poolName) return { ok: false, error: `${职能} 未绑定执行池` };

  const gate = await gates.canPull(root, cfg, poolName);
  if (!gate.allowed) return { ok: false, error: gate.reason, resetAt: gate.resetAt, gated: true };

  const fl = inFlight(root);
  // 一人一张（D3b）：该 agent 已持单是唯一的数量约束——
  // D17 走到底（2026-07-11）：编制即上限，在途 ≤ 在岗人数由"每人一张"自然保证，无全局手调上限
  if (fl.some((t) => t.fm.主办 === agentId)) return { ok: false, error: `${agentId} 已持有在途单（一人一张）`, full: true };

  const nowIso = now || new Date().toISOString();
  for (const t of listPool(root, cfg, 职能)) {
    if (!depsSatisfied(root, t)) continue;
    if (t.fm.待复核) continue; // D36：上游改版未核对的单不派活
    const r = store.move(root, t.id, '池', '在途', (fm) => {
      fm.主办 = agentId; fm.执行池 = poolName; fm.领单时间 = nowIso;
    }, nowIso);
    if (r.ok) return { ok: true, id: t.id, agent: agentId, 执行池: poolName };
    // r 失败多为被并发抢走 → 试队列下一张
  }
  return { ok: false, error: '无可领单（池空 / 依赖未满足 / 都被抢走）', empty: true };
}

module.exports = { poolFor, listPool, inFlight, depsSatisfied, claim };
