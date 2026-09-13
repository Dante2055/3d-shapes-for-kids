import { chromium } from "./utils/get-playwright.mjs";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.resolve(__dirname, "..");
const PORT = 4195;

const server = http.createServer((req, res) => {
  const filePath = path.join(BASE_DIR, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mime = ext === ".html" ? "text/html" : ext === ".js" || ext === ".mjs" ? "text/javascript" : ext === ".css" ? "text/css" : ext === ".svg" ? "image/svg+xml" : "text/plain";
    res.writeHead(200, { "Content-Type": mime });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, async () => {
  console.log(`Icon correspondence test server running on http://127.0.0.1:${PORT}`);
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}`);
    await page.waitForTimeout(600);

    const shapes = [
      { key: "cube", name: "正方体", theme: "lavender" },
      { key: "box", name: "长方体", theme: "blue" },
      { key: "cylinder", name: "圆柱", theme: "mint" },
      { key: "cone", name: "圆锥", theme: "peach" },
      { key: "pyramid", name: "四棱锥", theme: "sand" },
      { key: "prism", name: "三棱柱", theme: "lavender" },
      { key: "hexPrism", name: "六棱柱", theme: "peach" },
      { key: "tetra", name: "四面体", theme: "mint" },
      { key: "sphere", name: "球体", theme: "blue" },
      { key: "ellipsoid", name: "椭圆体", theme: "mint" },
      { key: "torus", name: "圆环", theme: "rose" },
      { key: "capsule", name: "胶囊", theme: "sand" },
      { key: "octa", name: "八面体", theme: "blue" },
      { key: "dodeca", name: "十二面体", theme: "lavender" },
      { key: "icosa", name: "二十面体", theme: "mint" },
      { key: "biconic", name: "双锥", theme: "peach" },
    ];

    console.log("\n=== 1. Checking 1:1 correspondence for all 16 shapes in Dock & Bottom Card ===");
    for (const shape of shapes) {
      // Click dock item
      const dockBtn = await page.$(`.dock-item[data-shape="${shape.key}"] .shape-select`);
      if (!dockBtn) throw new Error(`Dock button not found for shape: ${shape.key}`);
      await dockBtn.click();
      await page.waitForTimeout(50);

      // Verify dock icon theme and SVG
      const dockInfo = await page.evaluate((key) => {
        const item = document.querySelector(`.dock-item[data-shape="${key}"]`);
        const iconSpan = item.querySelector(".dock-icon");
        const svg = iconSpan.querySelector("svg");
        return {
          themeClass: Array.from(iconSpan.classList).filter(c => c !== "dock-icon")[0],
          svgHtml: svg ? svg.innerHTML.trim() : "",
        };
      }, shape.key);

      // Verify bottom island icon badge
      const islandInfo = await page.evaluate(() => {
        const badge = document.getElementById("islandShapeIcon");
        const name = document.getElementById("islandName").textContent.trim();
        const svg = badge ? badge.querySelector("svg") : null;
        return {
          badgeClass: badge ? Array.from(badge.classList).filter(c => c !== "island-icon-badge")[0] : null,
          name,
          svgHtml: svg ? svg.innerHTML.trim() : "",
          isEmojiVisible: (() => {
            const el = document.getElementById("islandEmoji");
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.display !== "none" && style.visibility !== "hidden";
          })(),
        };
      });

      if (islandInfo.name !== shape.name) {
        throw new Error(`Shape name mismatch for ${shape.key}: expected "${shape.name}", got "${islandInfo.name}"`);
      }
      if (islandInfo.badgeClass !== shape.theme) {
        throw new Error(`Island badge theme mismatch for ${shape.key}: expected "${shape.theme}", got "${islandInfo.badgeClass}"`);
      }
      if (dockInfo.themeClass !== shape.theme) {
        throw new Error(`Dock icon theme mismatch for ${shape.key}: expected "${shape.theme}", got "${dockInfo.themeClass}"`);
      }
      if (islandInfo.svgHtml !== dockInfo.svgHtml) {
        throw new Error(`Island SVG does not match dock SVG for ${shape.key}!\nIsland: ${islandInfo.svgHtml}\nDock: ${dockInfo.svgHtml}`);
      }
      if (islandInfo.isEmojiVisible) {
        throw new Error(`Emoji element should be hidden for ${shape.key}`);
      }
      console.log(`✓ ${shape.name} (${shape.key}): Dock theme [${dockInfo.themeClass}] == Bottom Card theme [${islandInfo.badgeClass}], SVGs match 100%!`);
    }

    console.log("\n=== 2. Detailed Wireframe Verifications ===");
    // Prism: verify 3D triangular prism
    const prismSvg = await page.evaluate(() => {
      const icon = document.querySelector(`.dock-item[data-shape="prism"] .dock-icon svg`);
      return icon ? icon.outerHTML : "";
    });
    if (!prismSvg.includes("polygon points=\"4,5 20,5 12,9\"") || !prismSvg.includes("M4 5v11l8 4 8-4V5M12 9v11")) {
      throw new Error(`Prism SVG is not the accurate 3D triangular prism wireframe! Got: ${prismSvg}`);
    }
    console.log("✓ Prism (三棱柱) wireframe is 3D triangular prism (top triangle + 3 vertical pillars + bottom base)!");

    // Tetra: verify 3D regular tetrahedron
    const tetraSvg = await page.evaluate(() => {
      const icon = document.querySelector(`.dock-item[data-shape="tetra"] .dock-icon svg`);
      return icon ? icon.outerHTML : "";
    });
    if (!tetraSvg.includes("polygon points=\"12,3 3,17 12,21 21,17\"") || !tetraSvg.includes("x1=\"12\" y1=\"3\" x2=\"12\" y2=\"21\"")) {
      throw new Error(`Tetra SVG is not the accurate 3D tetrahedron wireframe! Got: ${tetraSvg}`);
    }
    console.log("✓ Tetra (四面体) wireframe is 3D tetrahedron (apex + triangular base + center ridge)!");

    // Ellipsoid: verify 3D equator arc
    const ellipsoidSvg = await page.evaluate(() => {
      const icon = document.querySelector(`.dock-item[data-shape="ellipsoid"] .dock-icon svg`);
      return icon ? icon.outerHTML : "";
    });
    if (!ellipsoidSvg.includes("M6 12c0 1.8 2.7 3.2 6 3.2s6-1.4 6-3.2")) {
      throw new Error(`Ellipsoid SVG is missing 3D equator arc! Got: ${ellipsoidSvg}`);
    }
    console.log("✓ Ellipsoid (椭圆体) wireframe has 3D curved equator arc!");

    console.log("\n=== 3. Testing Object List in Inspector ===");
    // Click dock item for 三棱柱
    await (await page.$(`.dock-item[data-shape="prism"] .shape-select`)).click();
    await page.waitForTimeout(50);
    // Add 三棱柱 and 球体
    const addPrismBtn = await page.$(`.dock-item[data-shape="prism"] .quick-add-btn`);
    await addPrismBtn.click();
    await page.waitForTimeout(100);

    const addSphereBtn = await page.$(`.dock-item[data-shape="sphere"] .quick-add-btn`);
    await addSphereBtn.click();
    await page.waitForTimeout(100);

    const objItems = await page.evaluate(() => {
      const items = document.querySelectorAll("#objList .obj-item-apple");
      return Array.from(items).map(item => {
        const btn = item.querySelector(".object-select");
        const badge = btn.querySelector(".obj-mini-badge");
        const svg = badge ? badge.querySelector("svg") : null;
        return {
          text: btn.textContent.trim(),
          badgeClass: badge ? badge.className : null,
          hasSvg: !!svg,
          rawHtml: btn.innerHTML,
        };
      });
    });
    console.log("Inspector Object Items:", JSON.stringify(objItems, null, 2));

    if (objItems.length < 3) throw new Error(`Expected at least 3 objects in list, got ${objItems.length}`);
    if (!objItems[0].badgeClass.includes("lavender") || !objItems[0].hasSvg) {
      throw new Error("Object 0 (正方体) does not have lavender mini SVG badge!");
    }
    if (!objItems[1].badgeClass.includes("lavender") || !objItems[1].hasSvg) {
      throw new Error("Object 1 (三棱柱) does not have lavender mini SVG badge!");
    }
    if (!objItems[2].badgeClass.includes("blue") || !objItems[2].hasSvg) {
      throw new Error("Object 2 (球体) does not have blue mini SVG badge!");
    }
    if (objItems[0].rawHtml.includes("💎") || objItems[1].rawHtml.includes("💎") || objItems[2].rawHtml.includes("⚽")) {
      throw new Error("Object list still contains mismatched emojis!");
    }
    console.log("✓ Object list in inspector renders matching mini SVG badges without mismatched emojis!");

    // Capture screenshot of 三棱柱 selected showing matching bottom card
    await (await page.$(`.dock-item[data-shape="prism"] .shape-select`)).click();
    await page.waitForTimeout(150);

    const artifactDir = path.join(BASE_DIR, "output", "playwright");
    if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactDir, "icon-correspondence-prism.png") });
    console.log("✓ Screenshot saved to output/playwright/icon-correspondence-prism.png");

    console.log("\nALL ICON CORRESPONDENCE CHECKS PASSED 100%!");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
