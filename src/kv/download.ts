import { MAX_DOWNLOAD_COUNT_PER_MONTH } from "../config.ts";
import kv from "./db.ts"
import {now, runInDenoDeploy} from "../utils/index.ts";
import {insertDownloadRecords} from "../database/download.ts";
import type { Credential } from "./credential.ts";


interface DownloadSecret {
  bookId: string;
  chapterUids: number[];
}

/**
 * 检查下载量是否超过限额
 * @param credential
 */
export async function checkDownloadCount(credential: Credential) {
  const entry = await kv.get<number>(["download", credential.vid]);
  return (!entry.value || entry.value < MAX_DOWNLOAD_COUNT_PER_MONTH);
}

/**
 * 增加下载量
 * @param credential
 * @param bookId
 */
export async function incrementDownloadCount(credential: Credential, bookId: string) {
  await kv.atomic().sum(["download", credential.vid], 1n).commit();

  // 如果是运行在 Deno Deploy 上面，则记录下载的书
  if (runInDenoDeploy()) {
    await insertDownloadRecords([{
      vid: credential.vid.toString(),
      book_id: bookId,
      timestamp: now(),
    }])
  }
}

/**
 * 生成临时下载凭证
 * @param credential
 * @param bookId
 * @param chapterUids
 */
export async function newDownloadSecret(
  credential: Credential,
  bookId: string,
  chapterUids: number[],
) {
  const secret = crypto.randomUUID();
  const payload: DownloadSecret = {
    bookId: bookId,
    chapterUids: chapterUids,
  }
  await kv.set(["download", credential.token, secret], payload, {
    expireIn: 1000 * 60 * 5, // 5分钟有效
  });
  return secret;
}



/**
 * 使用下载凭证，有效期内(5分钟)可重复使用
 * @param credential
 * @param secret
 */
export async function useSecret(
  credential: Credential,
  secret: string,
): Promise<[boolean, string, number[]]> {
  const entry = await kv.get<DownloadSecret>(["download", credential.token, secret]);
  if (entry.value) {
    return [true, entry.value.bookId, entry.value.chapterUids];
  }
  return [false, "", []];
}
