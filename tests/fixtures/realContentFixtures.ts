import { deflateSync } from 'node:zlib';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

function writeUint32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value >>> 0, 0);
  return bytes;
}

function crc32(value: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBytes, Buffer.from(data)]);
  return Buffer.concat([writeUint32(data.byteLength), body, writeUint32(crc32(body))]);
}

function makeDeterministicRasterPng(width = 256, height = 256, seed = 0): Buffer {
  const scanlines = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 3);
    scanlines[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = rowStart + 1 + x * 3;
      scanlines[pixel] = (x * 5 + y * 3 + seed * 17) % 256;
      scanlines[pixel + 1] = (x * 2 + y * 7 + seed * 29) % 256;
      scanlines[pixel + 2] = (((x ^ y) * 11) + seed * 43) % 256;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export async function makeVectorTextHeavyPdf(pageCount = 120): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = pdf.addPage([595, 842]);
    for (let row = 0; row < 72; row += 1) {
      page.drawText(
        `Vector qualification page ${pageIndex + 1} row ${row} -- deterministic text payload 0123456789`,
        {
          x: 28 + (row % 4) * 2,
          y: 810 - row * 10,
          size: 8,
          font,
          color: rgb(0.08 + (row % 5) * 0.02, 0.12, 0.18),
        },
      );
    }
    for (let row = 0; row < 10; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        page.drawRectangle({
          x: 32 + column * 66,
          y: 34 + row * 34,
          width: 52,
          height: 22,
          borderWidth: 1,
          borderColor: rgb(0.2, 0.3, 0.4),
          color: rgb(0.86 + (column % 3) * 0.02, 0.88, 0.9),
        });
      }
    }
    for (let line = 0; line < 18; line += 1) {
      page.drawLine({
        start: { x: 24, y: 130 + line * 34 },
        end: { x: 570, y: 150 + line * 31 },
        thickness: 1.5,
        color: rgb(0.1, 0.2, 0.3),
      });
    }
  }

  return Buffer.from(await pdf.save({ useObjectStreams: true }));
}

export async function makeRasterScannedPdf(pageCount = 80): Promise<Buffer> {
  const pdf = await PDFDocument.create();

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = pdf.addPage([595, 842]);
    const image = await pdf.embedPng(makeDeterministicRasterPng(384, 384, pageIndex));
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        page.drawImage(image, {
          x: column * 198,
          y: row * 210,
          width: 198,
          height: 210,
        });
      }
    }
  }

  return Buffer.from(await pdf.save({ useObjectStreams: true }));
}
