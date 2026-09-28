/**
 * Gemini API 共通ヘルパー（Vercel Serverless Functions用）
 */

import { setCorsHeaders as setCors, isOriginAcceptable, isBodyTooLarge } from './security.js'

/**
 * APIキーはサーバー側だけで使う名前（GEMINI_API_KEY）を優先。
 * 以前の VITE_GEMINI_API_KEY も互換のため読むが、VITE_ で始まる名前は
 * フロントのコードから参照されると公開ファイルに埋め込まれてしまうので、移行を推奨。
 */
export function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
}

/**
 * CORS ヘッダーを設定（自サイトのオリジンだけ許可）
 */
export function setCorsHeaders(req, res) {
  setCors(req, res)
}

/**
 * OPTIONSプリフライト / メソッドチェック / 呼び出し元チェック / サイズチェック / APIキーチェックの共通処理
 * @returns {boolean} true なら呼び出し元は即 return すべき
 */
export function handlePreflightAndValidation(req, res, allowedMethods = ['POST']) {
  setCors(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }

  if (!allowedMethods.includes(req.method)) {
    res.status(405).json({ error: 'Method not allowed' })
    return true
  }

  if (!isOriginAcceptable(req)) {
    res.status(403).json({ error: 'このサイトからの利用は許可されていません。' })
    return true
  }

  if (isBodyTooLarge(req)) {
    res.status(413).json({ error: '送信データが大きすぎます。もう少し小さい画像でお試しください。' })
    return true
  }

  if (req.method === 'POST' && (!req.body || typeof req.body !== 'object')) {
    res.status(400).json({ error: 'リクエストの形式が正しくありません。' })
    return true
  }

  if (!getGeminiApiKey()) {
    res.status(503).json({ error: 'ただいまサービスを準備中です。', code: 'MISSING_API_KEY' })
    return true
  }

  return false
}

/**
 * Gemini API を呼び出す
 */
export async function callGemini(model, body) {
  const apiKey = getGeminiApiKey()
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      // キーは URL ではなくヘッダーで渡す（URL がエラーやログに残っても漏れないように）
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    }
  )
  return response
}

/**
 * Gemini レスポンスからテキストを抽出
 */
export function extractText(data) {
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

/**
 * Gemini レスポンスから画像を抽出
 */
export function extractImage(data) {
  if (data.candidates?.[0]?.content?.parts) {
    for (const part of data.candidates[0].content.parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        return part.inlineData.data
      }
    }
  }
  return null
}
