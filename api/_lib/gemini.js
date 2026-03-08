/**
 * Gemini API 共通ヘルパー（Vercel Serverless Functions用）
 */

export function getGeminiApiKey() {
  return process.env.VITE_GEMINI_API_KEY
}

/**
 * CORS ヘッダーを設定
 */
export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

/**
 * OPTIONSプリフライト / メソッドチェック / APIキーチェックの共通処理
 * @returns {boolean} true なら呼び出し元は即 return すべき
 */
export function handlePreflightAndValidation(req, res, allowedMethods = ['POST']) {
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return true
  }

  if (!allowedMethods.includes(req.method)) {
    res.status(405).json({ error: 'Method not allowed' })
    return true
  }

  if (!getGeminiApiKey()) {
    res.status(503).json({ error: 'Gemini APIキーが設定されていません', code: 'MISSING_API_KEY' })
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
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
