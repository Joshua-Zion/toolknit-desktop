import assert from 'node:assert/strict';
import {
  AI_PROVIDER_LIMITS,
  AiProviderError,
  isPrivateHttpAiProviderUrl,
  isPlaceholderAiApiKey,
  normalizeAiProviderConfig,
  requestAiCompletion
} from '../src/ai-provider-core.js';

const request = {
  url: 'https://api.example.test/v1/chat/completions',
  apiKey: 'test-key',
  model: 'test-model',
  messages: [{ role: 'user', content: 'Hello' }]
};

assert.deepEqual(
  normalizeAiProviderConfig({ url: 'https://api.example.test/v1/chat/completions', model: ' test-model ' }),
  { url: 'https://api.example.test/v1/chat/completions', model: 'test-model' }
);
assert.deepEqual(
  normalizeAiProviderConfig({ url: 'http://localhost:11434/v1/chat/completions', model: 'local-model' }),
  { url: 'http://localhost:11434/v1/chat/completions', model: 'local-model' }
);
assert.equal(isPrivateHttpAiProviderUrl('http://172.23.20.253:3001/v1/chat/completions'), true);
assert.equal(isPrivateHttpAiProviderUrl('http://192.168.1.20/v1/chat/completions'), true);
assert.equal(isPrivateHttpAiProviderUrl('http://8.8.8.8/v1/chat/completions'), false);
assert.throws(
  () => normalizeAiProviderConfig({ url: 'http://172.23.20.253:3001/v1/chat/completions', model: 'test-model' }),
  error => error instanceof AiProviderError && error.code === 'private_http_requires_opt_in'
);
assert.deepEqual(
  normalizeAiProviderConfig({
    url: 'http://172.23.20.253:3001/v1/chat/completions#ignored',
    model: ' test-model ',
    allowPrivateHttp: true
  }),
  { url: 'http://172.23.20.253:3001/v1/chat/completions', model: 'test-model' }
);
for (const url of ['http://api.example.test/v1/chat/completions', 'http://8.8.8.8/v1/chat/completions']) {
  assert.throws(
    () => normalizeAiProviderConfig({ url, model: 'test-model' }),
    error => error instanceof AiProviderError && error.code === 'insecure_http_not_allowed'
  );
}
for (const url of ['https://user:pass@api.example.test/v1/chat/completions', 'not a URL']) {
  assert.throws(
    () => normalizeAiProviderConfig({ url, model: 'test-model' }),
    error => error instanceof AiProviderError && error.code === 'invalid_config'
  );
}

let nativeRequest = null;
assert.equal(await requestAiCompletion({
  ...request,
  url: 'http://172.23.20.253:3001/v1/chat/completions',
  allowPrivateHttp: true,
  nativeRequestImpl: async value => {
    nativeRequest = value;
    return { content: 'LAN response' };
  }
}), 'LAN response');
assert.equal(nativeRequest.url, 'http://172.23.20.253:3001/v1/chat/completions');
assert.equal(nativeRequest.allowPrivateHttp, true);
assert.equal(nativeRequest.apiKey, request.apiKey);

await assert.rejects(
  requestAiCompletion({
    ...request,
    url: 'http://172.23.20.253:3001/v1/chat/completions',
    allowPrivateHttp: true
  }),
  error => error instanceof AiProviderError && error.code === 'native_transport_unavailable'
);

await assert.rejects(
  requestAiCompletion({
    ...request,
    url: 'http://172.23.20.253:3001/v1/chat/completions',
    allowPrivateHttp: true,
    nativeRequestImpl: async () => { throw 'ai-provider:http_error:429'; }
  }),
  error => error instanceof AiProviderError && error.code === 'http_error' && error.status === 429
);

assert.equal(isPlaceholderAiApiKey('你的 DeepSeek Key'), true);
assert.equal(isPlaceholderAiApiKey('<your DeepSeek API key>'), true);
assert.equal(isPlaceholderAiApiKey('sk-real-provider-key'), false);

let sentBody = null;
const content = await requestAiCompletion({
  ...request,
  maxTokens: 100,
  fetchImpl: async (_url, options) => {
    sentBody = JSON.parse(options.body);
    return {
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify({ choices: [{ message: { content: 'World' } }] })
    };
  }
});
assert.equal(content, 'World');
assert.equal(sentBody.max_tokens, 100);
assert.equal(sentBody.stream, false);

let errorTextRead = false;
await assert.rejects(
  requestAiCompletion({
    ...request,
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      text: async () => { errorTextRead = true; return 'echoed secret'; }
    })
  }),
  error => error instanceof AiProviderError && error.code === 'http_error' && error.status === 401
);
assert.equal(errorTextRead, false);

let oversizedTextRead = false;
await assert.rejects(
  requestAiCompletion({
    ...request,
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => String(AI_PROVIDER_LIMITS.maxResponseBytes + 1) },
      text: async () => { oversizedTextRead = true; return ''; }
    })
  }),
  error => error instanceof AiProviderError && error.code === 'response_too_large'
);
assert.equal(oversizedTextRead, false);

let streamedBytesRead = 0;
let streamedResponseCancelled = false;
await assert.rejects(
  requestAiCompletion({
    ...request,
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => null },
      text: async () => { throw new Error('streaming response must not use text()'); },
      body: {
        getReader: () => ({
          read: async () => {
            streamedBytesRead += 1024 * 1024;
            return { done: false, value: new Uint8Array(1024 * 1024) };
          },
          cancel: async () => { streamedResponseCancelled = true; },
          releaseLock: () => {}
        })
      }
    })
  }),
  error => error instanceof AiProviderError && error.code === 'response_too_large'
);
assert.equal(streamedBytesRead, 3 * 1024 * 1024);
assert.equal(streamedResponseCancelled, true);

const unicodeOversizedResponse = JSON.stringify({
  choices: [{ message: { content: '\u4e2d'.repeat(Math.ceil(AI_PROVIDER_LIMITS.maxResponseBytes / 3)) } }]
});
assert.ok(unicodeOversizedResponse.length < AI_PROVIDER_LIMITS.maxResponseBytes);
await assert.rejects(
  requestAiCompletion({
    ...request,
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => null },
      text: async () => unicodeOversizedResponse
    })
  }),
  error => error instanceof AiProviderError && error.code === 'response_too_large'
);

await assert.rejects(
  requestAiCompletion({
    ...request,
    fetchImpl: async () => ({ ok: true, headers: { get: () => null }, text: async () => '{broken' })
  }),
  error => error instanceof AiProviderError && error.code === 'invalid_response'
);
await assert.rejects(
  requestAiCompletion({ ...request, maxTokens: AI_PROVIDER_LIMITS.maxTokens + 1 }),
  error => error instanceof AiProviderError && error.code === 'invalid_request'
);

await assert.rejects(
  requestAiCompletion({
    ...request,
    fetchImpl: async () => { throw new TypeError('fetch failed'); }
  }),
  error => error instanceof AiProviderError && error.code === 'network_error'
);

await assert.rejects(
  requestAiCompletion({
    ...request,
    fetchImpl: async () => ({ ok: true, headers: { get: () => null }, text: async () => { throw new TypeError('stream failed'); } })
  }),
  error => error instanceof AiProviderError && error.code === 'invalid_response'
);

console.log('AI provider core regression checks passed');
