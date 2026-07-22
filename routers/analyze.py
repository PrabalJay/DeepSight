import os
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException
from models.schemas import AnalysisResult, ReportResponse
from services.ai_pipeline import analyze_media
from services.report_generator import generate_forensic_report

router = APIRouter(
    prefix="/analyze",
    tags=["Analysis"]
)

def save_upload_file(upload_file: UploadFile) -> str:
    file_path = os.path.join("uploads", upload_file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)
    return file_path

@router.post("/media", response_model=AnalysisResult)
async def analyze_media_file(file: UploadFile = File(...)):
    """
    Upload an image, video, or audio file for deepfake detection.
    """
    content_type = file.content_type
    if not content_type.startswith(("image/", "video/", "audio/")):
        raise HTTPException(status_code=400, detail="Invalid file type. Must be image, video, or audio.")
        
    file_path = save_upload_file(file)
    file_type = content_type.split("/")[0]
    
    # Run AI analysis
    result = analyze_media(file_path, file_type)
    return result

@router.post("/report/{file_id}", response_model=ReportResponse)
async def generate_report(file_id: str, result: AnalysisResult):
    """
    Generate a PDF forensic report based on a previous analysis result.
    """
    report_url = generate_forensic_report(result)
    return ReportResponse(file_id=file_id, report_url=report_url)
