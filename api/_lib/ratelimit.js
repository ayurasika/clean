/**
 * 利用回数の制限（rate limit）
 *
 * 保存先: Upstash Redis（REST API を fetch で直接呼ぶ。追加パッケージなし）
 *   環境変数 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *
 * これが未設定のときは「メモリ上のカウンタ」で代用するが、
 * Vercel のようなサーバーレス環境では関数が起動し直すたびにリセットされ、
 * 複数のインスタンス間でも共有されないため【信頼できない】。本番では必ず Upstash を設定すること。
 *
 * 数え方: 日本時間の1日ごとにリセット
 *   - 全体の上限（モデルの種類ごと） … 使いすぎ・課金の暴走を止める
 *   - 1つの IP あたりの上限           … 1人が独占するのを止める
 */
import { hashIp } from './security.js'

function intEnv(name, fallback) {
  const v = parseInt(process.env[name], 10)
  return Number.isFinite(v) && v >= 0 ? v : fallback
}

// 全体（1日あたり）の上限 … 以前の server.js と同じ値を初期値にしている
export function getGlobalLimits() {
  return {
    flash: intEnv('LIMIT_FLASH_PER_DAY', 50), // 画像生成（Flash）
    pro: intEnv('LIMIT_PRO_PER_DAY', 10), // 画像生成（Pro・高画質）
    inspection: intEnv('LIMIT_INSPECTION_PER_DAY', 100), // 生成画像の検品
    retry: intEnv('LIMIT_RETRY_PER_DAY', 50), // 検品NG時の作り直し
    text: intEnv('LIMIT_TEXT_PER_DAY', 300), // 文章系（分析・住所相談チャット）
  }
}

// 1つの IP あたり（1日あたり）の上限
export function getIpLimits() {
  return {
    image: intEnv('LIMIT_IP_IMAGE_PER_DAY', 5), // 未来予想図の生成（Flash+Pro 合算）
    text: intEnv('LIMIT_IP_TEXT_PER_DAY', 40), // 分析・チャット
  }
}

const TTL_SECONDS = 60 * 60 * 48

function todayJst() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

const globalKey = (tier, day = todayJst()) => `kz:rl:${day}:g:${tier}`
const ipKey = (bucket, ip, day = todayJst()) => `kz:rl:${day}:ip:${bucket}:${hashIp(ip)}`

// ------------------------------------------------------------
// 保存先（Upstash or メモリ）
// ------------------------------------------------------------
function hasUpstash() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

let warned = false
function warnMemoryOnce() {
  if (warned) return
  warned = true
  console.warn(
    '⚠️ [rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN が未設定のため、メモリ上のカウンタで代用しています。' +
      'サーバーレス環境ではリセット・分散されるため、利用回数の制限は【信頼できません】。本番では必ず Upstash を設定してください。'
  )
}

const memory = new Map() // key -> number
let memoryDay = todayJst()
function memoryReset() {
  const d = todayJst()
  if (d !== memoryDay) {
    memory.clear()
    memoryDay = d
  }
}

async function upstashPipeline(commands) {
  const url = process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/, '')
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  })
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`)
  const out = await res.json()
  return out.map(r => {
    if (r.error) throw new Error(`Upstash: ${r.error}`)
    return r.result
  })
}

async function incrKeys(keys) {
  if (hasUpstash()) {
    try {
      const cmds = []
      for (const k of keys) {
        cmds.push(['INCR', k])
        cmds.push(['EXPIRE', k, TTL_SECONDS])
      }
      const results = await upstashPipeline(cmds)
      return keys.map((_, i) => Number(results[i * 2]))
    } catch (e) {
      console.error(`[rate-limit] Upstash に接続できないためメモリで代用します: ${e.message}`)
    }
  } else {
    warnMemoryOnce()
  }
  memoryReset()
  return keys.map(k => {
    const v = (memory.get(k) || 0) + 1
    memory.set(k, v)
    return v
  })
}

async function decrKeys(keys) {
  if (hasUpstash()) {
    try {
      await upstashPipeline(keys.map(k => ['DECR', k]))
      return
    } catch (e) {
      console.error(`[rate-limit] Upstash DECR 失敗: ${e.message}`)
    }
  }
  memoryReset()
  for (const k of keys) memory.set(k, Math.max(0, (memory.get(k) || 0) - 1))
}

async function getKeys(keys) {
  if (hasUpstash()) {
    try {
      const [vals] = await upstashPipeline([['MGET', ...keys]])
      return vals.map(v => Number(v || 0))
    } catch (e) {
      console.error(`[rate-limit] Upstash 読み取り失敗: ${e.message}`)
    }
  } else {
    warnMemoryOnce()
  }
  memoryReset()
  return keys.map(k => memory.get(k) || 0)
}

// ------------------------------------------------------------
// 公開関数
// ------------------------------------------------------------

/**
 * 1回分を使う（全体上限 + 任意で IP 上限）。上限を超えたら使わずに false を返す。
 * @param {object} opts
 * @param {string} opts.tier     全体上限の種類（flash / pro / inspection / retry / text）
 * @param {string} [opts.ip]     IP 上限もかける場合のアクセス元 IP
 * @param {string} [opts.ipBucket] IP 上限の種類（image / text）
 * @returns {Promise<{ ok: boolean, reason?: 'global'|'ip' }>}
 */
export async function tryConsume({ tier, ip, ipBucket }) {
  const gLimit = getGlobalLimits()[tier]
  const keys = [globalKey(tier)]
  let iLimit = null
  if (ip && ipBucket) {
    iLimit = getIpLimits()[ipBucket]
    keys.push(ipKey(ipBucket, ip))
  }

  const [gCount, iCount] = await incrKeys(keys)
  const overGlobal = gCount > gLimit
  const overIp = iLimit !== null && iCount > iLimit
  if (overGlobal || overIp) {
    await decrKeys(keys) // 使わなかったので戻す
    return { ok: false, reason: overIp ? 'ip' : 'global' }
  }
  return { ok: true }
}

/**
 * IP 上限だけを先に確認・消費する（全体上限は後で種類を決めてから消費する場合に使う）
 */
export async function tryConsumeIp(ip, ipBucket) {
  const limit = getIpLimits()[ipBucket]
  const key = ipKey(ipBucket, ip)
  const [count] = await incrKeys([key])
  if (count > limit) {
    await decrKeys([key])
    return false
  }
  return true
}

/** 消費した分を取り消す（処理が始まる前に失敗したとき用） */
export async function refundIp(ip, ipBucket) {
  await decrKeys([ipKey(ipBucket, ip)])
}
export async function refundGlobal(tier) {
  await decrKeys([globalKey(tier)])
}

/**
 * 今日の使用状況（全体 + このIP）
 */
export async function getUsage(ip) {
  const g = getGlobalLimits()
  const i = getIpLimits()
  const tiers = Object.keys(g)
  const buckets = Object.keys(i)
  const keys = [...tiers.map(t => globalKey(t)), ...buckets.map(b => ipKey(b, ip))]
  const vals = await getKeys(keys)

  const usage = {}
  tiers.forEach((t, idx) => {
    usage[t] = { used: Math.min(vals[idx], g[t]), limit: g[t] }
  })
  const you = {}
  buckets.forEach((b, idx) => {
    you[b] = { used: Math.min(vals[tiers.length + idx], i[b]), limit: i[b] }
  })
  return { usage, you, storage: hasUpstash() ? 'upstash' : 'memory' }
}

export const LIMIT_MESSAGES = {
  ip: '今日の利用回数の上限に達しました。明日また使ってください。（日本時間の0時にリセットされます）',
  global: 'たくさんの方に使っていただいたため、今日の受付は終了しました。明日また使ってください。',
}
