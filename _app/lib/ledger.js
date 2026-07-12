// ledger.js — 监制台自动记账（D35）：工单流转/回执/journal 定期 git commit 落袋。
// 只 commit 不 push（推送仍由制作人层决定）；无变更不产生空提交。
// 教训来源：TK 流水线产出曾 36 个文件躺工作区数日未入库（08 复盘 R-1）。
const path = require('path');
const { execFile } = require('child_process');

const DIRS = ['草稿', '待投', '池', '在途', '质检', '待验收', '待定夺', '执行失败', '完成', '已归档', '回执', 'journal', '风格库', '岗位协议'];

function commitStudio(root, cb) {
  const done = (ok, note) => { if (cb) cb(ok, note); };
  const repo = path.resolve(root, '..'); // ai-studio 仓库根（监制台的上一级）
  const rel = path.basename(root);
  const targets = DIRS.map((d) => `${rel}/${d}`);
  const g = (args, next) => execFile('git', ['-C', repo, ...args], { windowsHide: true, timeout: 30000 }, next);
  g(['rev-parse', '--is-inside-work-tree'], (e) => {
    if (e) return done(false, '不在 git 仓库内');
    g(['add', '--', ...targets], (e2) => {
      if (e2) return done(false, 'add 失败');
      g(['diff', '--cached', '--quiet'], (e3) => {
        if (!e3) return done(false, '无变更'); // diff --quiet 退出 0 = 无暂存变更
        const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const msg = `监制台自动记账 ${stamp}\n\n工单流转/回执/journal 定期落袋（D35，只 commit 不 push）\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>`;
        g(['commit', '-m', msg], (e4) => done(!e4, e4 ? 'commit 失败' : '已记账'));
      });
    });
  });
}

module.exports = { commitStudio };
