import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as cheerio from "cheerio";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const root = process.cwd();

export async function fetchAllReports() {
  const sources = JSON.parse(await readFile(join(root, "config", "sources.json"), "utf8"));
  const enabled = sources.filter((source) => source.enabled);
  const results = await Promise.allSettled(enabled.map(fetchReportSource));

  return results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const source = enabled[index];
    return {
      id: source.id,
      name: source.name,
      url: source.url,
      text: "",
      error: result.reason.message,
      fetchedAt: new Date().toISOString(),
    };
  });
}

async function fetchReportSource(source) {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "Mozilla/5.0 M4MiratradeAutomation/0.1",
      Accept: source.type === "pdf" ? "application/pdf,*/*" : "text/html,*/*",
    },
  });
  if (!response.ok) throw new Error(`${source.name}: ${response.status}`);

  const contentType = response.headers.get("content-type") || "";
  if (source.type === "pdf" || contentType.includes("pdf")) {
    const buffer = Buffer.from(await response.arrayBuffer());
    const parsed = await pdfParse(buffer);
    return cleanReport({ ...source, text: parsed.text });
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const pdfLink = findLikelyPdfLink($, source.url);
  if (pdfLink) {
    return fetchReportSource({ ...source, url: pdfLink, type: "pdf" });
  }

  $("script, style, nav, footer, header").remove();
  return cleanReport({ ...source, text: $("body").text() });
}

function findLikelyPdfLink($, baseUrl) {
  const links = [];
  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    const label = $(element).text();
    if (!href) return;
    const haystack = `${href} ${label}`;
    if (!/pdf/i.test(haystack)) return;
    if (!/為替|外為|ドル|円|マーケット|Market|FX|comment/i.test(haystack)) return;
    links.push(new URL(href, baseUrl).toString());
  });
  return links[0] || null;
}

function cleanReport(report) {
  return {
    id: report.id,
    name: report.name,
    url: report.url,
    text: report.text.replace(/\s+/g, " ").trim().slice(0, 30000),
    fetchedAt: new Date().toISOString(),
  };
}
