import cloudinary, { isCloudinaryConfigured } from './cloudinary.js';

export const uploadToCloudinary = (buffer, folder = 'lostlink/items', originalName = 'upload') => {
  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured) {
      return reject(new Error('Cloudinary credentials are not configured in environment variables.'));
    }

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'auto',
        use_filename: true,
        unique_filename: true,
        filename_override: originalName,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({
          url: result.secure_url || result.url,
          public_id: result.public_id,
        });
      }
    );

    stream.end(buffer);
  });
};
