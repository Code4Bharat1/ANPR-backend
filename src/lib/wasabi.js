import AWS from "aws-sdk";
import dotenv from "dotenv";

dotenv.config();
console.log("🔑 WASABI KEY:", process.env.WASABI_AWS_ACCESS_KEY_ID);

const s3 = new AWS.S3({
  accessKeyId: process.env.WASABI_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.WASABI_AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
  endpoint: process.env.WASABI_ENDPOINT,
  signatureVersion: "v4",
  s3ForcePathStyle: true,
});

export default s3;
