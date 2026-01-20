/**
 * Claude.js API連携用のユーティリティ
 * バックエンドプロキシを経由してClaude APIを使用して画像を分析します
 */

// APIベースURL（Viteプロキシ経由で相対パスを使用）
// ngrok経由でも動作するように空文字列（相対パス）をデフォルトに
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

/**
 * 画像をBase64形式でClaude APIに送信して分析する
 * @param {string} imageBase64 - Base64エンコードされた画像データ
 * @returns {Promise<Object>} 分析結果
 */
export async function analyzeImageWithClaude(imageBase64) {
  try {
    // バックエンドプロキシを経由してAPIを呼び出し
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
      const errorData = await response.json()
      throw new Error(errorData.error || `APIエラー: ${response.statusText}`)
    }

    const data = await response.json()
    return {
      success: true,
      analysis: data.analysis,
      rawResponse: data.rawResponse,
    }
  } catch (error) {
    console.error('Claude API エラー:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * 分析結果に基づいて片付けタスクを生成する
 * @param {string} analysisText - Claudeからの分析テキスト
 * @returns {Object} タスクリスト
 */
export function parseTasksFromAnalysis(analysisText) {
  // TODO: 分析テキストからタスクを抽出するロジックを実装
  // 現時点では仮の実装
  const tasks = []

  // 簡単なパターンマッチングでタスクを抽出
  const lines = analysisText.split('\n')
  lines.forEach((line) => {
    if (line.includes('捨てる') || line.includes('片付ける') || line.includes('整理')) {
      tasks.push({
        text: line.trim(),
        priority: 'high',
      })
    }
  })

  return tasks
}

