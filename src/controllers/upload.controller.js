import {
  getUploadUrl,
  getDownloadUrl,
} from "../utils/wasabiUpload.js";

export const generateUploadUrl = async (req, res, next) => {
  try {
    const { fileName, fileType } = req.body;

    const data = await getUploadUrl({ fileName, fileType });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

export const generateGetUrl = async (req, res, next) => {
  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({ message: "Key required" });
    }

    const url = await getDownloadUrl(key);
    res.status(200).json({ url });
  } catch (err) {
    next(err);
  }
};
// Wasabi से signed URLs प्राप्त करने के लिए function
export const getSignedMediaUrl = async (fileKey) => {
  try {
    if (!fileKey) return null;
    
    // अगर पहले से URL है
    if (fileKey.startsWith('http')) return fileKey;
    
    const token = localStorage.getItem('accessToken');
    const response = await axios.get(`${API_URL}/api/upload/get-file`, {
      params: { key: fileKey },
      headers: { Authorization: `Bearer ${token}` }
    });
    
    return response.data.url;
  } catch (error) {
    console.error('Error getting signed URL:', error);
    return null;
  }
};