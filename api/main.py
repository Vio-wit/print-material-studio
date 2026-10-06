from io import BytesIO

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ExifTags, UnidentifiedImageError

app = FastAPI(title="物料工坊本地服务", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

MAX_UPLOAD_BYTES = 30 * 1024 * 1024
EXIF_NAMES = {value: key for key, value in ExifTags.TAGS.items()}


@app.get("/api/health")
def health():
    return {"ok": True, "service": "print-material-studio"}


@app.post("/api/images/inspect")
async def inspect_image(file: UploadFile = File(...)):
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="图片超过 30 MB，请先缩小文件。")

    try:
        with Image.open(BytesIO(raw)) as image:
            exif = image.getexif()
            metadata = {EXIF_NAMES.get(key, str(key)): value for key, value in exif.items()}
            return {
                "filename": file.filename or "image",
                "format": image.format,
                "width": image.width,
                "height": image.height,
                "mode": image.mode,
                "camera": str(metadata.get("Model", "")),
                "make": str(metadata.get("Make", "")),
                "lens": str(metadata.get("LensModel", "")),
                "taken_at": str(metadata.get("DateTimeOriginal", metadata.get("DateTime", ""))),
            }
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="暂不支持识别此文件，请使用常见图片格式。")
