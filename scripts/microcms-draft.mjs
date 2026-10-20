#!/usr/bin/env node
/**
 * microCMS Write API でブログ記事を下書き投稿するスクリプト（テスト用）
 *
 * APIキーの渡し方は scripts/lib/microcms-key.mjs 参照
 * （環境変数 MICROCMS_API_KEY → .microcms-key → 対話入力）
 *
 * 例:
 *   node scripts/microcms-draft.mjs                 # 確認プロンプトあり
 *   node scripts/microcms-draft.mjs --yes           # 確認をスキップして投稿
 *   node scripts/microcms-draft.mjs --key-file ~/.lif-microcms-key --yes
 *
 * APIキーは Write 権限（POST）付きのものが必要です。
 * blog.html / post.html に書かれている GET 用キーでは投稿できません。
 */

import { parseKeyArgs, resolveApiKey } from './lib/microcms-key.mjs';

const SERVICE_DOMAIN = 'lif-blog';
const ENDPOINT = 'blogs';

const { assumeYes, keyFileArg } = parseKeyArgs(process.argv.slice(2));

// 投稿する内容（テスト用）
const article = {
  title: 'テスト投稿',
  content: '<p>これはテスト投稿です。</p>',
};

async function main() {
  const url = `https://${SERVICE_DOMAIN}.microcms.io/api/v1/${ENDPOINT}?status=draft`;

  console.log('--- 下書き投稿の内容 ---');
  console.log(`サービスID : ${SERVICE_DOMAIN}`);
  console.log(`API        : ${ENDPOINT}`);
  console.log('ステータス : draft（下書き）');
  console.log(`タイトル   : ${article.title}`);
  console.log(`本文       : ${article.content}`);
  console.log('------------------------');

  const apiKey = await resolveApiKey({ assumeYes, keyFileArg, confirmLabel: '下書き投稿' });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-MICROCMS-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(article),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error(`\n投稿に失敗しました (HTTP ${res.status} ${res.statusText})`);
    console.error(text || '(レスポンス本文なし)');
    if (res.status === 401) {
      console.error('→ APIキーが無効か、Write（POST）権限がありません。');
    }
    if (res.status === 400) {
      console.error('→ 必須フィールド不足の可能性があります。microCMSの blogs API スキーマを確認してください。');
    }
    process.exit(1);
  }

  let body;
  try { body = JSON.parse(text); } catch { body = {}; }

  console.log('\n下書きを投稿しました。');
  if (body.id) {
    console.log(`コンテンツID: ${body.id}`);
    console.log(`管理画面    : https://app.microcms.io/${SERVICE_DOMAIN}/apis/${ENDPOINT}/${body.id}`);
  } else {
    console.log(text);
  }
}

main().catch((err) => {
  console.error(`\nエラー: ${err.message}`);
  process.exit(1);
});
