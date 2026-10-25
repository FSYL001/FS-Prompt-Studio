/**
 * 便携版启动器：
 * - 如果 8787 已有健康的 FS-Prompt Studio 服务，直接打开浏览器；
 * - 否则选择一个可用端口，启动生产服务；
 * - 等服务 /api/health 真正返回 200 后再打开浏览器，避免“页面先开、API 没起来”。
 */
import net from 'node:net';
import { spawn } from 'node:child_process';

const HOST = '127.0.0.1';
const START_PORT = Number(process.env.PORT ?? 8787);
const MAX_PORT_TRIES = 20;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const urlFor = (port) => `http://${HOST}:${port}/`;

async function healthAt(port) {
  try {
    const response = await fetch(`http://${HOST}:${port}/api/health`, {
      signal: AbortSignal.timeout(1200),
      cache: 'no-store',
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    return Boolean(data && data.ok === true && data.app === 'prompt-studio');
  } catch {
    return false;
  }
}

async function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, HOST);
  });
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      const child = spawn('cmd.exe', ['/c', 'start', '', url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    // 浏览器打不开时，用户可以手动访问控制台打印的地址。
  }
}

async function main() {
  if (await healthAt(START_PORT)) {
    console.log(`[FS-Prompt Studio] 服务已在运行：${urlFor(START_PORT)}`);
    openBrowser(urlFor(START_PORT));
    return;
  }

  let port = 0;
  for (let offset = 0; offset < MAX_PORT_TRIES; offset++) {
    const candidate = START_PORT + offset;
    if (await portFree(candidate)) {
      port = candidate;
      break;
    }
  }
  if (!port) {
    console.error('[FS-Prompt Studio] 找不到可用端口（8787-8806）。请关闭占用端口的程序后重试。');
    process.exitCode = 1;
    return;
  }

  if (port !== START_PORT) {
    console.warn(`[FS-Prompt Studio] 端口 ${START_PORT} 被占用，改用 ${port}。`);
  }

  process.env.NODE_ENV = 'production';
  process.env.HOST = HOST;
  process.env.PORT = String(port);

  console.log(`[FS-Prompt Studio] 正在启动：${urlFor(port)}`);
  await import('./dist-server/server/index.js');

  for (let attempt = 0; attempt < 80; attempt++) {
    if (await healthAt(port)) {
      console.log(`[FS-Prompt Studio] 已就绪：${urlFor(port)}`);
      console.log('[FS-Prompt Studio] 请保持此窗口开启；按 Ctrl+C 停止。');
      openBrowser(urlFor(port));
      return;
    }
    await sleep(250);
  }

  console.error(`[FS-Prompt Studio] 服务启动超时，请查看上方日志。可手动打开：${urlFor(port)}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[FS-Prompt Studio] 启动失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
