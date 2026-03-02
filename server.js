const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const handlebars = require("handlebars");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// public フォルダを静的配信
app.use(express.static(path.join(__dirname, "public")));

// Handlebars を使うための簡易レンダラー
function render(templatePath, params = {}) {
  const template = fs.readFileSync(templatePath, "utf8");
  const compiled = handlebars.compile(template);
  return compiled(params);
}

// SEO データ
const seo = require("./src/seo.json");
if (seo.url === "glitch-default") {
  seo.url = `https://${process.env.PROJECT_DOMAIN}`;
}

// -----------------------------
// ① Puppeteer API (/fetch)
// -----------------------------
app.post("/fetch", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });

    // HTML を取得
    let html = await page.content();

    // CSS を取得
    const css = await page.evaluate(() => {
      const styles = [];
      document.querySelectorAll("style").forEach(style => {
        styles.push(style.innerHTML);
      });

      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      return { styles, links: links.map(l => l.href) };
    });

    // Puppeteer 終了
    await browser.close();

// -----------------------------
// 画像を base64 に変換する処理
// -----------------------------
const cheerio = require("cheerio");
const fetch = require("node-fetch"); // ← 追加

const $ = cheerio.load(html);
const imgs = $("img");

for (const img of imgs.toArray()) {
  const src = $(img).attr("src");
  if (!src) continue;

  try {
    // 絶対 URL に変換
    const absoluteUrl = new URL(src, url).href;

    // サーバー側で画像を取得
    const response = await fetch(absoluteUrl);
    if (!response.ok) throw new Error("Image fetch failed");

    const buffer = await response.buffer();
    const base64 = buffer.toString("base64");

    const mime = response.headers.get("content-type") || "image/png";

    // src を base64 に置き換え
    $(img).attr("src", `data:${mime};base64,${base64}`);
  } catch (err) {
    console.error("Image convert failed:", src, err);
  }
}

html = $.html();


    res.json({ html, css });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch" });
  }
});

// -----------------------------
// ② 元の Fastify のページを Express で再現
// -----------------------------

// Home
app.get("/", (req, res) => {
  let params = { seo };

  if (req.query.randomize) {
    const colors = require("./src/colors.json");
    const allColors = Object.keys(colors);
    const currentColor = allColors[(allColors.length * Math.random()) << 0];

    params = {
      color: colors[currentColor],
      colorError: null,
      seo
    };
  }

  const html = render("./src/pages/index.hbs", params);
  res.send(html);
});

// tictactoe
app.get("/tictactoe", (req, res) => {
  let params = { seo };

  if (req.query.randomize) {
    const colors = require("./src/colors.json");
    const allColors = Object.keys(colors);
    const currentColor = allColors[(allColors.length * Math.random()) << 0];

    params = {
      color: colors[currentColor],
      colorError: null,
      seo
    };
  }

  const html = render("./src/pages/tictactoe_move.hbs", params);
  res.send(html);
});

// POST /
app.post("/", (req, res) => {
  let params = { seo };
  let color = req.body.color;

  if (color) {
    const colors = require("./src/colors.json");
    color = color.toLowerCase().replace(/\s/g, "");

    if (colors[color]) {
      params = {
        color: colors[color],
        colorError: null,
        seo
      };
    } else {
      params = {
        colorError: req.body.color,
        seo
      };
    }
  }

  const html = render("./src/pages/index.hbs", params);
  res.send(html);
});

app.get("/htmlCssOnly", (req, res) => {
  let params = { seo };

  if (req.query.randomize) {
    const colors = require("./src/colors.json");
    const allColors = Object.keys(colors);
    const currentColor = allColors[(allColors.length * Math.random()) << 0];

    params = {
      color: colors[currentColor],
      colorError: null,
      seo
    };
  }

  const html = render("./src/pages/htmlCssOnly.hbs", params);
  res.send(html);
});

// -----------------------------
// ③ サーバー起動
// -----------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
