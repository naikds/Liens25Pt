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

    const html = await page.content();

    const css = await page.evaluate(() => {
      const styles = [];
      document.querySelectorAll("style").forEach(style => {
        styles.push(style.innerHTML);
      });

      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      return { styles, links: links.map(l => l.href) };
    });

    await browser.close();

    res.json({ html, css });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch page" });
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
