/**
 * 公開運用向けの安全対策ヘルパー
 * - CORS を自サイトのオリジンだけに制限
 * - アクセス元 IP の取得（保存するときはハッシュ化）
 * - 入力チェック（画像の形式・サイズ、文字数、リクエスト全体のサイズ）
 * - 利用者に見せるエラーメッセージ（内部情報を出さない）
 */
import { createHash } from 'crypto'

const DEFAULT_ALLOWED_ORIGIN = 'https://clean-rosy.vercel.app'
const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://localhost:3000',
  'http://localhost:3001',
]

function intEnv(name, fallback) {
  const v = parseInt(process.env[name], 10)
  return Number.isFinite(v) && v >= 0 ? v : fallback
}

// base64 文字数の上限（初期値 4,000,000 文字 ≒ 画像 約3MB）
// ※ Vercel は 4.5MB を超えるリクエストをそもそも受け付けない
export const MAX_IMAGE_BASE64_CHARS = intEnv('MAX_IMAGE_BASE64_CHARS', 4_000_000)
export const MAX_BODY_BYTES = intEnv('MAX_BODY_BYTES', 4_400_000)
export const MAX_CHAT_MESSAGE_CHARS = intEnv('MAX_CHAT_MESSAGE_CHARS', 500)
export const MAX_CHAT_MESSAGES = intEnv('MAX_CHAT_MESSAGES', 20)

export function getAllowedOrigins() {
  const configured = (process.env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN)
    .split(',')
    .map(s => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
  const list = [...configured, ...DEV_ORIGINS]
  // Vercel のプレビュー環境（自分自身の URL）も許可
  if (process.env.VERCEL_URL) list.push(`https://${process.env.VERCEL_URL}`)
  if (process.env.VERCEL_BRANCH_URL) list.push(`https://${process.env.VERCEL_BRANCH_URL}`)
  return list
}

export function isAllowedOrigin(origin) {
  if (!origin) return false
  return getAllowedOrigins().includes(origin.replace(/\/$/, ''))
}

/**
 * CORS ヘッダーを設定（許可したオリジンにだけ返す）
 */
export function setCorsHeaders(req, res) {
  const origin = req?.headers?.origin
  res.setHeader('Vary', 'Origin')
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Max-Age', '600')
  }
  res.setHeader('Cache-Control', 'no-store')
}

/**
 * POST は許可されたサイト（Origin ヘッダー）からのみ受け付ける。
 * ブラウザは POST のとき必ず Origin を付けるので、正規の利用者には影響しない。
 * 他サイトに埋め込まれて勝手に使われるのを防ぐ（curl 等の直接アクセスは rate limit で防ぐ）。
 */
export function isOriginAcceptable(req) {
  if (req.method === 'GET' || req.method === 'OPTIONS') return true
  return isAllowedOrigin(req.headers?.origin)
}

/**
 * アクセス元 IP（Vercel が設定するヘッダーを優先）
 */
export function getClientIp(req) {
  const h = req.headers || {}
  const real = h['x-real-ip']
  if (real) return String(real).trim()
  const fwd = h['x-forwarded-for']
  if (fwd) return String(fwd).split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

/**
 * IP をそのまま保存しないようにハッシュ化
 */
export function hashIp(ip) {
  const salt = process.env.RATE_LIMIT_SALT || 'katazuke-navi'
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 24)
}

/**
 * リクエスト全体が大きすぎないか
 */
export function isBodyTooLarge(req) {
  const len = parseInt(req.headers?.['content-length'] || '0', 10)
  return Number.isFinite(len) && len > MAX_BODY_BYTES
}

const MAGIC = [
  { mime: 'image/jpeg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    mime: 'image/webp',
    test: b => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
]

/**
 * 画像データ（data URL または base64）をチェックする
 * @returns {{ ok: true, data: string, mimeType: string } | { ok: false, status: number, error: string }}
 */
export function validateImage(imageBase64) {
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    return { ok: false, status: 400, error: '画像データが必要です' }
  }
  if (imageBase64.length > MAX_IMAGE_BASE64_CHARS + 100) {
    return { ok: false, status: 413, error: '画像のサイズが大きすぎます。もう少し小さい画像でお試しください。' }
  }

  let data = imageBase64
  const m = imageBase64.match(/^data:([a-zA-Z0-9.+/-]+);base64,/)
  if (m) {
    if (!m[1].startsWith('image/')) {
      return { ok: false, status: 400, error: '画像ファイルを選んでください。' }
    }
    data = imageBase64.slice(m[0].length)
  }

  if (data.length > MAX_IMAGE_BASE64_CHARS) {
    return { ok: false, status: 413, error: '画像のサイズが大きすぎます。もう少し小さい画像でお試しください。' }
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    return { ok: false, status: 400, error: '画像データの形式が正しくありません。' }
  }

  const head = Buffer.from(data.slice(0, 32), 'base64')
  const found = MAGIC.find(x => head.length >= 12 && x.test(head))
  if (!found) {
    return { ok: false, status: 400, error: 'JPEG・PNG・WebP の画像を選んでください。' }
  }
  return { ok: true, data, mimeType: found.mime }
}

/**
 * 文字列の長さをチェック
 */
export function validateText(value, { required = false, max = 200, name = '入力' } = {}) {
  if (value === undefined || value === null || value === '') {
    return required ? { ok: false, error: `${name}が必要です` } : { ok: true, value: '' }
  }
  if (typeof value !== 'string') return { ok: false, error: `${name}の形式が正しくありません` }
  if (value.length > max) return { ok: false, error: `${name}は${max}文字以内にしてください` }
  return { ok: true, value }
}

/**
 * Gemini API のエラーを、利用者向けのやさしい文に変換（内部のエラー本文は返さない）
 */
export function friendlyUpstreamError(status) {
  if (status === 429) {
    return { status: 429, error: 'ただいま混み合っています。少し時間をおいてから、もう一度お試しください。' }
  }
  if (status === 503 || status === 500 || status === 502 || status === 504) {
    return { status: 503, error: 'AIが混雑しています。しばらく待ってから、もう一度お試しください。' }
  }
  if (status === 400) {
    return { status: 400, error: 'この画像はうまく読み取れませんでした。別の写真でお試しください。' }
  }
  return { status: 502, error: 'AIの処理でエラーが起きました。時間をおいて、もう一度お試しください。' }
}

export const GENERIC_SERVER_ERROR = 'エラーが起きました。時間をおいて、もう一度お試しください。'

/**
 * サーバーログ用：利用者の写真や会話の中身を含めず、エラーの種類だけを残す
 */
export function logError(label, error) {
  const msg = error && error.message ? String(error.message).slice(0, 200) : String(error).slice(0, 200)
  console.error(`${label}: ${msg}`)
}
