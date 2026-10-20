/**
 * microCMS APIキーの解決（microcms-draft.mjs / post-sns-article.mjs 共通）
 *
 * 探索順:
 *   1. 環境変数 MICROCMS_API_KEY
 *   2. キーファイル .microcms-key（--key-file <path> で変更可 / gitignore 済み）
 *   3. 対話入力（非表示）… stdin が TTY の場合のみ
 *
 * キーは標準出力にもファイルにも平文で残しません（マスク表示のみ）。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';

export const DEFAULT_KEY_FILE = '.microcms-key';

/** argv から共通フラグを取り出す */
export function parseKeyArgs(argv) {
  const i = argv.indexOf('--key-file');
  return {
    assumeYes: argv.includes('--yes') || argv.includes('-y'),
    keyFileArg: i !== -1 ? argv[i + 1] : undefined,
  };
}

export function maskKey(key) {
  if (key.length <= 8) return '*'.repeat(key.length);
  return `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`;
}

function expandHome(p) {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

function readKeyFile(keyFileArg) {
  const target = expandHome(keyFileArg ?? DEFAULT_KEY_FILE);
  if (!fs.existsSync(target)) {
    if (keyFileArg) {
      console.error(`キーファイルが見つかりません: ${target}`);
      process.exit(1);
    }
    return undefined;
  }
  const key = fs.readFileSync(target, 'utf8').trim();
  if (!key) {
    console.error(`キーファイルが空です: ${target}`);
    process.exit(1);
  }
  return { key, source: `キーファイル ${target}` };
}

/** TTY のときだけ使える非表示入力 */
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
          resolve(buf.trim());
          return;
        }
        if (ch === '\u0003') { // Ctrl-C
          cleanup();
          stdout.write('\n');
          reject(new Error('入力が中断されました'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          buf = buf.slice(0, -1);
          continue;
        }
        if (ch >= ' ') buf += ch;
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

/**
 * @param {{assumeYes?: boolean, keyFileArg?: string, confirmLabel?: string}} opts
 * @returns {Promise<string>} APIキー
 */
export async function resolveApiKey({ assumeYes = false, keyFileArg, confirmLabel = '下書き投稿' } = {}) {
  const fromEnv = process.env.MICROCMS_API_KEY?.trim();
  const found = fromEnv
    ? { key: fromEnv, source: '環境変数 MICROCMS_API_KEY' }
    : readKeyFile(keyFileArg);

  const scriptPath = path.relative(process.cwd(), process.argv[1]);

  if (found) {
    console.log(`APIキーを検出しました（${found.source}）: ${maskKey(found.key)}`);

    if (assumeYes) return found.key;

    if (!process.stdin.isTTY) {
      console.error('\n確認プロンプトを表示できません（stdin が対話モードではありません）。');
      console.error('内容を確認のうえ、--yes を付けて実行してください:');
      console.error(`  node ${scriptPath} --yes`);
      process.exit(1);
    }

    const ok = await confirm(`このキーで${confirmLabel}しますか？ (y/N): `);
    if (ok) return found.key;
    console.log('中止しました。');
    process.exit(0);
  }

  console.log('環境変数 MICROCMS_API_KEY も キーファイルも見つかりませんでした。');

  if (!process.stdin.isTTY) {
    console.error('\nこの環境では非表示入力を受け付けられません（stdin が TTY ではありません）。');
    console.error('次のいずれかでキーを渡してください:');
    console.error(`  1) キーファイルを作る:  echo -n 'キー' > ${DEFAULT_KEY_FILE}   （.gitignore 済み）`);
    console.error(`     そのうえで:          node ${scriptPath} --yes`);
    console.error('  2) ターミナル.app など本物のターミナルで実行し、プロンプトに入力する');
    process.exit(1);
  }

  const typed = await promptHidden('microCMS APIキー（Write権限あり / 入力は非表示）: ');
  if (!typed) {
    console.error('APIキーが入力されませんでした。中止します。');
    process.exit(1);
  }
  return typed;
}
