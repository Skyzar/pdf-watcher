import { PdfMeta } from "./types";

export const fmtBytes = (n?: number) => {
  if (!n) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
};

export const fmtDate = (s?: string) => {
  if (!s) return "";
  return (
    "`" +
    new Date(s).toLocaleString("de-DE", {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) +
    "`"
  );
};

export const label = (f: PdfMeta) => {
  const name =
    f.text?.trim() ||
    decodeURIComponent(new URL(f.url).pathname.split("/").pop() || f.url);
  return `[${name}](${f.url})`;
};

export const chunkRows = <T>(rows: T[], maxRows = 15) => {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += maxRows)
    chunks.push(rows.slice(i, i + maxRows));
  return chunks;
};
