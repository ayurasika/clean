import { handlePreflightAndValidation, callGemini, extractText } from './_lib/gemini.js'

export default async function handler(req, res) {
  if (handlePreflightAndValidation(req, res)) return

  try {
    const { imageBase64 } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    const prompt = `あなたは「片付けの司令塔AI」です。この部屋の写真を戦略的に分析してください。

## 分析のステップ

### STEP 1: ゾーニング分析
部屋を以下のようなエリア（ゾーン）に分けて認識してください：
- デスク周り
- ベッド周り
- 床・通路
- クローゼット・収納
- 本棚・シェルフ
- キッチン周り
- その他

### STEP 2: 戦略的エリア選定
認識したエリアの中から、**最も短時間で達成感が出て、片付けのハードルが低いエリア**を1つだけ選んでください。

選定基準：
1. 5〜15分で目に見える成果が出せる
2. 精神的・肉体的負担が少ない
3. 片付けると他のエリアにも良い影響を与える
4. 「やった！」という達成感を得やすい

### STEP 3: 具体的タスクの提案
選んだエリアに特化した、具体的で実行可能なタスクを3つ提案してください。
各タスクは「〇〇を△△する」という明確な形式で書いてください。

## 出力形式

まず、分析コメントを2〜3文で書いてください。温かく励ますトーンで書いてください。

次に、必ず以下のJSON形式で出力してください：
{
  "dirtyLevel": 0-100の数値,
  "selectedZone": "選んだエリア名",
  "reason": "なぜこのエリアから始めるべきか（ユーザーを励ます温かい言葉で）",
  "tasks": ["タスク1", "タスク2", "タスク3"],
  "estimatedTime": "推定所要時間（例：10分）",
  "zones": ["認識した全エリアのリスト"]
}`

    const response = await callGemini('gemini-2.0-flash', {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: base64Data } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return res.status(response.status).json({
        error: errorData.error?.message || 'Gemini API エラー',
      })
    }

    const data = await response.json()
    const analysisText = extractText(data)

    res.json({
      success: true,
      analysis: analysisText,
      rawResponse: data,
    })
  } catch (error) {
    console.error('サーバーエラー:', error)
    res.status(500).json({ error: error.message })
  }
}
