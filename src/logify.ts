import { PdfMeta } from "./types";
import { chunkRows, fmtBytes, fmtDate, label } from "./util";

export const logify = async (files: PdfMeta[], pageUrl?: string) => {
  const webhook = process.env.DISCORD_LOG_WEBHOOK_URL!;
  const groups = chunkRows(files, 15);

  const embeds = groups.map((g) => {
    const names = g.map(label).join("\n") || "\u200B";
    const eTags = g.map((f) => f.etag).join("\n");
    const sizes =
      g.map((f) => fmtBytes(f.length) || "—").join("\n") || "\u200B";
    const dates =
      g.map((f) => fmtDate(f.lastModified) || "—").join("\n") || "\u200B";
    return {
      title: "PDF fetch result",
      url: pageUrl,
      color: 0x57f287,
      fields: [
        { name: "Name", value: names, inline: true },
        { name: "eTag", value: eTags, inline: true },
        { name: "Size", value: sizes, inline: true },
        { name: "Last Modified", value: dates, inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: "Noemi's slave ♥️" },
    };
  });

  // Send (Discord allows up to 10 embeds per message)
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds, allowed_mentions: { parse: [] } }),
  });
  if (!res.ok)
    console.error("Discord webhook failed:", res.status, await res.text());
};
