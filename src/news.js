import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Parser from "rss-parser";

const parser = new Parser({ timeout: 12000 });

export async function fetchNewsItems() {
  const feeds = JSON.parse(await readFile(join(process.cwd(), "config", "news-feeds.json"), "utf8"));
  const settled = await Promise.allSettled(feeds.map((feed) => parser.parseURL(feed.url)));

  return settled
    .flatMap((result, index) => {
      if (result.status !== "fulfilled") return [];
      return result.value.items.map((item) => ({
        feed: feeds[index].name,
        title: item.title || "",
        content: stripHtml(item.contentSnippet || item.content || item.summary || ""),
        link: item.link || "",
        publishedAt: item.isoDate || item.pubDate || null,
      }));
    })
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, 30);
}

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
