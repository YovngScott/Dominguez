// Helpers para Cloudflare R2 (almacenamiento S3-compatible). Firma URLs
// prefirmadas para subir/leer/eliminar objetos sin exponer las credenciales en
// el navegador. Las credenciales viven en variables de entorno de Vercel.
import { AwsClient } from "aws4fetch";

export function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    ok: !!(accountId && accessKeyId && secretAccessKey && bucket),
  };
}

function client() {
  const { accessKeyId, secretAccessKey } = r2Config();
  return new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
}

function objectUrl(path) {
  const { accountId, bucket } = r2Config();
  const key = String(path)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
}

// URL prefirmada para SUBIR un objeto (PUT), válida por `expires` segundos.
export async function presignPut(path, expires = 3600) {
  const url = `${objectUrl(path)}?X-Amz-Expires=${expires}`;
  const signed = await client().sign(url, { method: "PUT", aws: { signQuery: true } });
  return signed.url;
}

// URL prefirmada para LEER un objeto (GET), válida por `expires` segundos.
export async function presignGet(path, expires = 3600) {
  const url = `${objectUrl(path)}?X-Amz-Expires=${expires}`;
  const signed = await client().sign(url, { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

// Elimina un objeto (server-side).
export async function deleteObject(path) {
  const res = await client().fetch(objectUrl(path), { method: "DELETE" });
  return res.ok || res.status === 404;
}
