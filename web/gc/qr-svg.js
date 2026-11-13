// QR code as SVG text, with the vendored qrcode-generator (vendor/qrcode.js, MIT). Whole pixels per square
// so it stays sharp; about 315 px wide, big enough for a phone to scan from about 50 cm.
const QUIET = 4;   // white squares around the code, as the QR standard asks

export function createQrSvg(qrcode, { sizePx = 320 } = {}) {
  return (text) => {
    const qr = qrcode(0, "M");   // 0: the smallest QR that fits; M: still reads with 15% damaged
    qr.addData(text);
    qr.make();
    const cellSize = Math.max(4, Math.round(sizePx / (qr.getModuleCount() + QUIET * 2)));
    return qr.createSvgTag({ cellSize, margin: cellSize * QUIET });
  };
}
