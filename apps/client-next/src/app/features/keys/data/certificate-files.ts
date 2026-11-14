/** Read a certificate as PEM, wrapping binary DER content in a certificate block. */
async function readCertificateFile(file: File): Promise<string> {
  const content = await file.arrayBuffer();
  const text = new TextDecoder().decode(content).trim();
  if (text.includes('-----BEGIN CERTIFICATE-----')) return text;
  let binary = '';
  for (const byte of new Uint8Array(content)) binary += String.fromCodePoint(byte);
  const base64 =
    btoa(binary)
      .match(/.{1,64}/g)
      ?.join('\n') ?? '';
  return `-----BEGIN CERTIFICATE-----\n${base64}\n-----END CERTIFICATE-----`;
}

/** The certificates of the selected files as one PEM chain, in the order selected. */
export async function readCertificateFiles(files: Iterable<File>): Promise<string> {
  return (await Promise.all(Array.from(files, readCertificateFile))).join('\n');
}
