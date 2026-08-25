import CryptoJS from 'crypto-js';
import md2 from 'js-md2';
import smCrypto from 'sm-crypto';
import { md5, sha1 } from '@noble/hashes/legacy.js';
import { sha224, sha256, sha384, sha512 } from '@noble/hashes/sha2.js';
import { sha3_256, sha3_512 } from '@noble/hashes/sha3.js';
import { blake2b, blake2s } from '@noble/hashes/blake2.js';
import { blake3 } from '@noble/hashes/blake3.js';
import { chacha20 } from '@noble/ciphers/chacha.js';

export const CRYPTO_PREFERENCES_KEY = 'toolknit.crypto.preferences.v1';
export const LEGACY_ALGORITHMS = new Set(['md2', 'md4', 'md5', 'hmac-md5', 'des', '3des', 'rc4', 'rsa-pkcs1', 'rsa-512']);
export const CRYPTO_MAX_TEXT_CHARS = 2 * 1024 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function bytesToHex(bytes, upper = false) {
  const value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return upper ? value.toUpperCase() : value;
}

export function hexToBytes(value) {
  const text = String(value || '').replace(/\s+/g, '');
  if (!text || text.length % 2 || !/^[\da-f]+$/i.test(text)) throw new Error('crypto:invalid-hex');
  return Uint8Array.from(text.match(/../g), part => Number.parseInt(part, 16));
}

export function bytesToBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(value) {
  try {
    const binary = atob(String(value || '').replace(/\s+/g, ''));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch { throw new Error('crypto:invalid-base64'); }
}

export function parseBytes(value, format = 'text') {
  if (format === 'hex') return hexToBytes(value);
  if (format === 'base64') return base64ToBytes(value);
  return encoder.encode(String(value ?? ''));
}

function assertCryptoText(value) {
  const text = String(value ?? '');
  if (text.length > CRYPTO_MAX_TEXT_CHARS) throw new Error('crypto:input-too-large');
  return text;
}

export function formatBytes(bytes, format = 'hex', upper = false) {
  if (format === 'base64') return bytesToBase64(bytes);
  if (format === 'text') {
    try { return decoder.decode(bytes); } catch { throw new Error('crypto:invalid-utf8-output'); }
  }
  return bytesToHex(bytes, upper);
}

export function requireByteLength(bytes, expected, label = 'key') {
  const accepted = Array.isArray(expected) ? expected : [expected];
  if (!accepted.includes(bytes.length)) throw new Error(`crypto:${label}-length:${accepted.join('|')}`);
  return bytes;
}

export function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function leftRotate(value, amount) { return ((value << amount) | (value >>> (32 - amount))) >>> 0; }

export function md4Hex(input) {
  const source = encoder.encode(String(input ?? ''));
  const length = source.length;
  const paddedLength = Math.ceil((length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(source); bytes[length] = 0x80;
  const bitLength = BigInt(length) * 8n;
  for (let i = 0; i < 8; i += 1) bytes[paddedLength - 8 + i] = Number((bitLength >> BigInt(i * 8)) & 0xffn);
  let a0 = 0x67452301; let b0 = 0xefcdab89; let c0 = 0x98badcfe; let d0 = 0x10325476;
  const f = (x, y, z) => (x & y) | (~x & z);
  const g = (x, y, z) => (x & y) | (x & z) | (y & z);
  const h = (x, y, z) => x ^ y ^ z;
  for (let offset = 0; offset < paddedLength; offset += 64) {
    const x = new Uint32Array(16);
    for (let i = 0; i < 16; i += 1) x[i] = (bytes[offset + i * 4]) | (bytes[offset + i * 4 + 1] << 8) | (bytes[offset + i * 4 + 2] << 16) | (bytes[offset + i * 4 + 3] << 24);
    let a = a0; let b = b0; let c = c0; let d = d0;
    const round = (fn, aa, bb, cc, dd, k, s, add = 0) => leftRotate((aa + fn(bb, cc, dd) + x[k] + add) >>> 0, s);
    const r1 = [[0,3],[1,7],[2,11],[3,19],[4,3],[5,7],[6,11],[7,19],[8,3],[9,7],[10,11],[11,19],[12,3],[13,7],[14,11],[15,19]];
    for (let i = 0; i < 16; i += 4) { a=round(f,a,b,c,d,...r1[i]); d=round(f,d,a,b,c,...r1[i+1]); c=round(f,c,d,a,b,...r1[i+2]); b=round(f,b,c,d,a,...r1[i+3]); }
    const r2 = [[0,3],[4,5],[8,9],[12,13],[1,3],[5,5],[9,9],[13,13],[2,3],[6,5],[10,9],[14,13],[3,3],[7,5],[11,9],[15,13]];
    for (let i = 0; i < 16; i += 4) { a=round(g,a,b,c,d,...r2[i],0x5a827999); d=round(g,d,a,b,c,...r2[i+1],0x5a827999); c=round(g,c,d,a,b,...r2[i+2],0x5a827999); b=round(g,b,c,d,a,...r2[i+3],0x5a827999); }
    const r3 = [[0,3],[8,9],[4,11],[12,15],[2,3],[10,9],[6,11],[14,15],[1,3],[9,9],[5,11],[13,15],[3,3],[11,9],[7,11],[15,15]];
    for (let i = 0; i < 16; i += 4) { a=round(h,a,b,c,d,...r3[i],0x6ed9eba1); d=round(h,d,a,b,c,...r3[i+1],0x6ed9eba1); c=round(h,c,d,a,b,...r3[i+2],0x6ed9eba1); b=round(h,b,c,d,a,...r3[i+3],0x6ed9eba1); }
    a0=(a0+a)>>>0; b0=(b0+b)>>>0; c0=(c0+c)>>>0; d0=(d0+d)>>>0;
  }
  return [a0,b0,c0,d0].map(word => [0,8,16,24].map(shift => ((word >>> shift) & 0xff).toString(16).padStart(2,'0')).join('')).join('');
}

const HASHERS = {
  md5, sha1, sha224, sha256, sha384, sha512, 'sha3-256': sha3_256, 'sha3-512': sha3_512,
  'blake2b-512': input => blake2b(input, { dkLen: 64 }),
  'blake2s-256': input => blake2s(input, { dkLen: 32 }),
  'blake3-256': input => blake3(input, { dkLen: 32 })
};

export function hashText(algorithm, input, { upper = false, short = false } = {}) {
  const id = String(algorithm).toLowerCase();
  let output;
  if (id === 'md2') output = md2(String(input ?? ''));
  else if (id === 'md4') output = md4Hex(input);
  else if (id === 'sm3') output = smCrypto.sm3(String(input ?? ''));
  else {
    const hasher = HASHERS[id];
    if (!hasher) throw new Error('crypto:unsupported-algorithm');
    output = bytesToHex(hasher(encoder.encode(String(input ?? ''))));
  }
  if (short && ['md4','md5'].includes(id)) output = output.slice(8, 24);
  return upper ? output.toUpperCase() : output.toLowerCase();
}

function bytesToWordArray(bytes) {
  const words = [];
  for (let i = 0; i < bytes.length; i += 1) words[i >>> 2] = (words[i >>> 2] || 0) | (bytes[i] << (24 - (i % 4) * 8));
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function wordArrayToBytes(wordArray) {
  const { words, sigBytes } = wordArray;
  return Uint8Array.from({ length: sigBytes }, (_, i) => (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff);
}

function cryptoJsMode(value) {
  const key = String(value || 'CBC').toUpperCase();
  if (!CryptoJS.mode[key]) throw new Error('crypto:invalid-mode');
  return CryptoJS.mode[key];
}

function cryptoJsPadding(value) {
  const names = { pkcs7:'Pkcs7', zero:'ZeroPadding', nopadding:'NoPadding', ansix923:'AnsiX923', iso10126:'Iso10126' };
  const key = names[String(value || 'pkcs7').toLowerCase()];
  if (!key || !CryptoJS.pad[key]) throw new Error('crypto:invalid-padding');
  return CryptoJS.pad[key];
}

export function hmacMd5(input, key, keyFormat = 'text', upper = false) {
  const result = CryptoJS.HmacMD5(String(input ?? ''), bytesToWordArray(parseBytes(key, keyFormat))).toString();
  return upper ? result.toUpperCase() : result;
}

function runCryptoJsCipher(algorithm, operation, options) {
  const specs = { aes:[16,24,32], des:8, '3des':24, rc4:null };
  const keyBytes = parseBytes(options.key, options.keyFormat || 'hex');
  if (specs[algorithm]) requireByteLength(keyBytes, specs[algorithm], 'key');
  if (!keyBytes.length) throw new Error('crypto:key-required');
  const modeName = String(options.mode || 'CBC').toUpperCase();
  const config = {};
  if (algorithm !== 'rc4') {
    config.mode = cryptoJsMode(modeName);
    config.padding = cryptoJsPadding(options.padding);
    if (modeName !== 'ECB') {
      const ivBytes = parseBytes(options.iv, options.ivFormat || 'hex');
      requireByteLength(ivBytes, algorithm === 'aes' ? 16 : 8, 'iv');
      config.iv = bytesToWordArray(ivBytes);
    }
  }
  const cipher = algorithm === 'aes' ? CryptoJS.AES : algorithm === 'des' ? CryptoJS.DES : algorithm === '3des' ? CryptoJS.TripleDES : CryptoJS.RC4;
  const key = bytesToWordArray(keyBytes);
  const inputBytes = parseBytes(options.input, options.inputFormat || (operation === 'encrypt' ? 'text' : 'base64'));
  const blockSize = algorithm === 'aes' ? 16 : algorithm === 'rc4' ? 1 : 8;
  const paddingName = String(options.padding || 'pkcs7').toLowerCase();
  if (algorithm !== 'rc4' && ['CBC', 'ECB'].includes(modeName) && (operation === 'decrypt' || paddingName === 'nopadding') && inputBytes.length % blockSize !== 0) {
    throw new Error('crypto:block-length');
  }
  if (operation === 'encrypt') {
    const encrypted = cipher.encrypt(bytesToWordArray(inputBytes), key, config);
    return formatBytes(wordArrayToBytes(encrypted.ciphertext), options.outputFormat || 'base64', options.upper);
  }
  const ciphertext = bytesToWordArray(inputBytes);
  const decrypted = cipher.decrypt({ ciphertext }, key, config);
  return formatBytes(wordArrayToBytes(decrypted), options.outputFormat || 'text', options.upper);
}

function triviumCycle(state) {
  let t1=state[65]^state[92]; let t2=state[161]^state[176]; let t3=state[242]^state[287];
  const output=t1^t2^t3;
  t1^=(state[90]&state[91])^state[170]; t2^=(state[174]&state[175])^state[263]; t3^=(state[285]&state[286])^state[68];
  for(let i=92;i>0;i-=1) state[i]=state[i-1]; state[0]=t3;
  for(let i=176;i>93;i-=1) state[i]=state[i-1]; state[93]=t1;
  for(let i=287;i>177;i-=1) state[i]=state[i-1]; state[177]=t2;
  return output;
}

export function triviumXor(key, iv, data) {
  requireByteLength(key, 10, 'key'); requireByteLength(iv, 10, 'iv');
  const state=new Uint8Array(288);
  for(let i=0;i<80;i+=1){state[i]=(key[i>>>3]>>>(i&7))&1;state[i+93]=(iv[i>>>3]>>>(i&7))&1;}
  state[285]=state[286]=state[287]=1;
  for(let i=0;i<1152;i+=1) triviumCycle(state);
  const output=new Uint8Array(data.length);
  for(let i=0;i<data.length;i+=1){let stream=0;for(let bit=0;bit<8;bit+=1)stream|=triviumCycle(state)<<bit;output[i]=data[i]^stream;}
  return output;
}

export function runSymmetricCipher(algorithm, operation, options) {
  const id=String(algorithm).toLowerCase();
  if(['aes','des','3des','rc4'].includes(id)) return runCryptoJsCipher(id,operation,options);
  const input=parseBytes(options.input,options.inputFormat || (operation==='encrypt'?'text':'base64'));
  const key=parseBytes(options.key,options.keyFormat || 'hex');
  let output;
  if(id==='chacha20'){
    requireByteLength(key,32,'key');const nonce=parseBytes(options.iv,options.ivFormat || 'hex');requireByteLength(nonce,12,'iv');output=chacha20(key,nonce,input);
  }else if(id==='trivium'){
    const iv=parseBytes(options.iv,options.ivFormat || 'hex');output=triviumXor(key,iv,input);
  }else if(id==='sm4'){
    requireByteLength(key,16,'key');const mode=String(options.mode||'cbc').toLowerCase();const padding=String(options.padding||'pkcs7').toLowerCase();
    if(!['cbc','ecb'].includes(mode))throw new Error('crypto:invalid-mode');
    if(!['pkcs7','nopadding'].includes(padding))throw new Error('crypto:invalid-padding');
    if((operation==='decrypt'||padding==='nopadding')&&input.length%16!==0)throw new Error('crypto:block-length');
    const settings={mode,padding:padding==='nopadding'?'none':'pkcs#7',output:'array'};
    if(mode!=='ecb'){const iv=parseBytes(options.iv,options.ivFormat||'hex');requireByteLength(iv,16,'iv');settings.iv=Array.from(iv);}
    const data=Array.from(input);const result=operation==='encrypt'?smCrypto.sm4.encrypt(data,Array.from(key),settings):smCrypto.sm4.decrypt(data,Array.from(key),settings);
    output=Uint8Array.from(result);
  }else throw new Error('crypto:unsupported-algorithm');
  return formatBytes(output,options.outputFormat || (operation==='encrypt'?'base64':'text'),options.upper);
}

function pemToDer(pem,label) {
  const text=assertCryptoText(pem).trim();
  const begin=`-----BEGIN ${label}-----`;
  const end=`-----END ${label}-----`;
  if(!text.startsWith(begin)||!text.endsWith(end))throw new Error('crypto:invalid-pem');
  const body=text.slice(begin.length,-end.length).trim();
  if(!body||!/^[A-Za-z0-9+/=\s]+$/.test(body))throw new Error('crypto:invalid-pem');
  return base64ToBytes(body);
}
function derToPem(der,label){const base64=bytesToBase64(new Uint8Array(der));return `-----BEGIN ${label}-----\n${base64.match(/.{1,64}/g).join('\n')}\n-----END ${label}-----`;}

export async function generateRsaKeyPair(size=2048,scheme='oaep') {
  const bits=Number(size);
  if(!['oaep','pkcs1'].includes(scheme))throw new Error('crypto:invalid-scheme');
  if(![512,1024,2048,4096].includes(bits)) throw new Error('crypto:rsa-size');
  if(scheme==='oaep'&&bits===512)throw new Error('crypto:rsa-oaep-size');
  const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:bits,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
  return {publicKey:derToPem(await crypto.subtle.exportKey('spki',pair.publicKey),'PUBLIC KEY'),privateKey:derToPem(await crypto.subtle.exportKey('pkcs8',pair.privateKey),'PRIVATE KEY'),scheme};
}

export async function exportRsaLegacyKeyComponents(operation,publicKey,privateKey) {
  if(!['encrypt','decrypt'].includes(operation))throw new Error('crypto:invalid-operation');
  const encrypt=operation==='encrypt';
  const errorCode=encrypt?'crypto:rsa-public-key':'crypto:rsa-private-key';
  try{
    const key=encrypt
      ?await crypto.subtle.importKey('spki',pemToDer(publicKey,'PUBLIC KEY'),{name:'RSA-OAEP',hash:'SHA-256'},true,['encrypt'])
      :await crypto.subtle.importKey('pkcs8',pemToDer(privateKey,'PRIVATE KEY'),{name:'RSA-OAEP',hash:'SHA-256'},true,['decrypt']);
    const jwk=await crypto.subtle.exportKey('jwk',key);
    if(jwk.kty!=='RSA'||typeof jwk.n!=='string'||typeof jwk.e!=='string')throw new Error(errorCode);
    if(encrypt)return {n:jwk.n,e:jwk.e};
    if(typeof jwk.p!=='string'||typeof jwk.q!=='string')throw new Error(errorCode);
    return {n:jwk.n,e:jwk.e,p:jwk.p,q:jwk.q};
  }catch(caught){
    if(caught?.message==='crypto:input-too-large')throw caught;
    throw new Error(errorCode);
  }
}

export async function runRsa(operation, input, publicKey, privateKey, scheme='oaep') {
  if(scheme==='pkcs1') throw new Error('crypto:rsa-pkcs1-native-only');
  if(!['encrypt','decrypt'].includes(operation))throw new Error('crypto:invalid-operation');
  if(operation==='encrypt'){
    const key=await crypto.subtle.importKey('spki',pemToDer(publicKey,'PUBLIC KEY'),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
    return bytesToBase64(new Uint8Array(await crypto.subtle.encrypt({name:'RSA-OAEP'},key,encoder.encode(String(input)))));
  }
  const key=await crypto.subtle.importKey('pkcs8',pemToDer(privateKey,'PRIVATE KEY'),{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);
  return decoder.decode(await crypto.subtle.decrypt({name:'RSA-OAEP'},key,base64ToBytes(input)));
}

export function generateSm2KeyPair(){return smCrypto.sm2.generateKeyPairHex();}
export function runSm2(operation,input,publicKey,privateKey,mode=1){return operation==='encrypt'?smCrypto.sm2.doEncrypt(String(input),publicKey,Number(mode)):smCrypto.sm2.doDecrypt(String(input),privateKey,Number(mode));}

export async function runCryptoOperation(request) {
  for (const field of ['input', 'key', 'iv', 'publicKey', 'privateKey']) assertCryptoText(request?.[field]);
  const id=String(request?.algorithm||'').toLowerCase();
  if(['md2','md4','md5','sha1','sha224','sha256','sha384','sha512','sha3-256','sha3-512','sm3','blake2b-512','blake2s-256','blake3-256'].includes(id)) return hashText(id,request.input,request);
  if(id==='hmac-md5') return hmacMd5(request.input,request.key,request.keyFormat,request.upper);
  if(['aes','des','3des','sm4','rc4','chacha20','trivium'].includes(id)) return runSymmetricCipher(id,request.operation||'encrypt',request);
  if(id==='rsa') return runRsa(request.operation||'encrypt',request.input,request.publicKey,request.privateKey,request.scheme||'oaep');
  if(id==='sm2') return runSm2(request.operation||'encrypt',request.input,request.publicKey,request.privateKey,request.mode??1);
  throw new Error('crypto:unsupported-algorithm');
}
