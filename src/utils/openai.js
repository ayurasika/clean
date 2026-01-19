/**
 * OpenAI.js API連携用のユーティリティ
 *
 * @deprecated このファイルは非推奨です。
 * 画像生成には gemini.js を使用してください。
 * Gemini の Image-to-Image 機能で元の部屋の構造を維持しながら編集できます。
 *
 * DALL-E 3 は元の部屋の構造を維持できないため、このアプリには不向きです。
 */

// APIベースURL（開発環境）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

/**
 * @deprecated gemini.js の generateFutureVision を使用してください
 */
export async function generateFutureVision() {
  console.warn(
    'openai.js の generateFutureVision は非推奨です。gemini.js を使用してください。'
  )
  // Gemini エンドポイントにリダイレクトされます
  try {
    const response = await fetch(`${API_BASE_URL}/api/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        originalImageDescription: 'A Japanese room that needs organizing',
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `APIエラー: ${response.statusText}`)
    }

    const data = await response.json()
    return {
      success: true,
      imageUrl: data.imageUrl,
    }
  } catch (error) {
    console.error('画像生成エラー:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * @deprecated 使用されていません
 */
export async function generateImageWithOpenAI(prompt) {
  console.warn('OpenAI 画像生成は非推奨です。Gemini を使用してください。')
  return {
    success: false,
    error: 'OpenAI 画像生成は非推奨です。Gemini を使用してください。',
  }
}

/**
 * @deprecated 使用されていません
 */
export async function generateBeforeAfterImage(analysisResult) {
  console.warn('この関数は非推奨です。Gemini を使用してください。')
  return {
    success: false,
    error: 'この関数は非推奨です。',
  }
}

/**
 * @deprecated 使用されていません
 */
export async function generateCelebrationImage(missionText) {
  console.warn('この関数は非推奨です。Gemini を使用してください。')
  return {
    success: false,
    error: 'この関数は非推奨です。',
  }
}
