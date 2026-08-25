export const AI_PROVIDER_LIMITS = Object.freeze({
  maxResponseBytes: 2 * 1024 * 1024,
  maxMessages: 12,
  maxMessageChars: 50000,
  maxTokens: 16384
});

export class AiProviderError extends Error {
  constructor(code, status = null) {
    super(code);
    this.name = 'AiProviderError';
    this.code = code;
    this.status = Number.isInteger(status) ? status : null;
  }
}

/**
 * Treat documentation placeholders as missing credentials before a provider
 * request is made. This keeps a copied MCP example from turning into a vague
 * authentication or retry failure.
 */
export function isPlaceholderAiApiKey(value) {
  if (typeof value !== 'string') return true;
  const key = value.trim();
  if (!key) return true;
  const compact = key.toLowerCase().replace(/[\s_-]+/g, '');
  if (/^(?:<|\[|\{).*(?:>|\]|\})$/.test(key)) return true;
  if (/\$\{[^}]+\}/.test(key)) return true;
  if (/^(?:changeme|placeholder|example|replace(?:me)?|your(?:apikey|deepseekapikey)|deepseekapikey|你的(?:deepseek)?(?:api)?(?:密钥|key)|请(?:填写|替换)(?:api)?(?:密钥|key))$/i.test(compact)) return true;
  return /(?:your|replace|placeholder|example|你的|请填写|请替换).{0,32}(?:api|密钥|key)/i.test(key);
}

function isValidMessage(message) {
  return message
    && typeof message === 'object'
    && (message.role === 'system' || message.role === 'user' || message.role === 'assistant')
    && typeof message.content === 'string'
    && message.content.length <= AI_PROVIDER_LIMITS.maxMessageChars;
}

function contentLengthOf(response) {
  const raw = response?.headers?.get?.('content-length');
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function isLoopbackHost(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  const octets = parseIpv4Host(hostname);
  return !!octets && octets[0] === 127;
}

function parseIpv4Host(hostname) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return null;
  const octets = hostname.split('.').map(Number);
  return octets.every(value => Number.isInteger(value) && value >= 0 && value <= 255) ? octets : null;
}

function isPrivateNetworkHost(hostname) {
  const octets = parseIpv4Host(hostname);
  if (octets) {
    return octets[0] === 10
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168);
  }
  const ipv6 = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return /^(?:fc|fd)[0-9a-f]{2}(?::|$)/.test(ipv6);
}

export function isPrivateHttpAiProviderUrl(value) {
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === 'http:' && isPrivateNetworkHost(endpoint.hostname);
  } catch {
    return false;
  }
}

export function normalizeAiProviderConfig({ url, model, allowPrivateHttp = false }) {
  if (typeof url !== 'string' || !url.trim() || typeof model !== 'string' || !model.trim()) {
    throw new AiProviderError('invalid_config');
  }

  let endpoint;
  try {
    endpoint = new URL(url.trim());
  } catch {
    throw new AiProviderError('invalid_config');
  }
  endpoint.hash = '';
  const isSecureEndpoint = endpoint.protocol === 'https:';
  const isLoopbackHttp = endpoint.protocol === 'http:' && isLoopbackHost(endpoint.hostname);
  const isPrivateHttp = endpoint.protocol === 'http:' && isPrivateNetworkHost(endpoint.hostname);
  if (endpoint.username || endpoint.password) {
    throw new AiProviderError('invalid_config');
  }
  if (isPrivateHttp && !allowPrivateHttp) {
    throw new AiProviderError('private_http_requires_opt_in');
  }
  if (!isSecureEndpoint && !isLoopbackHttp && !isPrivateHttp) {
    throw new AiProviderError('insecure_http_not_allowed');
  }
  return { url: endpoint.href, model: model.trim() };
}

function nativeAiProviderError(error) {
  const value = typeof error === 'string' ? error : String(error?.message || error || '');
  const match = value.match(/ai-provider:(http_error):(\d{3})/);
  if (match) return new AiProviderError(match[1], Number(match[2]));
  const code = value.match(/ai-provider:(aborted|network_error|invalid_config|invalid_request|invalid_response|response_too_large)/)?.[1];
  return new AiProviderError(code || 'network_error');
}

async function waitForNativeAiProvider(request, signal) {
  if (!signal) return request;
  if (signal.aborted) throw new AiProviderError('aborted');
  return new Promise((resolve, reject) => {
    const abort = () => reject(new AiProviderError('aborted'));
    signal.addEventListener('abort', abort, { once: true });
    request.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/**
 * Calls an OpenAI-compatible chat-completions endpoint without retaining or
 * reporting provider response bodies. A caller supplies fetch for testability.
 */
export async function requestAiCompletion({
  url,
  apiKey,
  model,
  messages,
  maxTokens,
  signal,
  fetchImpl,
  nativeRequestImpl,
  allowPrivateHttp = false
}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new AiProviderError('invalid_config');
  }
  const config = normalizeAiProviderConfig({ url, model, allowPrivateHttp });
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > AI_PROVIDER_LIMITS.maxMessages
    || !messages.every(isValidMessage)) {
    throw new AiProviderError('invalid_request');
  }
  if (maxTokens !== undefined && (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > AI_PROVIDER_LIMITS.maxTokens)) {
    throw new AiProviderError('invalid_request');
  }
  const requestFetch = fetchImpl ?? globalThis.fetch;
  if (typeof requestFetch !== 'function') {
    throw new AiProviderError('invalid_request');
  }

  const body = {
    model: config.model,
    messages,
    temperature: 0.7,
    stream: false
  };
  if (maxTokens !== undefined) body.max_tokens = maxTokens;

  const endpoint = new URL(config.url);
  const useNativeTransport = endpoint.protocol === 'http:' && typeof nativeRequestImpl === 'function';
  if (useNativeTransport) {
    let result;
    try {
      result = await waitForNativeAiProvider(nativeRequestImpl({
        url: config.url,
        apiKey: apiKey.trim(),
        model: config.model,
        messages,
        maxTokens,
        allowPrivateHttp: Boolean(allowPrivateHttp)
      }), signal);
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw nativeAiProviderError(error);
    }
    const content = typeof result === 'string' ? result : result?.content;
    if (typeof content !== 'string') throw new AiProviderError('invalid_response');
    if (utf8ByteLength(content) > AI_PROVIDER_LIMITS.maxResponseBytes) {
      throw new AiProviderError('response_too_large');
    }
    return content;
  }
  if (isPrivateHttpAiProviderUrl(config.url)) {
    throw new AiProviderError('native_transport_unavailable');
  }

  let response;
  try {
    response = await requestFetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify(body),
      signal
    });
  } catch {
    throw new AiProviderError(signal?.aborted ? 'aborted' : 'network_error');
  }
  if (!response || typeof response.ok !== 'boolean' || typeof response.text !== 'function') {
    throw new AiProviderError('invalid_response');
  }
  if (!response.ok) {
    // Do not consume an error body: providers and proxies may echo prompts or keys.
    throw new AiProviderError('http_error', Number(response.status));
  }
  if (contentLengthOf(response) > AI_PROVIDER_LIMITS.maxResponseBytes) {
    throw new AiProviderError('response_too_large');
  }

  let text;
  try {
    text = await response.text();
  } catch {
    throw new AiProviderError('invalid_response');
  }
  if (utf8ByteLength(text) > AI_PROVIDER_LIMITS.maxResponseBytes) {
    throw new AiProviderError('response_too_large');
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AiProviderError('invalid_response');
  }
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}
