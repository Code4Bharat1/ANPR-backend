// // src/utils/wasabiUpload.js


// import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
// import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
// import s3Client from '../lib/wasabi.js';

// export async function getUploadUrl({ fileName, fileType }) {
//   const key = `uploads/${fileName}`;

//   const command = new PutObjectCommand({
//     Bucket: process.env.WASABI_BUCKET_NAME,
//     Key: key,
//     ContentType: fileType,
//     ACL: 'private',
//   });

//   const uploadURL = await getSignedUrl(
//     s3Client,
//     command,
//     { expiresIn: 300 }
//   );

//   return { uploadURL, fileKey: key };
// }


// export async function getDownloadUrl(key) {
//   const command = new GetObjectCommand({
//     Bucket: process.env.WASABI_BUCKET_NAME,
//     Key: key,
//   });

//   return await getSignedUrl(s3Client, command, {
//     expiresIn: 600,
//   });
// }
// export async function deleteFileFromWasabi(key) {
//   const command = new DeleteObjectCommand({
//     Bucket: process.env.WASABI_BUCKET_NAME,
//     Key: key,
//   });

//   await s3Client.send(command);
//   return true;
// }


// import {
//   GetObjectCommand,
//   PutObjectCommand,
//   DeleteObjectCommand,
// } from "@aws-sdk/client-s3";
// import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
// import s3Client from "../lib/wasabi.js";

/**
 * Generate signed upload URL
 */
// export async function getUploadUrl({
//   vehicleId, // number plate
//   type,      // entry | exit
//   index,     // 1–4 (photo) | undefined (video)
//   fileName,
//   fileType,
// }) {
//   const isVideo = fileType.startsWith("video");
//   const extension = fileName.split(".").pop();

//   const finalFileName = isVideo
//     ? `video.${extension}`
//     : `photo${index}.${extension}`;

//   const key = `uploads/${vehicleId}/${type}/${finalFileName}`;

//   const command = new PutObjectCommand({
//     Bucket: process.env.WASABI_BUCKET_NAME,
//     Key: key,
//     ContentType: fileType,
//     ACL: "private",
//   });

//   const uploadURL = await getSignedUrl(s3Client, command, {
//     expiresIn: 300, // 5 min
//   });

//   return {
//     uploadURL,
//     fileKey: key,
//   };
// }

/**
 * Generate signed download URL
 */
// export async function getDownloadUrl(key) {
//   const command = new GetObjectCommand({
//     Bucket: process.env.WASABI_BUCKET_NAME,
//     Key: key,
//   });

//   return await getSignedUrl(s3Client, command, {
//     expiresIn: 600, // 10 min
//   });
// }

/**
 * Delete file
 */
// export async function deleteFileFromWasabi(key) {
//   const command = new DeleteObjectCommand({
//     Bucket: process.env.WASABI_BUCKET_NAME,
//     Key: key,
//   });

//   await s3Client.send(command);
//   return true;
// }



import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import s3Client from "../lib/wasabi.js";

const BUCKET = process.env.WASABI_BUCKET;

export const getUploadUrl = async ({
  vehicleId,
  type,
  index,
  fileName,
  fileType,
}) => {
  const key = fileType.startsWith("video")
    ? `vehicles/${vehicleId}/${type}/video-${fileName}`
    : `vehicles/${vehicleId}/${type}/photo-${index}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: fileType,
  });

  const uploadURL = await getSignedUrl(s3Client, command, {
    expiresIn: 300, // 5 min
  });

  return {
    uploadURL,
    fileKey: key,
  };
};

export const getDownloadUrl = async (key) => {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn: 300 });
};

export const deleteFileFromWasabi = async (key) => {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  await s3Client.send(command);
};
