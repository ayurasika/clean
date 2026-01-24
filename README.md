# かたづけナビAI (Katazuke Navi AI)

AI駆動の片付けサポートアプリケーション - あなたの部屋を「未来予想図」で可視化します。

## 🎯 主な機能

- 📸 **部屋の写真分析**: AIが部屋の散らかり具合を分析
- 🔮 **未来予想図生成**: Gemini APIで「片付け後のビジョン」を生成
- 🔍 **高度な検品システム (v3.0)**: 生成画像の品質を自動チェック
- 🔄 **インテリジェントリトライ (v3.0)**: 品質が低い場合は自動で再生成
- 🛡️ **物体保護機能 (v3.0)**: 家具・家電を座標指定で確実に保護

## 🚀 v3.0 の新機能

### 1. 高度な検品フェーズ（Self-Critic）
生成直後に、Gemini 1.5 Proを使用して2つの基準で厳格にチェック：
- **整合性保護**: 主要な家具・設備が正しく維持されているか
- **片付け効果**: 元画像と比べて劇的に片付いているか

### 2. インテリジェントなリトライロジック
検品結果が「FAIL」の場合、自動で1回だけ再生成：
- 検品時の失敗理由をプロンプトに追加
- 「前回の失敗を繰り返さないように」とAIに指示

### 3. 座標指定による保護強化
分析ステップで主要な物体の座標（bounding box）を取得：
- 座標を「物理的境界線」としてプロンプトに渡す
- その範囲のピクセルを極力変更しないよう指示

## 📊 API使用状況トラッキング

以下の項目を日次でトラッキング：
- Flash生成: 50回/日
- Pro生成: 10回/日
- 検品: 100回/日
- リトライ: 50回/日

## 🛠️ 技術スタック

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```
### ngrok http --host-header=rewrite 5173