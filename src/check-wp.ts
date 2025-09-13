import "dotenv/config";

import qs from "qs";
import path from "path";
import axios from "axios";
import crypto from "crypto";
import fs from "fs/promises";
import * as cheerio from "cheerio";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";

import { notify } from "./notify";
import { logify } from "./logify";
import { PdfMeta } from "./types";

const BASE = process.env.BASE_URL!;
const PAGE = process.env.PAGE_URL!;
const PASS = process.env.PAGE_PASSWORD!;
const SNAPSHOT = path.resolve(process.cwd(), process.env.SNAPSHOT_FILE!);
const DATA_PATH = path.dirname(SNAPSHOT);

const sha256 = (str: string) => {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
};

const head = async (
  client: ReturnType<typeof wrapper>,
  url: string
): Promise<Partial<PdfMeta>> => {
  try {
    const r = await client.head(url, { validateStatus: () => true });
    const etag = r.headers["etag"] ?? undefined;
    const lastModified = r.headers["last-modified"] ?? undefined;
    const length = r.headers["content-length"]
      ? Number(r.headers["content-length"])
      : undefined;

    return {
      etag,
      lastModified,
      length,
    };
  } catch {
    return {};
  }
};

(async () => {
  if (!BASE || !PAGE || !PASS)
    throw new Error("Missing env: BASE_URL, PAGE_URL, PAGE_PASSWORD");

  const jar = new CookieJar();
  const client = wrapper(
    axios.create({ baseURL: BASE, jar, withCredentials: true })
  );

  // 1) Set wp-postpass_* cookie
  await client.post(
    "/wp-login.php?action=postpass",
    qs.stringify({ post_password: PASS, redirect_to: PAGE }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 400,
    }
  );

  // 2) Fetch protected page
  const { data: html } = await client.get(PAGE, { responseType: "text" });

  // 3) Extract PDFs
  const $ = cheerio.load(html);
  const found: PdfMeta[] = [];

  $('a[href$=".pdf"], a[href*=".pdf?"]').each((_, a) => {
    const href = $(a).attr("href");

    if (!href) return;

    const absoluteUrl = href.startsWith("http")
      ? href
      : new URL(href, PAGE).toString();
    const text = $(a).attr("aria-label")?.trim() || undefined;

    if (!found.some((f: PdfMeta) => f.url === absoluteUrl))
      found.push({ url: absoluteUrl, text: text });
  });

  // 4) Optional HEAD probes
  const newPdfs: PdfMeta[] = [];
  for (const it of found)
    newPdfs.push({ ...it, ...(await head(client, it.url)) });

  let prevFiles: PdfMeta[] = [];

  try {
    const raw = await fs.readFile(SNAPSHOT, "utf8");
    if (raw.trim()) {
      const parsed = JSON.parse(raw);
      prevFiles = Array.isArray(parsed.files) ? parsed.files : [];
    }
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
  }

  const changedPdfs: PdfMeta[] = [];

  for (const newPdf of newPdfs)
    if (prevFiles.some((prev) => prev.url === newPdf.url)) {
      const previousPdf = prevFiles.find((prev) => prev.url === newPdf.url);

      if (!previousPdf) continue;

      const previousPdfDate = new Date(previousPdf.lastModified!);
      const newPdfDate = new Date(newPdf.lastModified!);

      if (previousPdfDate != newPdfDate && previousPdfDate < newPdfDate)
        changedPdfs.push(newPdf);
    } else {
      changedPdfs.push(newPdf);
    }

  if (changedPdfs.length > 0) {
    await notify(changedPdfs, PAGE);
    await fs.mkdir(DATA_PATH, { recursive: true });
    await fs.writeFile(
      SNAPSHOT,
      JSON.stringify(
        { lastChecked: new Date().toISOString(), files: newPdfs },
        null,
        2
      )
    );
    console.log("Change detected → snapshot updated");
  } else {
    await fs.writeFile(
      SNAPSHOT,
      JSON.stringify(
        { lastChecked: new Date().toLocaleString(), files: prevFiles },
        null,
        2
      )
    );
    console.log("No change.");
  }

  await logify(newPdfs, PAGE);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
