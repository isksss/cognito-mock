import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const N = BigInt(`0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1
29024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3
CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC
6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24
117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D3
9A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529
077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE
3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BC
BF6955817183995497CEA956AE515D2261898FA051015728E5A8AAAC4
2DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71
575D060C7DB3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A256
19DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2
B18177B200CBBE117577A615D6C770988C0BAD946E208E24FA074E5AB
3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF`.replace(/\s/g, ''))
const ZERO = BigInt(0)
const ONE = BigInt(1)
const TWO = BigInt(2)
const g = TWO
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest()
const pad = (value: bigint) => {
  let hex = value.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  else if ('89abcdef'.includes(hex[0]?.toLowerCase() || '')) hex = `00${hex}`
  return Buffer.from(hex, 'hex')
}
const modPow = (base: bigint, exponent: bigint, modulus: bigint) => {
  let result = ONE; let current = base % modulus; let power = exponent
  while (power > ZERO) { if (power % TWO === ONE) result = result * current % modulus; power /= TWO; current = current * current % modulus }
  return result
}
const toBigInt = (value: Buffer | string) => BigInt(`0x${Buffer.isBuffer(value) ? value.toString('hex') : value}`)
const k = toBigInt(sha256(Buffer.concat([pad(N), pad(g)])))

export function createSrpVerifier(poolId: string, username: string, password: string) {
  const poolName = poolId.includes('_') ? poolId.split('_').slice(1).join('_') : poolId
  const salt = toBigInt(randomBytes(16))
  const userHash = sha256(`${poolName}${username}:${password}`)
  const x = toBigInt(sha256(Buffer.concat([pad(salt), userHash])))
  return { salt: salt.toString(16), verifier: modPow(g, x, N).toString(16) }
}

export function createSrpChallenge(verifierHex: string) {
  const b = toBigInt(randomBytes(128))
  const verifier = toBigInt(verifierHex)
  const B = (k * verifier + modPow(g, b, N)) % N
  return { b: b.toString(16), B: B.toString(16), secretBlock: randomBytes(16).toString('base64') }
}

export function verifySrpResponse(input: { poolId: string, username: string, verifier: string, b: string, B: string, A: string, secretBlock: string, timestamp: string, signature: string }) {
  const A = toBigInt(input.A); const B = toBigInt(input.B); const v = toBigInt(input.verifier); const b = toBigInt(input.b)
  if (A % N === ZERO) return false
  const u = toBigInt(sha256(Buffer.concat([pad(A), pad(B)])))
  const S = modPow(A * modPow(v, u, N) % N, b, N)
  const ikm = pad(S)
  const prk = createHmac('sha256', pad(u)).update(ikm).digest()
  const hkdf = createHmac('sha256', prk).update(Buffer.concat([Buffer.from('Caldera Derived Key'), Buffer.from([1])])).digest().subarray(0, 16)
  const poolName = input.poolId.includes('_') ? input.poolId.split('_').slice(1).join('_') : input.poolId
  const message = Buffer.concat([Buffer.from(poolName), Buffer.from(input.username), Buffer.from(input.secretBlock, 'base64'), Buffer.from(input.timestamp)])
  const expected = createHmac('sha256', hkdf).update(message).digest()
  const actual = Buffer.from(input.signature, 'base64')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
