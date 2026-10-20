#!/usr/bin/env node
/**
 * SNS運用の記事を、アイキャッチ画像付きで microCMS に下書き投稿する
 *
 *   1. Management API (microcms-management.io) に画像をアップロード
 *   2. 返ってきた画像URLを eyecatch に入れて Content API に下書きPOST
 *
 * APIキーの渡し方は scripts/lib/microcms-key.mjs 参照
 * （環境変数 MICROCMS_API_KEY → .microcms-key → 対話入力）
 *
 * 例:
 *   node scripts/post-sns-article.mjs --yes
 *   node scripts/post-sns-article.mjs --yes --image-url https://images.microcms-assets.io/...
 *   node scripts/post-sns-article.mjs --yes --dry-run
 *
 * オプション:
 *   --yes, -y            確認プロンプトをスキップ（非対話環境ではこれが承認の代わり）
 *   --key-file <path>    キーファイルの場所を変更
 *   --image-url <url>    アップロードを省略し、既存の画像URLを使う
 *   --dry-run            APIを叩かず、送信する内容だけ表示する
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKeyArgs, resolveApiKey } from './lib/microcms-key.mjs';

const SERVICE_DOMAIN = 'lif-blog';
const ENDPOINT = 'blogs';

const CONTENT_API = `https://${SERVICE_DOMAIN}.microcms.io/api/v1/${ENDPOINT}`;
const MANAGEMENT_API = `https://${SERVICE_DOMAIN}.microcms-management.io/api/v1`;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_PATH = path.join(scriptDir, 'eyecatch-sns.png');

const argv = process.argv.slice(2);
const { assumeYes, keyFileArg } = parseKeyArgs(argv);
const dryRun = argv.includes('--dry-run');
const imageUrlArg = (() => {
  const i = argv.indexOf('--image-url');
  return i !== -1 ? argv[i + 1] : undefined;
})();

// ---------------------------------------------------------------- 記事本体

const article = {
  title: 'SNS運用を「続く仕組み」に変える5つの型',
  category: ['SNS運用'],
  content: `
<p>SNS運用がうまくいかない原因の多くは、センスでも投稿本数でもありません。「何を・誰に・どの順番で出すか」が決まっていないまま、毎回ゼロから考えてしまうことにあります。</p>
<p>逆に言えば、型を用意しておけば運用は続きます。ここでは、私たちが実際の運用支援で使っている5つの型を公開します。</p>

<h2>1. 認知の型：最初の2秒で「自分ごと」にさせる</h2>
<p>タイムラインで止まってもらえるかは、冒頭の2秒でほぼ決まります。商品の説明から入るのではなく、相手が抱えている状況をそのまま言語化するところから始めます。「集客が止まった」「採用の応募が来ない」といった、読み手が自分の言葉として認識できる書き出しが有効です。</p>

<h2>2. 信頼の型：実績ではなく「過程」を見せる</h2>
<p>完成した成果物だけを並べても、信頼にはつながりにくいものです。どう考えて、何に迷い、どう判断したのか。その過程を出すほうが、専門性は伝わります。数字を出せる場合は、増加率だけでなく前提条件もあわせて示すと誠実さが伝わります。</p>

<h2>3. 教育の型：買う前に知っておくべきことを先に伝える</h2>
<p>選び方の基準、よくある失敗、相場感。購入前に知りたい情報を出し切ることで、比較検討の土俵に乗ります。ここを出し惜しみすると、価格だけで比べられる土俵に引きずり込まれます。</p>

<h2>4. 接点の型：行動のハードルを一段だけ下げる</h2>
<p>いきなり「お問い合わせください」ではなく、資料を見る、事例を読む、質問だけする、といった一段低い行動を用意します。SNSは検討の入口であって、契約の場ではありません。次の一歩を具体的に書くだけで、反応は変わります。</p>

<h2>5. 継続の型：運用を属人化させない</h2>
<p>担当者の気合いに依存した運用は、必ずどこかで止まります。投稿のテンプレート、素材の置き場所、確認フローを決めておくこと。週次で振り返る指標を2つか3つに絞ること。続けるための仕組みは、面白さよりも先に整えるべきものです。</p>

<h2>まとめ</h2>
<p>5つの型は、どれか1つだけを回しても効果は出にくく、組み合わせてはじめて機能します。まずは自社の投稿を分類して、どの型が不足しているかを見るところから始めてみてください。</p>
<p>株式会社LIFでは、SNS運用の設計から日々の投稿、効果測定までを一貫してお手伝いしています。現状の投稿を見ながらの無料診断も行っていますので、お気軽にご相談ください。</p>
`.trim(),
};

// ---------------------------------------------------------------- 処理

function fail(message, detail) {
  console.error(`\n${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

/** Management API に画像をアップロードして、画像URLを返す */
async function uploadEyecatch(apiKey) {
  if (!fs.existsSync(IMAGE_PATH)) {
    fail(`アイキャッチ画像が見つかりません: ${IMAGE_PATH}`);
  }

  const buf = fs.readFileSync(IMAGE_PATH);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'image/png' }), path.basename(IMAGE_PATH));

  console.log(`\n[1/2] 画像をアップロード中… (${path.basename(IMAGE_PATH)} / ${(buf.length / 1024).toFixed(0)} KB)`);

  const res = await fetch(`${MANAGEMENT_API}/media`, {
    method: 'POST',
    headers: { 'X-MICROCMS-API-KEY': apiKey },
    body: form,
  });

  const text = await res.text();

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      fail(
        `画像のアップロードに失敗しました (HTTP ${res.status})`,
        `${text}\n→ Management API（メディア）の権限が無いキーの可能性があります。\n` +
          '  microCMS管理画面 > サービス設定 > APIキー で「メディア」のアップロード権限を確認してください。\n' +
          '  すでにアップ済みの画像を使う場合は --image-url <URL> を指定できます。',
      );
    }
    fail(`画像のアップロードに失敗しました (HTTP ${res.status} ${res.statusText})`, text);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    fail('アップロードのレスポンスを解析できませんでした', text);
  }

  if (!body.url) {
    fail('レスポンスに画像URLが含まれていません', text);
  }

  console.log(`      アップロード完了: ${body.url}`);
  return body.url;
}

/** Content API に下書きとしてPOSTする */
async function postDraft(apiKey, eyecatchUrl) {
  const payload = { ...article, eyecatch: eyecatchUrl };

  console.log('\n[2/2] 記事を下書きとして投稿中…');

  const res = await fetch(`${CONTENT_API}?status=draft`, {
    method: 'POST',
    headers: {
      'X-MICROCMS-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();

  if (!res.ok) {
    const hints = [];
    if (res.status === 401) hints.push('→ APIキーに Content API の POST 権限がありません。');
    if (res.status === 400) {
      hints.push('→ フィールド定義とのズレが考えられます。以下を確認してください:');
      hints.push('   ・eyecatch が「画像」型か（URL文字列で渡しています）');
      hints.push('   ・category が「複数選択」型で「SNS運用」が選択肢にあるか');
      hints.push(`   ・画像は使えたがcategoryで落ちる場合は、content/title だけで試すと切り分けできます`);
    }
    fail(
      `下書き投稿に失敗しました (HTTP ${res.status} ${res.statusText})`,
      [text, ...hints].join('\n'),
    );
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = {};
  }

  console.log('\n下書きを投稿しました。');
  if (body.id) {
    console.log(`コンテンツID : ${body.id}`);
    console.log(`管理画面     : https://app.microcms.io/${SERVICE_DOMAIN}/apis/${ENDPOINT}/${body.id}`);
    console.log(`プレビュー   : /post/${body.id}（公開後に閲覧可能）`);
  } else {
    console.log(text);
  }
}

async function main() {
  console.log('--- 下書き投稿の内容 ---');
  console.log(`サービスID   : ${SERVICE_DOMAIN}`);
  console.log(`API          : ${ENDPOINT}`);
  console.log('ステータス   : draft（下書き）');
  console.log(`タイトル     : ${article.title}`);
  console.log(`カテゴリ     : ${article.category.join(', ')}`);
  console.log(`本文         : ${article.content.length} 文字（HTML）`);
  console.log(`アイキャッチ : ${imageUrlArg ?? path.relative(process.cwd(), IMAGE_PATH)}`);
  console.log('------------------------');

  if (dryRun) {
    console.log('\n--dry-run のため、APIは呼び出しません。');
    console.log('\n送信する本文（先頭300文字）:');
    console.log(article.content.slice(0, 300) + '…');
    return;
  }

  const apiKey = await resolveApiKey({
    assumeYes,
    keyFileArg,
    confirmLabel: '画像アップロードと下書き投稿を実行',
  });

  const eyecatchUrl = imageUrlArg ?? (await uploadEyecatch(apiKey));
  await postDraft(apiKey, eyecatchUrl);
}

main().catch((err) => {
  fail(`エラー: ${err.message}`, err.stack);
});
