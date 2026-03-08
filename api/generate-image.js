import handler from './gemini/edit-image.js'

export default async function legacyHandler(req, res) {
  // レガシーエンドポイント: editType をデフォルト設定して edit-image に転送
  if (req.body && !req.body.editType) {
    req.body.editType = 'future_vision'
  }
  return handler(req, res)
}
