import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();

const s3Client = new S3Client({
  endpoint: process.env.WASABI_ENDPOINT,
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.WASABI_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.WASABI_AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

export default s3Client;
