import { createApp } from './app.js';
import { getPublicTranslateConfig } from './config.js';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';

const app = createApp();
const server = app.listen(port, host, () => {
  const config = getPublicTranslateConfig();
  console.log(`[prompt-studio] API 已启动: http://${host}:${port}`);
  console.log(`[prompt-studio] 翻译服务: ${config.label}`);
  if (config.isMock) {
    console.warn('[prompt-studio] 当前为模拟翻译模式，结果仅用于界面测试，请到设置中配置真实翻译服务。');
  }
  if (config.requiresKey && !config.hasKey) {
    console.warn('[prompt-studio] 尚未配置翻译 API Key，翻译会失败。');
  }
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
