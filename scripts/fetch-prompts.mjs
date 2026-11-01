import fetch from "node-fetch";
import fs from "fs/promises";
import { parse as parseCsv } from "csv-parse/sync";

const RAW_FILE_URL = "https://raw.githubusercontent.com/";

const RAW_CN_URL = "PlexPt/awesome-chatgpt-prompts-zh/main/prompts-zh.json";
const CN_URL = RAW_FILE_URL + RAW_CN_URL;
const RAW_TW_URL = "PlexPt/awesome-chatgpt-prompts-zh/main/prompts-zh-TW.json";
const TW_URL = RAW_FILE_URL + RAW_TW_URL;
const RAW_EN_URL = "f/awesome-chatgpt-prompts/main/prompts.csv";
const EN_URL = RAW_FILE_URL + RAW_EN_URL;
const FILE = "./public/prompts.json";
const MAX_COUNT = 100;

const ignoreWords = ["涩涩", "魅魔", "澀澀"];

const timeoutPromise = (timeout) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(new Error("Request timeout"));
    }, timeout);
  });
};

async function fetchCN() {
  console.log("[Fetch] fetching cn prompts...");
  try {
    const response = await Promise.race([fetch(CN_URL), timeoutPromise(5000)]);
    const raw = await response.json();
    return raw
      .map((v) => [v.act, v.prompt])
      .filter(
        (v) =>
          v[0] &&
          v[1] &&
          ignoreWords.every((w) => !v[0].includes(w) && !v[1].includes(w)),
      )
      .slice(0, MAX_COUNT);
  } catch (error) {
    console.error("[Fetch] failed to fetch cn prompts", error);
    return [];
  }
}

async function fetchTW() {
  console.log("[Fetch] fetching tw prompts...");
  try {
    const response = await Promise.race([fetch(TW_URL), timeoutPromise(5000)]);
    const raw = await response.json();
    return raw
      .map((v) => [v.act, v.prompt])
      .filter(
        (v) =>
          v[0] &&
          v[1] &&
          ignoreWords.every((w) => !v[0].includes(w) && !v[1].includes(w)),
      )
      .slice(0, MAX_COUNT);
  } catch (error) {
    console.error("[Fetch] failed to fetch tw prompts", error);
    return [];
  }
}

async function fetchEN() {
  console.log("[Fetch] fetching en prompts...");
  try {
    // const raw = await (await fetch(EN_URL)).text();
    const response = await Promise.race([fetch(EN_URL), timeoutPromise(5000)]);
    const raw = await response.text();
    const records = parseCsv(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
    });
    return records
      .map((row) => [row.act, row.prompt])
      .filter(([act, prompt]) => act && prompt)
      .slice(0, MAX_COUNT);
  } catch (error) {
    console.error("[Fetch] failed to fetch en prompts", error);
    return [];
  }
}

async function main() {
  Promise.all([fetchCN(), fetchTW(), fetchEN()])
    .then(([cn, tw, en]) => {
      fs.writeFile(FILE, JSON.stringify({ cn, tw, en }, null, 2));
    })
    .catch((e) => {
      console.error("[Fetch] failed to fetch prompts");
      fs.writeFile(FILE, JSON.stringify({ cn: [], tw: [], en: [] }, null, 2));
    })
    .finally(() => {
      console.log("[Fetch] saved to " + FILE);
    });
}

main();
