import http from 'node:http';
import https from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { TranslationError } from './types.js';

const agentCache = new Map<string, http.Agent>();

export function sanitizeProxyUrl(proxyUrl: string): string {
  if (!proxyUrl) return '';
  try {
    const url = new URL(proxyUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '（代理地址格式不正确）';
  }
}

export function proxyAgent(proxyUrl: string): http.Agent | undefined {
  const value = proxyUrl.trim();
  if (!value) return undefined;
  const cached = agentCache.get(value);
  if (cached) return cached;

  let agent: http.Agent;
  try {
    const protocol = new URL(value).protocol;
    if (protocol === 'socks:' || protocol === 'socks5:' || protocol === 'socks5h:') {
      agent = new SocksProxyAgent(value);
    } else {
      agent = new HttpsProxyAgent(value);
    }
  } catch (error) {
    throw new TranslationError(
      `代理地址格式不正确：${error instanceof Error ? error.message : String(error)}`,
      'PROXY_INVALID',
      '代理地址应类似 http://127.0.0.1:7890 或 socks5://127.0.0.1:10808。',
    );
  }
  agentCache.set(value, agent);
  return agent;
}

export interface TextRequestOptions {
  timeoutMs: number;
  proxyUrl?: string;
}

/**
 * 使用 node:http/https 请求文本。相比 Node 的 fetch，这一层可以显式走
 * HTTP(S)/SOCKS 代理，解决“浏览器能开 Google，但工具服务端直连超时”的问题。
 */
export function requestText(
  url: string,
  options: TextRequestOptions,
  redirectsLeft = 3,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      reject(new TranslationError('翻译接口地址格式不正确。', 'BAD_URL'));
      return;
    }
    const lib = target.protocol === 'http:' ? http : https;
    const agent = proxyAgent(options.proxyUrl ?? '');
    const request = lib.get(
      target,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'identity',
        },
        agent,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
          response.resume();
          requestText(new URL(location, target).toString(), options, redirectsLeft - 1).then(
            resolve,
            reject,
          );
          return;
        }
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () => resolve({ status, body }));
        response.on('error', reject);
      },
    );
    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new Error('__timeout__'));
    });
    request.on('error', (error: Error) => {
      if (error.message === '__timeout__') {
        reject(
          new TranslationError(
            '翻译服务请求超时。',
            'TIMEOUT',
            options.proxyUrl
              ? `已尝试通过代理 ${sanitizeProxyUrl(options.proxyUrl)} 连接；请确认代理端口可用，或在设置中把超时调到 60 秒。`
              : '网络较慢或翻译服务无响应。如果浏览器能打开 Google 但这里超时，请检查服务端代理设置。',
          ),
        );
        return;
      }
      reject(
        new TranslationError(
          `无法连接翻译服务，请检查网络或代理设置（${error.message}）。`,
          'NETWORK',
          options.proxyUrl
            ? `正在使用代理 ${sanitizeProxyUrl(options.proxyUrl)}；请确认该端口是 HTTP/SOCKS 代理且已开启。`
            : '如果浏览器能访问目标网站但这里失败，通常是服务端没有走代理。',
        ),
      );
    });
  });
}
