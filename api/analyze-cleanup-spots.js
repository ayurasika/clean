import { handlePreflightAndValidation, callGemini } from './_lib/gemini.js'

export default async function handler(req, res) {
  if (handlePreflightAndValidation(req, res)) return

  try {
    const { imageBase64 } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    const systemInstruction = `You are the world's best professional cleaning advisor and room organization expert.
あなたは世界最高のプロ清掃アドバイザーであり、部屋整理の専門家です。

【YOUR EXPERTISE】
- 20年以上の片付けコンサルティング経験
- 心理学に基づく「やる気を引き出す」アドバイス
- 日本の住環境に精通

【YOUR PERSONALITY】
- 温かく励ます口調
- 具体的で実行しやすいアドバイス
- 小さな成功体験を大切にする`

    const analyzePrompt = `【TASK】部屋を分析し、ゲシュタルト心理学に基づくマイクロ片付けタスクを提案してください。

【最重要：見逃し禁止】
画像を隅々まで注意深く観察し、テーブルや床の上にある全てのアイテムを検出してください。
小さいものも、部分的にしか見えないものも、全て拾い上げること。

チェックリスト（見落としやすいもの）:
- 飲み物（コップ、ペットボトル、缶）
- 食べ物・お菓子
- リモコン
- スマートフォン、タブレット、充電器
- メガネ、メガネケース
- ティッシュ箱、ティッシュのゴミ
- 本、雑誌、新聞
- 書類、封筒、チラシ、レシート
- ペン、ハサミ、文房具
- 化粧品、ハンドクリーム
- 鍵、財布
- ケーブル、イヤホン
- 袋、箱

【重要】
- 各タスクは30秒〜2分で完了でき、視覚的な「秩序感」の向上が著しいものにする
- 部屋が完全に片付くまで必要なタスクを全て生成する（上限なし）
- 見えているアイテム全てに対応するタスクを作成する
- 少なすぎは禁止（最低でも5個以上）

【タスクの細分化ルール - 最重要】
1つのタスクには1つのアクションだけ。複合的な指示は禁止。

悪い例（禁止）:
❌「カウンター上の食品や調味料を整理し、使用頻度の低いものは収納する」
❌「書類を分類して、不要なものは捨てる」
❌「衣類を畳んで、クローゼットにしまう」

良い例（推奨）:
✅「カウンター上の食品をキッチンへ持っていく」
✅「調味料をキッチンの棚に戻す」
✅「書類を一箇所に集める」
✅「不要な紙をゴミ箱に捨てる」
✅「衣類を畳む」
✅「畳んだ衣類をクローゼットへ持っていく」

各タスクは「〇〇を△△する」という単純な形式にする。
「整理する」「片付ける」などの曖昧な動詞は使わない。

【カテゴリー別のアクション例】
■ 書類・紙類 (documents)
  - 「バラバラの紙を1つの束にまとめ、角を机の角に合わせる」(30秒)
  - 「DMやチラシを、大きいものから順に重ね直す」(60秒)
  - 「書類の向きを揃えて一箇所に重ねる」(60秒)

■ 衣類・布製品 (clothes)
  - 「床の衣類をベッドの上かカゴに集める」(60秒)
  - 「ハンガーの衣類の向きを揃える」(90秒)

■ 食器・キッチン用品 (kitchen)
  - 「シンクの食器を重ねられるもの同士で積み上げる」(60秒)
  - 「同じ素材のものを集める（ガラス、陶器等）」(90秒)

■ 文房具・おもちゃ (stationery)
  - 「赤いものだけをペン立てに戻す」(30秒)
  - 「散らばった小物を部屋の中央に集める」(60秒)

【OUTPUT FORMAT - JSON only】
{
  "spots": [
    {
      "category": "documents/clothes/kitchen/stationery/other",
      "location": "場所名（例：テーブルの上）",
      "items": "散らかっているもの",
      "action": "30秒〜2分でできる具体的なアクション",
      "principle": "適用するゲシュタルト法則（近接/類同/閉合/共通運命）",
      "visualEffect": "視覚的効果の説明（丁寧語で。例：輪郭が明確になります、ノイズが減ります）",
      "estimatedTime": "30秒/60秒/90秒/2分"
    }
  ],
  "totalEstimatedTime": "全体の推定時間",
  "encouragement": "温かい励ましの言葉（日本語）"
}

【ルール】
- 各タスクは2分以内で完了できるものに限定
- 「内容の確認」や「判断」を必要としないアクションにする
- 「幾何学的な整合」や「グルーピング」に特化する
- visualEffectは丁寧語（です・ます調）で書く
- クリップ、輪ゴム、収納ボックス等の道具を必要とするアクションは避ける
- 「重ねる」「揃える」「集める」「立てる」など道具不要のアクションを優先する

【タスク優先順位 - 画像に実際に見えるものだけを対象にすること】
※以下は「もし見えたら」の条件付きルール。見えないものはタスクに含めないこと。

1. ゴミが見える場合のみ → 最初のタスク：「ゴミをゴミ箱に捨てる」（30秒）
2. 別の場所にあるべきものが見える場合のみ → 「〇〇を△△へ移動する」
   - テーブルやデスクに食器・コップがある → 「食器をキッチンへ持っていく」
   - リビングに洗濯物がある → 「洗濯物を寝室へ移動する」
   - 調味料がダイニングにある → 「調味料をキッチンへ戻す」
3. その後、整理・グルーピングのタスク

【絶対ルール】
- 画像に写っていないものをタスクに含めてはいけない（存在しないアイテムの捏造は厳禁）
- 推測や一般的なアドバイスは禁止
- 実際に見えるアイテムだけを具体的に指示する
- 「小物」「雑貨」「もの」などの曖昧な表現は禁止
- 必ず具体的なアイテム名を使う（例：リモコン、ペン、本、マグカップ、ティッシュ箱など）
- ユーザーが「あ、これのことだ」とすぐ分かる表現にする

【アクションのルール】
- 食器、コップ、調味料 → 「キッチンへ持っていく」
- お菓子の袋（中身あり）、未開封の食べ物 → 「キッチンへ持っていく」
- お菓子の袋（空）、食べ終わったゴミ、ティッシュのゴミ、レシート → 「ゴミ箱へ捨てる」
- 衣類、タオル → 「洗濯カゴへ入れる」または「クローゼットへ持っていく」
- 本、雑誌 → 「本棚へ戻す」または「重ねて端に寄せる」
- 書類、紙 → 「重ねて揃える」
- おもちゃ → 「おもちゃ置き場へ戻す」
- ペン、文房具 → 「ペン立てに戻す」または「まとめて一箇所に集める」
- ゴミ → 「ゴミ箱へ捨てる」
- ポーチ、バッグ、トートバッグ、財布、メガネケースなど個人の持ち物 → 「所定の場所に戻す」（この表現をそのまま使う）
- おもちゃ、ゲーム、ルービックキューブ、ボールなど → 「所定の場所に戻す」（この表現をそのまま使う）
- 帽子、衣類小物 → 「所定の場所に戻す」（「クローゼット」など具体的な場所を推測しない）
- その他すべて → 「所定の場所に戻す」を使う（「棚に置く」などと推測しない）
※「棚」「クローゼット」など具体的な場所の推測は禁止。ユーザーの家の収納場所は分からないため。
※「ラベルを揃える」「向きを変える」などの細かい整頓より、まず「あるべき場所へ移動」を優先する

【見逃し防止：細かいものも必ず検出】
ペン、鉛筆、消しゴム、クリップ、輪ゴム、シール、小さなおもちゃ、充電ケーブル、イヤホン、
コイン、鍵、アクセサリーなど、小さいものも1つ1つ個別にタスク化すること。
「文房具をまとめる」ではなく「ペンをペン立てに戻す」「消しゴムを筆箱に入れる」のように個別に。`

    // マイクロタスク分析（429エラー時リトライ機能付き）
    const makeRequest = async (retryCount = 0) => {
      const response = await callGemini('gemini-2.0-flash', {
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          {
            parts: [
              { text: analyzePrompt },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          topP: 0.9,
          topK: 32,
          responseMimeType: 'application/json',
        },
      })

      if (response.status === 429 && retryCount < 2) {
        console.log(`⏳ レート制限 - ${3 * (retryCount + 1)}秒後にリトライ (${retryCount + 1}/2)`)
        await new Promise(resolve => setTimeout(resolve, 3000 * (retryCount + 1)))
        return makeRequest(retryCount + 1)
      }

      return response
    }

    const response = await makeRequest()

    if (!response.ok) {
      const errorData = await response.json()
      return res.status(response.status).json({
        error: errorData.error?.message || 'Gemini API エラー',
      })
    }

    const data = await response.json()

    let analysisText = ''
    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.text) {
          analysisText = part.text
          break
        }
      }
    }

    let analysisResult = null
    try {
      analysisResult = JSON.parse(analysisText)
    } catch (parseError) {
      const jsonMatch = analysisText.match(/\{[\s\S]*"spots"[\s\S]*\}/)
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0])
      }
    }

    if (!analysisResult) {
      return res.json({
        success: true,
        rawText: analysisText,
        spots: [],
      })
    }

    res.json({
      success: true,
      ...analysisResult,
    })
  } catch (error) {
    console.error('片付け分析サーバーエラー:', error)
    res.status(500).json({ error: error.message })
  }
}
