import dotenv from "dotenv";
dotenv.config(); // ⬅️ MUST BE AT TOP (before any import that uses env)

import express from "express";
import s3 from "../lib/wasabi.js";

export async function getUploadUrl({ fileName, fileType }) {
  const key = `uploads/${Date.now()}-${fileName}`;

  const params = {
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key: key,
    ContentType: fileType,
    Expires: 60,
  };

  const uploadURL = await s3.getSignedUrlPromise(
    "putObject",
    params
  );

  return { uploadURL, fileKey: key };
}

export async function getDownloadUrl(key) {
  const params = {
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key: key,
    Expires: 300,
  };

  return s3.getSignedUrlPromise("getObject", params);
}
