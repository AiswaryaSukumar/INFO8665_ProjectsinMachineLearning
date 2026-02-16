"""
Storage Manager: Uploads final files to cloud storage or local storage
Location: src/voice-conversion/speech-to-text/storage_manager.py
"""
import logging
from pathlib import Path
from config.stt_config import STORAGE_TYPE, STORAGE_BUCKET, PROCESSED_DATA_DIR

logger = logging.getLogger(__name__)

class StorageManager:
    """Handles uploading files to cloud storage or local storage"""

    def __init__(self, storage_type=None):
        self.storage_type = storage_type or STORAGE_TYPE
        logger.info(f"[StorageManager] Initialized with storage type: {self.storage_type}")

        if self.storage_type == "s3":
            self._init_s3()
        elif self.storage_type == "azure":
            self._init_azure()
        elif self.storage_type == "gcs":
            self._init_gcs()
        else:
            logger.warning("[StorageManager] Using local storage (no cloud upload)")

    def _init_s3(self):
        """Initialize AWS S3 client"""
        try:
            import boto3
            from config.stt_config import AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, STORAGE_REGION

            self.s3_client = boto3.client(
                's3',
                aws_access_key_id=AWS_ACCESS_KEY_ID,
                aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
                region_name=STORAGE_REGION
            )
            logger.info("[StorageManager] S3 client initialized")
        except ImportError:
            logger.error("[StorageManager] boto3 not installed. Install with: pip install boto3")
            self.s3_client = None
        except Exception as e:
            logger.error(f"[StorageManager] Failed to initialize S3: {e}")
            self.s3_client = None

    def _init_azure(self):
        """Initialize Azure Blob Storage client"""
        logger.warning("[StorageManager] Azure Blob Storage not yet implemented")

    def _init_gcs(self):
        """Initialize Google Cloud Storage client"""
        logger.warning("[StorageManager] Google Cloud Storage not yet implemented")

    def upload_file(self, file_path: str, object_key: str) -> str:
        """
        Upload a file to cloud storage

        Args:
            file_path: Local file path
            object_key: Destination key/path in storage

        Returns:
            URL of uploaded file or local path if using local storage
        """
        if self.storage_type == "s3" and hasattr(self, 's3_client') and self.s3_client:
            return self._upload_to_s3(file_path, object_key)
        elif self.storage_type == "local":
            return self._copy_to_local_storage(file_path, object_key)
        else:
            logger.warning(f"[StorageManager] No upload performed for {file_path}")
            return file_path

    def _upload_to_s3(self, file_path: str, object_key: str) -> str:
        """Upload file to AWS S3"""
        try:
            self.s3_client.upload_file(
                file_path,
                STORAGE_BUCKET,
                object_key,
                ExtraArgs={'ServerSideEncryption': 'AES256'}
            )

            url = f"https://{STORAGE_BUCKET}.s3.amazonaws.com/{object_key}"
            logger.info(f"[StorageManager] Uploaded to S3: {url}")
            return url

        except Exception as e:
            logger.error(f"[StorageManager] S3 upload failed: {e}")
            return ""

    def _copy_to_local_storage(self, file_path: str, object_key: str) -> str:
        """Copy file to local storage directory (for development)"""
        import shutil

        local_storage = PROCESSED_DATA_DIR
        local_storage.mkdir(exist_ok=True)

        dest_path = local_storage / object_key
        dest_path.parent.mkdir(parents=True, exist_ok=True)

        shutil.copy2(file_path, dest_path)
        logger.info(f"[StorageManager] Copied to local storage: {dest_path}")
        return str(dest_path)

    def generate_object_key(self, session_id: str, file_type: str) -> str:
        """
        Generate a structured object key for storage

        Args:
            session_id: Session UUID
            file_type: 'audio' or 'transcript'

        Returns:
            Object key in format: YYYY/MM/session_id_type.ext
        """
        from datetime import datetime
        now = datetime.now()
        year = now.strftime("%Y")
        month = now.strftime("%m")

        extension = "wav" if file_type == "audio" else "json"
        object_key = f"{year}/{month}/{session_id}_{file_type}.{extension}"

        return object_key
