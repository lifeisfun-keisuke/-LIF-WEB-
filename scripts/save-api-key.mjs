#!/usr/bin/env node
/**
 * microCMS APIキーを対話的に入力して .microcms-key に保存する
 *
 * ・入力は非表示（シェル履歴にも画面にも残らない）
 * ・打ち間違い防止のため2回入力させる
 * ・パーミッション 600（本人のみ読み書き可）で保存
 *
 * 使い方（本物のターミナルで実行すること）:
 *   node scripts/save-api-key.mjs
 *   node scripts/save-api-key.mjs --out ~/別の場所/.microcms-key
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';

const DEFAULT_OUT = path.join(os.homedir(), 'Projects', '-LIF-WEB-', '.microcms-key');

const argv = process.argv.slice(2);
const outArg = (() => {
  const i = argv.indexOf('--out');
  return i !== -1 ? argv[i + 1] : undefined;
})();

function expandHome(p) {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

const OUT_PATH = path.resolve(expandHome(outArg ?? DEFAULT_OUT));

function maskKey(key) {
  if (key.length <= 8) return '*'.repeat(key.length);
  return `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`;
}

/** 非表示入力（入力した文字数ぶんだけ * を表示する） */
function promptHidden(question) {
  const { stdin, stdout } = process;

  return new Promise((resolve, reject) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let buf = '';
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          cleanup();
          stdout.write('\n');
          resolve(buf);
          return;
        }
        if (ch === '\u0003') { // Ctrl-C
          cleanup();
          stdout.write('\n中断しました。保存していません。\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          if (buf.length > 0) {
            buf = buf.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        if (ch >= ' ') {
          buf += ch;
          stdout.write('*');
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/** .gitignore がこのファイルを無視しているか確認する */
function checkGitignore() {
  const dir = path.dirname(OUT_PATH);
  const base = path.basename(OUT_PATH);
  const gitignore = path.join(dir, '.gitignore');

  if (!fs.existsSync(path.join(dir, '.git'))) return; // git管理下でなければ無関係

  const ignored = fs.existsSync(gitignore)
    && fs.readFileSync(gitignore, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .some((l) => l === base || l === `/${base}` || l === `*${base}`);

  if (!ignored) {
    console.warn(`\n警告: ${gitignore} が ${base} を無視していません。`);
    console.warn('      コミットしてしまう危険があるため、.gitignore に追記してください。');
  }
}

async function main() {
  console.log('microCMS APIキーの保存');
  console.log(`保存先: ${OUT_PATH}`);
  console.log('入力は画面に表示されません。シェル履歴にも残りません。\n');

  if (!process.stdin.isTTY) {
    console.error('エラー: 対話入力できない環境です（stdin が TTY ではありません）。');
    console.error('ターミナル.app などの実際のターミナルで実行してください:');
    console.error(`  cd ${path.dirname(OUT_PATH)} && node scripts/save-api-key.mjs`);
    process.exit(1);
  }

  if (fs.existsSync(OUT_PATH)) {
    const existing = fs.readFileSync(OUT_PATH, 'utf8').trim();
    console.log(`既存のキーがあります: ${existing ? maskKey(existing) : '(空)'}`);
    const ok = await confirm('上書きしますか？ (y/N): ');
    if (!ok) {
      console.log('中止しました。変更していません。');
      process.exit(0);
    }
    console.log('');
  }

  const first = await promptHidden('APIキーを入力: ');
  const key = first.trim();

  if (!key) {
    console.error('エラー: 何も入力されませんでした。保存していません。');
    process.exit(1);
  }
  if (/\s/.test(key)) {
    console.error('エラー: キーに空白文字が含まれています。貼り付け内容を確認してください。');
    process.exit(1);
  }

  const second = (await promptHidden('確認のためもう一度入力: ')).trim();
  if (key !== second) {
    console.error('エラー: 2回の入力が一致しません。保存していません。');
    process.exit(1);
  }

  if (key.length < 16) {
    console.warn(`\n注意: キーが短いようです（${key.length}文字）。内容を確認してください。`);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${key}\n`, { mode: 0o600 });
  fs.chmodSync(OUT_PATH, 0o600); // 既存ファイルだった場合もパーミッションを締める

  const mode = (fs.statSync(OUT_PATH).mode & 0o777).toString(8);
  console.log('\n保存しました。');
  console.log(`  パス         : ${OUT_PATH}`);
  console.log(`  キー         : ${maskKey(key)}（${key.length}文字）`);
  console.log(`  パーミッション: ${mode}`);

  checkGitignore();

  console.log('\n次のコマンドで使えます:');
  console.log('  node scripts/post-sns-article.mjs --yes');
}

main().catch((err) => {
  console.error(`\nエラー: ${err.message}`);
  process.exit(1);
});
