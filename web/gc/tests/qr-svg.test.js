import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { createQrSvg } from "../qr-svg.js";

// the vendored file is a plain browser script: run it the way a <script> tag would
const page = {};
vm.runInNewContext(readFileSync(new URL("../vendor/qrcode.js", import.meta.url), "utf8"), page);
const makeQr = createQrSvg(page.qrcode);
const LINK = "https://moayadabdo.github.io/TestHUDmap/web/hud/?mode=sim&room=K7Q2XM";

test("an SVG with whole-pixel squares, about 320 px wide", () => {
  const svg = makeQr(LINK);
  assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  const size = Number(/width="(\d+)px"/.exec(svg)[1]);
  assert.ok(size >= 280 && size <= 360, `size ${size}`);
  const qr = page.qrcode(0, "M"); qr.addData(LINK); qr.make();
  assert.equal(size % (qr.getModuleCount() + 8), 0, "4 white squares each side, whole pixels");
});

test("the same link gives the same QR; another room gives another", () => {
  assert.equal(makeQr(LINK), makeQr(LINK));
  assert.notEqual(makeQr(LINK), makeQr(LINK.replace("K7Q2XM", "K7Q2XN")));
});

test("only the squares go in: no text from the link in the SVG", () => {
  assert.doesNotMatch(makeQr(LINK), /K7Q2XM|github|<title|<description/);
});
