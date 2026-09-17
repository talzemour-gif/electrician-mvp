-- Accept the HEIF MIME type used by some iPhone camera uploads.
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
where id = 'appointment-files';
