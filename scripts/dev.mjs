// 同时启动 Vite 前端与 Express API 服务，退出时一并清理。
import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const procs = [];
let shuttingDown = false;

function run(script) {
  const p = spawn(npm, ['run', script], {
    stdio: 'inherit',
    shell: isWin,
    env: process.env,
  });
  p.on('exit', (code) => {
    if (!shuttingDown && code !== 0 && code !== null) {
      console.error(`[dev] ${script} 退出（code ${code}），正在关闭其它进程…`);
      shutdown(code ?? 1);
    }
  });
  procs.push(p);
  return p;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) {
    if (p.exitCode === null) {
      try {
        if (isWin) spawn('taskkill', ['/pid', String(p.pid), '/t', '/f'], { stdio: 'ignore' });
        else p.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
  }
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('[dev] API 服务: http://127.0.0.1:8787  前端: http://127.0.0.1:5173');
run('dev:server');
run('dev:client');
