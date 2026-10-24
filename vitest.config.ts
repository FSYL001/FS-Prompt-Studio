import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // 服务端使用 NodeNext，源码内引用带 .js 后缀；测试时映射回 .ts 源码。
    alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1.ts' }],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
