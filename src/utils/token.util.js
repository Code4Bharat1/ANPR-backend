import jwt from "jsonwebtoken";

export const generateAccessToken = (payload) =>
  jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
  });

export const generateRefreshToken = (payload) =>
  jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
  });

export const verifyRefresh = (token) =>
  jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
