import { readFile } from "fs/promises";
import sharp from "sharp";
const { applyLUT } = require('./build/Release/lut3d');

async function readLUTFile(file: string): Promise<{ width: Number, data: Number[][] }> {
  const fileData = await readFile(file);
  const contents = fileData.toString('utf8');
  const lines = contents.split('\n');
  const res = {
    width: 0,
    data: [] as Number[][],
    title: ''
  };
  for (const line of lines) {
    if (line.startsWith('LUT_3D_SIZE')) {
      res.width = parseInt(line.split(' ').pop()!);
    } else if (line.startsWith('TITLE')) {

      res.title = line.split(' ').pop()!;
    }
    else if (!isNaN(parseFloat(line))) {
      res.data.push(line.split(' ').map(parseFloat));
    }
  }
  return res;
}

async function run(): Promise<void> {
  console.time('decode');
  const fileData = await readFile(
    'test/original.jpeg'
  );
  const lut = await readLUTFile('test/Arabica 12.CUBE');
  const s = sharp(fileData, {
    limitInputPixels: false,
    failOnError: false,
  })
    .withMetadata()
    .rotate();
  const meta = await s.metadata();
  const updated = await s.raw().toBuffer({ resolveWithObject: true });
  const data = await updated.data;
  console.timeEnd('decode');
  console.time('process');
  applyLUT(data, 3, lut.width, lut.data);
  console.timeEnd('process');

  console.time('encode');
  const s2 = sharp(updated.data, {
    limitInputPixels: false,
    raw: updated.info,
    failOnError: false,
  });
  await s2.jpeg().toFile('test/updated.jpeg');
  console.timeEnd('encode');
};

run();