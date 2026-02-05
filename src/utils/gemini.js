/**
 * Gemini API連携用のユーティリティ
 * Google Gemini 2.0 Flash (Imagen 3) を使用して画像を編集します
 * Image-to-Image 変換で元の部屋の構造を維持しながら綺麗にします
 */

// APIベースURL（Viteプロキシ経由で相対パスを使用）
// ngrok経由でも動作するように空文字列（相対パス）をデフォルトに
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

/**
 * 撮影した部屋の写真を元に、片付いた後の未来予想図を生成する
 * Gemini の Image-to-Image 機能で元の部屋の構造を95%以上維持
 * @param {string} imageBase64 - 撮影した部屋の Base64 画像データ
 * @param {boolean} isRegenerate - 再生成モード（より強力なプロンプト使用）
 * @param {boolean} highQuality - 高画質モード（Proモデル使用）
 * @returns {Promise<Object>} 生成された画像情報
 */
export async function generateFutureVision(imageBase64, isRegenerate = false, highQuality = false) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/gemini/edit-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64: imageBase64,
        editType: isRegenerate ? 'future_vision_stronger' : 'future_vision',
        highQuality: highQuality,
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
      imageBase64: data.imageBase64,
      model: data.model,
      usage: data.usage,
    }
  } catch (error) {
    console.error('Gemini 画像編集エラー:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * API使用状況を取得する
 * @returns {Promise<Object>} 使用状況（flash, proの使用回数と上限）
 */
export async function getUsageStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/usage`)
    if (!response.ok) {
      throw new Error('使用状況の取得に失敗しました')
    }
    const data = await response.json()
    return {
      success: true,
      usage: data.usage,
    }
  } catch (error) {
    console.error('使用状況取得エラー:', error)
    return {
      success: false,
      error: error.message,
      usage: { flash: { used: 0, limit: 50 }, pro: { used: 0, limit: 10 } },
    }
  }
}

/**
 * Inpainting: 部屋の写真からゴミ・散らかった物を消去して綺麗にする
 * 元の床や壁のテクスチャを維持しながら不要なものを除去
 * @param {string} imageBase64 - 撮影した部屋の Base64 画像データ
 * @param {string} maskBase64 - マスク画像（オプション、消去したい部分を白で指定）
 * @returns {Promise<Object>} 編集された画像情報
 */
export async function inpaintCleanRoom(imageBase64, maskBase64 = null) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/gemini/inpaint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64: imageBase64,
        maskBase64: maskBase64,
        editType: 'inpaint_clean',
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
      imageBase64: data.imageBase64,
    }
  } catch (error) {
    console.error('Gemini Inpainting エラー:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * 片付け場所を分析する（Gemini で場所と行動を特定）
 * @param {string} imageBase64 - 撮影した部屋の Base64 画像データ
 * @returns {Promise<Object>} 分析結果（spots配列、encouragementなど）
 */
export async function analyzeCleanupSpots(imageBase64) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/analyze-cleanup-spots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64: imageBase64,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `APIエラー: ${response.statusText}`)
    }

    const data = await response.json()
    return {
      success: true,
      spots: data.spots || [],
      totalEstimatedTime: data.totalEstimatedTime || '不明',
      encouragement: data.encouragement || '一緒に片付けましょう！',
      rawText: data.rawText,
    }
  } catch (error) {
    console.error('片付け分析エラー:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * 戦略的分析を実行（Gemini統一版）
 * 部屋をゾーニングし、最適な片付けエリアとタスクを提案
 * @param {string} imageBase64 - 撮影した部屋の Base64 画像データ
 * @returns {Promise<Object>} 分析結果
 */
export async function analyzeStrategic(imageBase64) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64: imageBase64,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `APIエラー: ${response.statusText}`)
    }

    const data = await response.json()
    return {
      success: true,
      analysis: data.analysis,
      rawResponse: data.rawResponse,
    }
  } catch (error) {
    console.error('戦略的分析エラー:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * 部屋の整理イメージを生成（散らかった物を整理整頓した状態に変換）
 * @param {string} imageBase64 - 撮影した部屋の Base64 画像データ
 * @returns {Promise<Object>} 編集された画像情報
 */
export async function generateOrganizedRoom(imageBase64) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/gemini/edit-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64: imageBase64,
        editType: 'organize',
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
      imageBase64: data.imageBase64,
    }
  } catch (error) {
    console.error('Gemini 整理イメージ生成エラー:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}
