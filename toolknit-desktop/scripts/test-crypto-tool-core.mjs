import assert from 'node:assert/strict';
import { generateRsaKeyPair, generateSm2KeyPair, hashText, hmacMd5, md4Hex, runRsa, runSm2, runSymmetricCipher, triviumXor } from '../src/crypto-tool-core.js';

assert.equal(hashText('md2','abc'),'da853b0d3f88d99b30283a69e6ded6bb');
assert.equal(md4Hex('abc'),'a448017aaf21d8525fc10ae87aa6729d');
assert.equal(hashText('md5','abc'),'900150983cd24fb0d6963f7d28e17f72');
assert.equal(hashText('sha256','abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
assert.equal(hashText('sha1','abc'),'a9993e364706816aba3e25717850c26c9cd0d89d');
assert.equal(hashText('sha224','abc'),'23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7');
assert.equal(hashText('sha384','abc'),'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7');
assert.equal(hashText('sha512','abc'),'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f');
assert.equal(hashText('sha3-256','abc'),'3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532');
assert.equal(hashText('sha3-512','abc'),'b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0');
assert.equal(hashText('blake2b-512','abc'),'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923');
assert.equal(hashText('blake2s-256','abc'),'508c5e8c327c14e2e1a72ba34eeb452f37458b209ed63a294d999b4c86675982');
assert.equal(hashText('blake3-256','abc'),'6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85');
assert.equal(hashText('sm3','abc'),'66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0');
assert.equal(hmacMd5('The quick brown fox jumps over the lazy dog','key'),'80070713463e7749b90c2dc24911e275');

const aes={key:'000102030405060708090A0B0C0D0E0F',iv:'101112131415161718191A1B1C1D1E1F',keyFormat:'hex',ivFormat:'hex',mode:'CBC',padding:'pkcs7',input:'ToolKnit 安全测试',inputFormat:'text',outputFormat:'base64'};
const encrypted=runSymmetricCipher('aes','encrypt',aes);
assert.equal(runSymmetricCipher('aes','decrypt',{...aes,input:encrypted,inputFormat:'base64',outputFormat:'text'}),'ToolKnit 安全测试');
assert.throws(()=>runSymmetricCipher('aes','encrypt',{...aes,key:'0011'}),/crypto:key-length/);
assert.throws(()=>runSymmetricCipher('aes','encrypt',{...aes,input:'short',padding:'nopadding'}),/crypto:block-length/);
assert.equal(runSymmetricCipher('aes','encrypt',{key:'000102030405060708090a0b0c0d0e0f',keyFormat:'hex',mode:'ECB',padding:'nopadding',input:'00112233445566778899aabbccddeeff',inputFormat:'hex',outputFormat:'hex'}),'69c4e0d86a7b0430d8cdb78070b4c55a');
assert.equal(runSymmetricCipher('des','encrypt',{key:'133457799BBCDFF1',keyFormat:'hex',mode:'ECB',padding:'nopadding',input:'0123456789ABCDEF',inputFormat:'hex',outputFormat:'hex'}),'85e813540f0ab405');
assert.equal(runSymmetricCipher('rc4','encrypt',{key:'4B6579',keyFormat:'hex',input:'506C61696E74657874',inputFormat:'hex',outputFormat:'hex'}),'bbf316e8d940af0ad3');
assert.equal(runSymmetricCipher('chacha20','encrypt',{key:'00'.repeat(32),keyFormat:'hex',iv:'00'.repeat(12),ivFormat:'hex',input:'00'.repeat(64),inputFormat:'hex',outputFormat:'hex'}),'76b8e0ada0f13d90405d6ae55386bd28bdd219b8a08ded1aa836efcc8b770dc7da41597c5157488d7724e03fb8d84a376a43b8f41518a11cc387b669b2ee6586');

const sm4={key:'0123456789abcdeffedcba9876543210',iv:'000102030405060708090a0b0c0d0e0f',keyFormat:'hex',ivFormat:'hex',mode:'CBC',padding:'pkcs7',input:'ToolKnit SM4',inputFormat:'text',outputFormat:'base64'};
const sm4Encrypted=runSymmetricCipher('sm4','encrypt',sm4);
assert.equal(runSymmetricCipher('sm4','decrypt',{...sm4,input:sm4Encrypted,inputFormat:'base64',outputFormat:'text'}),'ToolKnit SM4');
assert.throws(()=>runSymmetricCipher('sm4','encrypt',{...sm4,padding:'zero'}),/crypto:invalid-padding/);
assert.equal(runSymmetricCipher('sm4','encrypt',{key:'0123456789abcdeffedcba9876543210',keyFormat:'hex',mode:'ECB',padding:'nopadding',input:'0123456789abcdeffedcba9876543210',inputFormat:'hex',outputFormat:'hex'}),'681edf34d206965e86b3e94f536e4246');

const key=new Uint8Array(10);const iv=new Uint8Array(10);const plain=new TextEncoder().encode('trivium round trip');
const cipher=triviumXor(key,iv,plain);assert.deepEqual(triviumXor(key,iv,cipher),plain);
assert.equal(Buffer.from(triviumXor(key,iv,new Uint8Array(32))).toString('hex'),'fbe0bf265859051b517a2e4e239fc97f563203161907cf2de7a8790fa1b2e9cd');

const sm2=generateSm2KeyPair();
const sm2Cipher=runSm2('encrypt','ToolKnit SM2',sm2.publicKey,sm2.privateKey,1);
assert.equal(runSm2('decrypt',sm2Cipher,sm2.publicKey,sm2.privateKey,1),'ToolKnit SM2');
const rsa=await generateRsaKeyPair(1024,'oaep');
const rsaCipher=await runRsa('encrypt','ToolKnit RSA',rsa.publicKey,rsa.privateKey);
assert.equal(await runRsa('decrypt',rsaCipher,rsa.publicKey,rsa.privateKey),'ToolKnit RSA');
console.log('crypto tool core tests passed');
