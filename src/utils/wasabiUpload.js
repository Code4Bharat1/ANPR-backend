import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import s3Client from '../lib/wasabi.js';
export async function getUploadUrl({ fileName, fileType }) {
  const key = `uploads/${Date.now()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key: key,
    ContentType: fileType,
    ACL: 'private',
  });

  const uploadURL = await getSignedUrl(
    s3Client,
    command,
    { expiresIn: 300 }
  );

  return { uploadURL, fileKey: key };
}


export async function getDownloadUrl(key) {
  const command = new GetObjectCommand({
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, {
    expiresIn: 600,
  });
}
