// Minimal parquet reading via hyparquet (pure JS, no native deps).
// The official data pipeline writes snappy-compressed parquet (pyarrow default);
// hyparquet-compressors provides the codecs.
import fs from 'node:fs';
import { parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

export async function readParquet<T = Record<string, unknown>>(file: string): Promise<T[]> {
  const buf = fs.readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return (await parquetReadObjects({
    file: ab,
    compressors,
  })) as T[];
}
